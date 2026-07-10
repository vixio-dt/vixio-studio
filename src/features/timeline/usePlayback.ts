import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type Playback = {
  index: number;
  playing: boolean;
  /**
   * Continuous elapsed time across the whole cut, in seconds. Advances
   * smoothly during playback (driven by requestAnimationFrame) and freezes
   * on pause; the single authoritative clock the transport and the progress
   * bar read.
   */
  elapsedSeconds: number;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (index: number) => void;
};

/** A dialogue clip pinned to its shot's start offset on the cut timeline. */
export type MixCue = {
  /** Object URL of the dialogue asset. */
  url: string;
  /** Start offset from the top of the cut, in seconds. */
  at: number;
};

/** A music or ambience bed looped for the whole cut. */
export type MixLoop = {
  id: string;
  /** Object URL of the track asset. */
  url: string;
  /** 0..1 playback gain. */
  gain: number;
  muted: boolean;
};

export type PlaybackMix = {
  cues: readonly MixCue[];
  loops: readonly MixLoop[];
  /** Stage start offset of each entry, aligned with `timings`. */
  offsets: readonly number[];
  /** Total stage time of the cut in seconds. */
  totalSeconds: number;
  /** Master gain for the dialogue lane, 0..1; defaults to 1 when unset. */
  dialogueGain: number;
};

const EMPTY_MIX: PlaybackMix = {
  cues: [],
  loops: [],
  offsets: [],
  totalSeconds: 0,
  dialogueGain: 1,
};

/**
 * Live WebAudio graph for the preview mix. Sources are throwaway; buffers are
 * cached per url so a rebuild is just node wiring. The visual clock stays the
 * master: every entry change reschedules the graph from that entry's offset,
 * so audio resynchronizes to the stage at each cut.
 */
type AudioEngine = {
  context: AudioContext | null;
  nodes: AudioScheduledSourceNode[];
  loopGains: Map<string, GainNode>;
  /** Shared gain stage every dialogue cue routes through. */
  dialogueGain: GainNode | null;
  buffers: Map<string, Promise<AudioBuffer>>;
  /** Bumped to invalidate in-flight async schedules. */
  generation: number;
};

const createEngine = (): AudioEngine => ({
  context: null,
  nodes: [],
  loopGains: new Map(),
  dialogueGain: null,
  buffers: new Map(),
  generation: 0,
});

const stopEngineNodes = (engine: AudioEngine): void => {
  engine.generation += 1;
  for (const node of engine.nodes) {
    try {
      node.stop();
    } catch {
      // Nodes that never started throw; nothing to stop.
    }
    node.disconnect();
  }
  engine.nodes = [];
  for (const gain of engine.loopGains.values()) gain.disconnect();
  engine.loopGains.clear();
  engine.dialogueGain?.disconnect();
  engine.dialogueGain = null;
};

const loadBuffer = (
  engine: AudioEngine,
  context: AudioContext,
  url: string,
): Promise<AudioBuffer> => {
  const cached = engine.buffers.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then((response) => response.arrayBuffer())
    .then((data) => context.decodeAudioData(data));
  engine.buffers.set(url, pending);
  pending.catch(() => engine.buffers.delete(url));
  return pending;
};

/**
 * Builds and starts the graph for a playhead position. Buffers may need a
 * decode first; the schedule compensates with the elapsed context time so
 * cues stay pinned to where the visual clock already is.
 */
const scheduleMix = async (
  engine: AudioEngine,
  mix: PlaybackMix,
  offsetSeconds: number,
): Promise<void> => {
  if (mix.totalSeconds <= 0) return;
  if (mix.cues.length === 0 && mix.loops.length === 0) return;
  engine.context ??= new AudioContext();
  const context = engine.context;
  if (context.state === "suspended") {
    await context.resume().catch(() => undefined);
  }

  stopEngineNodes(engine);
  const generation = engine.generation;
  const anchor = context.currentTime;

  const urls = new Set<string>();
  for (const cue of mix.cues) urls.add(cue.url);
  for (const loop of mix.loops) urls.add(loop.url);
  const decoded = new Map<string, AudioBuffer>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        decoded.set(url, await loadBuffer(engine, context, url));
      } catch {
        // An undecodable asset just stays silent.
      }
    }),
  );
  if (engine.generation !== generation) return;

  const now = context.currentTime;
  const playhead = offsetSeconds + (now - anchor);
  const remaining = mix.totalSeconds - playhead;
  if (remaining <= 0) return;

  let dialogueGainNode: GainNode | null = null;
  if (mix.cues.length > 0) {
    dialogueGainNode = context.createGain();
    dialogueGainNode.gain.value = Math.min(1, Math.max(0, mix.dialogueGain));
    dialogueGainNode.connect(context.destination);
    engine.dialogueGain = dialogueGainNode;
  }

  for (const cue of mix.cues) {
    const buffer = decoded.get(cue.url);
    if (!buffer) continue;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(dialogueGainNode ?? context.destination);
    const lead = cue.at - playhead;
    if (lead >= 0) {
      source.start(now + lead);
    } else if (cue.at + buffer.duration > playhead) {
      source.start(now, playhead - cue.at);
    } else {
      continue;
    }
    engine.nodes.push(source);
  }

  for (const loop of mix.loops) {
    const buffer = decoded.get(loop.url);
    if (!buffer || buffer.duration <= 0) continue;
    const gainNode = context.createGain();
    gainNode.gain.value = loop.muted ? 0 : loop.gain;
    gainNode.connect(context.destination);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    source.start(now, playhead % buffer.duration);
    source.stop(now + remaining);
    engine.nodes.push(source);
    engine.loopGains.set(loop.id, gainNode);
  }
};

/**
 * Drives the cut: which entry is on the stage and whether time advances.
 * `timings[i]` is the entry's playback length in seconds, or null when the
 * entry advances itself (video clips fire onEnded). The advance timer clears
 * on pause, seek, data changes, and unmount.
 *
 * While playing, the mix runs through WebAudio: dialogue cues at their shot
 * offsets, music and ambience looped for the whole cut behind GainNodes.
 * Gain and mute changes apply live; structural changes rebuild the graph.
 */
export const usePlayback = (
  timings: readonly (number | null)[],
  mix: PlaybackMix = EMPTY_MIX,
): Playback => {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const count = timings.length;

  // The raw cursor may briefly exceed the range when shots are removed
  // mid-session; derive a valid one instead of repairing state in an effect.
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const activePlaying = playing && count > 0;

  const indexRef = useRef(safeIndex);
  useEffect(() => {
    indexRef.current = safeIndex;
  }, [safeIndex]);

  const engineRef = useRef<AudioEngine | null>(null);
  const mixRef = useRef(mix);
  useEffect(() => {
    mixRef.current = mix;
  }, [mix]);

  // Rebuild only when the graph's shape changes; gain and mute apply live.
  const mixShapeKey = useMemo(
    () =>
      JSON.stringify({
        cues: mix.cues.map((cue) => [cue.url, cue.at]),
        loops: mix.loops.map((loop) => loop.url),
        total: mix.totalSeconds,
      }),
    [mix],
  );

  /* ------------------------------------------------------------------ */
  /* Elapsed clock: a smooth, moving playhead                            */
  /* ------------------------------------------------------------------ */

  // Stage length of an entry, derived from the offsets the mix already
  // carries (offsets[i+1] - offsets[i], or the remainder to the total for
  // the last entry). Read from the ref so callers never need to depend on
  // the mix object's identity.
  const stageSecondsFor = useCallback((entryIndex: number): number => {
    const current = mixRef.current;
    const start = current.offsets[entryIndex] ?? 0;
    const nextStart = current.offsets[entryIndex + 1];
    return nextStart !== undefined
      ? Math.max(0, nextStart - start)
      : Math.max(0, current.totalSeconds - start);
  }, []);

  const [entryElapsed, setEntryElapsed] = useState(0);
  // Mirrors `entryElapsed` for the running rAF loop to read without
  // depending on the state value (which would restart the effect below on
  // every tick).
  const entryElapsedRef = useRef(0);
  const clockRef = useRef({ startedAt: 0, base: 0 });
  const rafRef = useRef<number | null>(null);

  // A new entry always starts its within-entry clock at zero, whether it was
  // reached by auto-advance or by a seek. Called from the index-changing
  // actions below (never during render, never as a bare effect body), so it
  // also re-anchors a rAF loop that is already running across the cut.
  const resetClock = useCallback(() => {
    entryElapsedRef.current = 0;
    clockRef.current = { startedAt: performance.now(), base: 0 };
    setEntryElapsed(0);
  }, []);

  const play = useCallback(() => {
    if (count > 0) setPlaying(true);
  }, [count]);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  const next = useCallback(() => {
    if (indexRef.current < count - 1) {
      setIndex(indexRef.current + 1);
      resetClock();
    } else {
      // Reached the end of the cut: stop on the last shot.
      setPlaying(false);
    }
  }, [count, resetClock]);

  const prev = useCallback(() => {
    setIndex(Math.max(0, indexRef.current - 1));
    resetClock();
  }, [resetClock]);

  const seek = useCallback(
    (target: number) => {
      setIndex(Math.max(0, Math.min(count - 1, target)));
      resetClock();
    },
    [count, resetClock],
  );

  // Advance timer for self-timed entries (stills and slates).
  useEffect(() => {
    if (!activePlaying) return;
    const seconds = timings[safeIndex];
    if (seconds === null || seconds === undefined) return;
    const timer = window.setTimeout(
      next,
      Math.max(200, Math.round(seconds * 1000)),
    );
    return () => window.clearTimeout(timer);
  }, [activePlaying, safeIndex, timings, next]);

  // Audio schedule: rebuilt at play, at every entry change (which resyncs the
  // mix to the visual clock), and when the mix shape changes; torn down on
  // pause and when the cut ends.
  useEffect(() => {
    if (!activePlaying) {
      if (engineRef.current) stopEngineNodes(engineRef.current);
      return;
    }
    engineRef.current ??= createEngine();
    const engine = engineRef.current;
    const current = mixRef.current;
    const offset = current.offsets[indexRef.current] ?? 0;
    void scheduleMix(engine, current, offset);
    return () => stopEngineNodes(engine);
  }, [activePlaying, safeIndex, mixShapeKey]);

  // Live gain and mute updates on the running graph.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const loop of mix.loops) {
      const gainNode = engine.loopGains.get(loop.id);
      if (gainNode) gainNode.gain.value = loop.muted ? 0 : loop.gain;
    }
    if (engine.dialogueGain) {
      engine.dialogueGain.gain.value = Math.min(1, Math.max(0, mix.dialogueGain));
    }
  }, [mix]);

  // Release the context with the component.
  useEffect(
    () => () => {
      const engine = engineRef.current;
      if (!engine) return;
      stopEngineNodes(engine);
      void engine.context?.close().catch(() => undefined);
      engineRef.current = null;
    },
    [],
  );

  // Smoothly advances the within-entry clock while playing; freezes it on
  // pause. Anchored purely on `activePlaying`: an index change re-anchors
  // the clock itself (via `resetClock` above, called from the actions that
  // change it), so a rAF loop that is already running across many entries
  // during continuous playback never needs to restart.
  useEffect(() => {
    if (!activePlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    clockRef.current = { startedAt: performance.now(), base: entryElapsedRef.current };
    const tick = () => {
      const cap = stageSecondsFor(indexRef.current);
      const value = Math.min(
        cap,
        clockRef.current.base + (performance.now() - clockRef.current.startedAt) / 1000,
      );
      entryElapsedRef.current = value;
      setEntryElapsed(value);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [activePlaying, stageSecondsFor]);

  const elapsedSeconds = Math.min(
    mix.totalSeconds,
    (mix.offsets[safeIndex] ?? 0) + entryElapsed,
  );

  return {
    index: safeIndex,
    playing: activePlaying,
    elapsedSeconds,
    play,
    pause,
    next,
    prev,
    seek,
  };
};
