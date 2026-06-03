// Slice 610 + 616: web demo's scrub cache must produce the same state
// at any cursor as a fresh `replay(events.slice(0, cursor))`. The
// incremental forward-step via `applyAll` is an optimization, not a
// semantic change. Slice 616 adds LRU eviction with pinned anchors so
// the cache stays bounded for long sessions.
//
// The test re-implements the cache helper inline (the production
// version lives in web/main.ts and isn't exported) and pins:
//   - state correctness (slice 610): every cursor matches replay().
//   - cache-hit semantics (slice 610): jumping back to a cached
//     cursor is a referential hit.
//   - LRU eviction (slice 616): when cap is exceeded, the least-
//     recently-touched non-pinned entry is dropped first.
//   - Pinning (slice 616): cursor=0 and cursor=totalEvents are never
//     evicted even under cap pressure.

import { describe, expect, it } from 'vitest';
import { applyAll, replay, type Campaign } from '../../src/index.js';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';

const STARTER = loadStarterPack();

interface ScrubCache {
  readonly entries: Map<number, Campaign>;
  readonly pinned: ReadonlySet<number>;
  readonly maxSlots: number;
}

const createScrubCache = (pinnedCursors: ReadonlyArray<number>, maxSlots = 128): ScrubCache => ({
  entries: new Map(),
  pinned: new Set(pinnedCursors),
  maxSlots,
});

const cacheSet = (cache: ScrubCache, cursor: number, campaign: Campaign): void => {
  cache.entries.set(cursor, campaign);
  while (cache.entries.size > cache.maxSlots) {
    let evicted = false;
    for (const key of cache.entries.keys()) {
      if (cache.pinned.has(key)) continue;
      cache.entries.delete(key);
      evicted = true;
      break;
    }
    if (!evicted) break;
  }
};

const cacheGet = (cache: ScrubCache, cursor: number): Campaign | undefined => {
  const hit = cache.entries.get(cursor);
  if (hit === undefined) return undefined;
  cache.entries.delete(cursor);
  cache.entries.set(cursor, hit);
  return hit;
};

const buildScrubbed = (full: Campaign, cursor: number, cache: ScrubCache): Campaign => {
  const hit = cacheGet(cache, cursor);
  if (hit !== undefined) return hit;
  let bestKey = -1;
  for (const key of cache.entries.keys()) {
    if (key <= cursor && key > bestKey) bestKey = key;
  }
  const state = bestKey >= 0
    ? applyAll(cache.entries.get(bestKey)!.state, full.events.slice(bestKey, cursor))
    : replay(full.events.slice(0, cursor));
  const scrubbed: Campaign = {
    ...full,
    events: full.events.slice(0, cursor),
    state,
    cursor,
  };
  cacheSet(cache, cursor, scrubbed);
  return scrubbed;
};

describe('slice 610 + 616: web scrub cache correctness + LRU bounds', () => {
  it('matches replay() at every cursor index for a real fuzz battle', () => {
    const result = runBattle({ seed: 42, pack: STARTER });
    const full = result.campaign;
    const total = full.events.length;
    expect(total).toBeGreaterThan(0);

    const cache = createScrubCache([0, total]);
    cacheSet(cache, total, full);

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

  it('scrubbing backward reuses the nearest cached prefix (referential cache hit)', () => {
    const result = runBattle({ seed: 7, pack: STARTER });
    const full = result.campaign;
    const total = full.events.length;
    // Use a maxSlots large enough to not evict during exhaustive walk.
    const cache = createScrubCache([0, total], total + 10);
    cacheSet(cache, total, full);
    for (let c = 0; c <= total; c += 1) {
      buildScrubbed(full, c, cache);
    }
    const mid = Math.floor(total / 2);
    const a = cache.entries.get(mid)!;
    const b = buildScrubbed(full, mid, cache);
    expect(a).toBe(b);
  });

  it('LRU eviction (slice 616): non-pinned entries drop when cap is exceeded', () => {
    const result = runBattle({ seed: 200, pack: STARTER });
    const full = result.campaign;
    const total = full.events.length;
    // Small cap to force eviction.
    const cap = 10;
    const cache = createScrubCache([0, total], cap);
    cacheSet(cache, total, full);
    // Seed cursor 0 so the pin promise holds (mirrors main.ts seeding).
    buildScrubbed(full, 0, cache);

    // Visit cursors 1..30 sequentially. Cap = 10 → mid-range cursors
    // get evicted as new ones land.
    for (let c = 1; c <= 30; c += 1) {
      if (c > total) break;
      buildScrubbed(full, c, cache);
    }
    // Cap respected.
    expect(cache.entries.size).toBeLessThanOrEqual(cap);
    // Pinned anchors survived.
    expect(cache.entries.has(0)).toBe(true);
    expect(cache.entries.has(total)).toBe(true);
  });

  it('Pinned cursors (0 and totalEvents) never evict even under cap pressure', () => {
    const result = runBattle({ seed: 250, pack: STARTER });
    const full = result.campaign;
    const total = full.events.length;
    // Cap of just 3 (smaller than the pinned-set size of 2 + 1).
    const cache = createScrubCache([0, total], 3);
    cacheSet(cache, total, full);
    cacheSet(cache, 0, buildScrubbed(full, 0, cache));
    // Fill with non-pinned entries to force eviction pressure.
    for (let c = 1; c <= 50; c += 1) {
      if (c > total) break;
      buildScrubbed(full, c, cache);
    }
    expect(cache.entries.has(0)).toBe(true);
    expect(cache.entries.has(total)).toBe(true);
  });

  it('touching an existing entry moves it to MRU (so it survives subsequent evictions)', () => {
    const result = runBattle({ seed: 300, pack: STARTER });
    const full = result.campaign;
    const total = full.events.length;
    const cap = 5;
    const cache = createScrubCache([0, total], cap);
    cacheSet(cache, total, full);

    // Visit cursors 1, 2, 3 (cache has 0-pin, total-pin, 1, 2, 3).
    buildScrubbed(full, 1, cache);
    buildScrubbed(full, 2, cache);
    buildScrubbed(full, 3, cache);
    // Now visit cursor 1 again — should touch it to MRU position.
    buildScrubbed(full, 1, cache);
    // Now visit 4 and 5 — should evict 2 and 3 (oldest non-pinned),
    // not 1 (recently touched).
    buildScrubbed(full, 4, cache);
    buildScrubbed(full, 5, cache);
    expect(cache.entries.has(1)).toBe(true);
    expect(cache.entries.size).toBeLessThanOrEqual(cap);
  });
});
