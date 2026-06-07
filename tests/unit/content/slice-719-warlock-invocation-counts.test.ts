// Slice 719: Warlock Eldritch Invocations "known" count labels match
// SRD 5.2.1. These are display-only labels (the per-tier invocation
// gain/replace system is unwired — see docs/gaps-class-features.md), so
// this pins the labels to the SRD progression and guards the drift the
// L5 audit found (L5 read "4 known" but SRD is 5). The feature ids keep
// their original numeric suffixes (load-bearing for other tests + the
// coverage snapshot), so this checks the `name`, not the id.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

// SRD 5.2.1 Warlock table, Eldritch Invocations column.
const SRD_INVOCATIONS_KNOWN: ReadonlyArray<readonly [level: string, known: number]> = [
  ['1', 1],
  ['2', 3],
  ['5', 5],
  ['7', 6],
  ['9', 7],
  ['12', 8],
  ['15', 9],
  ['18', 10],
];

describe('slice 719: Warlock invocation count labels match SRD 5.2.1', () => {
  const warlock = PACK.classes.find((c) => c.id === 'warlock')!;

  for (const [level, known] of SRD_INVOCATIONS_KNOWN) {
    it(`L${level} reads "${known} known"`, () => {
      const feature = warlock.levelTable[level]!.features.find((f) =>
        f.id.startsWith('eldritch-invocations-'),
      );
      expect(feature, `warlock L${level} has an Eldritch Invocations feature`).toBeDefined();
      expect(feature!.name).toBe(`Eldritch Invocations (${known} known)`);
    });
  }
});
