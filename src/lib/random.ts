/** An explicit random stream makes generated music reproducible without changing
 * the default non-seeded user experience. Values must be in [0,1). */
export type RandomSource = () => number;

/** Mulberry32 PRNG. Recreate the stream from the same seed for repeatable output.
 * This is for musical variation/tests, not cryptographic randomness. */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
