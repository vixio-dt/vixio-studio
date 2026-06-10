import { useCallback, useEffect, useRef, useState } from "react";

export type Playback = {
  index: number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (index: number) => void;
};

/**
 * Drives the cut: which entry is on the stage and whether time advances.
 * `timings[i]` is the entry's playback length in seconds, or null when the
 * entry advances itself (video clips fire onEnded). The advance timer clears
 * on pause, seek, data changes, and unmount.
 */
export const usePlayback = (
  timings: readonly (number | null)[],
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

  const play = useCallback(() => {
    if (count > 0) setPlaying(true);
  }, [count]);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  const next = useCallback(() => {
    if (indexRef.current < count - 1) {
      setIndex(indexRef.current + 1);
    } else {
      // Reached the end of the cut: stop on the last shot.
      setPlaying(false);
    }
  }, [count]);

  const prev = useCallback(() => {
    setIndex(Math.max(0, indexRef.current - 1));
  }, []);

  const seek = useCallback(
    (target: number) => {
      setIndex(Math.max(0, Math.min(count - 1, target)));
    },
    [count],
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

  return {
    index: safeIndex,
    playing: activePlaying,
    play,
    pause,
    next,
    prev,
    seek,
  };
};
