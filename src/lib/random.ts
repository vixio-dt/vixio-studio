/**
 * Deterministic PRNG (mulberry32). Seeded generation keeps mock output
 * reproducible: same seed, same frame.
 */
export const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashStringToSeed = (input: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const randomSeed = (): number => Math.floor(Math.random() * 1_000_000);

export const pickFrom = <T>(items: readonly T[], rng: () => number): T => {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pickFrom: empty list");
  return item;
};
