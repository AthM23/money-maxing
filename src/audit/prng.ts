/**
 * Seeded randomness. `Math.random` appears nowhere in this pack on purpose: a sample an external
 * auditor cannot redraw from the seed on the cover sheet is not evidence, it is an assertion.
 */

/** mulberry32: one 32-bit word of state, uniform enough for selection and exactly reproducible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: turns any seed an auditor types ("q3-review") into the one 32-bit number mulberry32 wants. */
export function seedFromString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Fisher-Yates over a copy, so the caller's order — and the database's — is left alone. */
export function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const here = out[i] as T;
    out[i] = out[j] as T;
    out[j] = here;
  }
  return out;
}
