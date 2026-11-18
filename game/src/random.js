// Solara Bay — deterministic seeded random numbers.
// One clear job: the city, traffic and pedestrians are the same for a given
// seed, so screenshots and play-tests are reproducible.

export function makeRng(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 123456789;
  return function rand() {
    // mulberry32
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

export function range(rand, min, max) {
  return min + rand() * (max - min);
}

export function rangeInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}
