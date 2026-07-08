/**
 * Offline audio mix for the final render. One OfflineAudioContext at 48kHz
 * renders the whole cut: dialogue clips pinned to their shot offsets, music
 * and ambience beds looped for the full duration behind per-track gains.
 * Assets that fail to fetch or decode stay silent instead of failing the
 * render; a cut with no audio still yields a silent buffer so the muxer
 * always receives one audio track.
 */

export const MIX_SAMPLE_RATE = 48_000;

/** A dialogue clip scheduled at an absolute offset from the top of the cut. */
export type RenderCue = {
  /** Object URL of the dialogue asset. */
  url: string;
  /** Start offset in seconds. */
  at: number;
};

/** A music or ambience bed looped for the whole cut. */
export type RenderLoop = {
  /** Object URL of the track asset. */
  url: string;
  /** 0..1 playback gain. */
  gain: number;
  muted: boolean;
};

export type MixInput = {
  cues: readonly RenderCue[];
  loops: readonly RenderLoop[];
  totalSeconds: number;
};

const decode = async (
  context: OfflineAudioContext,
  url: string,
): Promise<AudioBuffer | null> => {
  try {
    const data = await (await fetch(url)).arrayBuffer();
    return await context.decodeAudioData(data);
  } catch {
    return null;
  }
};

/** Renders the full cut's audio into one stereo 48kHz buffer. */
export const mixCutAudio = async (input: MixInput): Promise<AudioBuffer> => {
  const seconds = Math.max(input.totalSeconds, 1 / MIX_SAMPLE_RATE);
  const context = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil(seconds * MIX_SAMPLE_RATE)),
    MIX_SAMPLE_RATE,
  );

  for (const cue of input.cues) {
    if (cue.at >= seconds) continue;
    const buffer = await decode(context, cue.url);
    if (!buffer) continue;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(Math.max(0, cue.at));
  }

  for (const loop of input.loops) {
    if (loop.muted || loop.gain <= 0) continue;
    const buffer = await decode(context, loop.url);
    if (!buffer || buffer.duration <= 0) continue;
    const gainNode = context.createGain();
    gainNode.gain.value = Math.min(1, Math.max(0, loop.gain));
    gainNode.connect(context.destination);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    source.start(0);
    source.stop(seconds);
  }

  return context.startRendering();
};
