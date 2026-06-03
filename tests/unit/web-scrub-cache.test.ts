// Slice 610: the web demo's scrub cache must produce the same state
// at any cursor as a fresh `replay(events.slice(0, cursor))`. The
// incremental forward-step via `applyAll` is an optimization, not a
// semantic change.
//
// This test re-implements the cache helper inline (the production
// version lives in web/main.ts and isn't exported) and pins the
// invariant against a representative event stream from runBattle.

import { describe, expect, it } from 'vitest';
import { applyAll, replay, type Campaign } from '../../src/index.js';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';

const STARTER = loadStarterPack();

type ScrubCache = Map<number, Campaign>;

const buildScrubbed = (full: Campaign, cursor: number, cache: ScrubCache): Campaign => {
  const hit = cache.get(cursor);
  if (hit !== undefined) return hit;
  let bestKey = -1;
  for (const key of cache.keys()) {
    if (key <= cursor && key > bestKey) bestKey = key;
  }
  const state = bestKey >= 0
    ? applyAll(cache.get(bestKey)!.state, full.events.slice(bestKey, cursor))
    : replay(full.events.slice(0, cursor));
  const scrubbed: Campaign = {
    ...full,
    events: full.events.slice(0, cursor),
    state,
    cursor,
  };
  cache.set(cursor, scrubbed);
  return scrubbed;
};

describe('slice 610: web scrub cache produces correct state at every cursor', () => {
  it('matches replay() at every cursor index for a real fuzz battle', () => {
    const result = runBattle({ seed: 42, pack: STARTER });
    const full = result.campaign;
    const total = full.events.length;
    expect(total).toBeGreaterThan(0);

    const cache: ScrubCache = new Map();
    cache.set(total, full);

    // Sample 20 cursors across the stream (including 0, mid, end).
    const stops = Array.from(
      new Set(
        [0, 1, total, total - 1, ...Array.from({ length: 18 }, (_, i) =>
          Math.floor(((i + 1) * total) / 20),
        )],
      ),
    ).filter((n) => n >= 0 && n <= total).sort((a, b) => a - b);

    for (const cursor of stops) {
      const scrubbed = buildScrubbed(full, cursor, cache);
      const fresh = replay(full.events.slice(0, cursor));
      expect(scrubbed.cursor).toBe(cursor);
      expect(scrubbed.events.length).toBe(cursor);
      expect(scrubbed.state).toEqual(fresh);
    }
  });

  it('scrubbing backward reuses the nearest cached prefix (incremental, not from genesis)', () => {
    const result = runBattle({ seed: 7, pack: STARTER });
    const full = result.campaign;
    const total = full.events.length;
    const cache: ScrubCache = new Map();
    cache.set(total, full);

    // Walk forward 1..total caching at every step.
    for (let c = 0; c <= total; c += 1) {
      buildScrubbed(full, c, cache);
    }
    expect(cache.size).toBe(total + 1);

    // Now jump to the middle; should be an exact cache hit.
    const mid = Math.floor(total / 2);
    const a = cache.get(mid)!;
    const b = buildScrubbed(full, mid, cache);
    expect(a).toBe(b); // referential equality — cache hit, no recompute.
  });

  it('returns a fresh campaign with the scrubbed cursor (not the full one)', () => {
    const result = runBattle({ seed: 100, pack: STARTER });
    const full = result.campaign;
    const cache: ScrubCache = new Map();
    cache.set(full.events.length, full);

    const half = Math.floor(full.events.length / 2);
    const scrubbed = buildScrubbed(full, half, cache);
    expect(scrubbed.cursor).toBe(half);
    expect(scrubbed.events.length).toBe(half);
    expect(scrubbed).not.toBe(full);
    // Identity props preserved.
    expect(scrubbed.id).toBe(full.id);
    expect(scrubbed.name).toBe(full.name);
  });
});
