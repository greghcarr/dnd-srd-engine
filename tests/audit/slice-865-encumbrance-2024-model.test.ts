// Slice 865 — L7 audit closure for `encumbrance-variant-2014` (DIVERGENCE)
// and `carry-capacity-size` (QUIRK).
//
// RAW (SRD 5.2.1, "Carrying Capacity"): a creature's carry maximum is
// `Strength score × 15`, scaled by its size (Tiny ×0.5, Large ×2, Huge ×4,
// Gargantuan ×8; Small/Medium ×1). It can drag, lift, or push up to DOUBLE
// that. The ONLY mechanical consequence of exceeding the carry max is the
// Speed cap ("your Speed can be no more than 5 feet" — applied in the speed
// derive, slice 866). There are NO 2014-style "encumbered" / "heavily
// encumbered" tiers, so the engine models encumbrance as a single binary:
// within capacity, or over it.
//
// This guard pins (1) the size-scaling on the canonical carry source, (2) the
// ×2 drag/lift/push maximum, (3) Goliath Powerful Build counting one size
// larger, and (4) the binary over-capacity flag on `computeEncumbrance`.

import { describe, expect, it } from 'vitest';
import { computeCarryingCapacity } from '../../src/derive/carrying-capacity.js';
import { computeEncumbrance } from '../../src/derive/encumbrance.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { buildFighter, makeItemInstance } from '../fixtures/index.js';
import type { Character } from '../../src/schemas/runtime/character.js';

// The starter pack carries real item weights (musket = 10 lb); the lean
// test pack does not, so the load math below uses the starter content.
const CONTENT = resolveContent([loadStarterPack()]);

const sized = (size: Character['sizeOverride'], str: number): Character => ({
  ...buildFighter({ STR: str }),
  sizeOverride: size,
});

describe('slice 865 — 2024 Carrying Capacity model', () => {
  describe('size scales the carry maximum (STR × 15 × size factor)', () => {
    it.each([
      ['Tiny', 75], // 10 × 15 × 0.5
      ['Small', 150], // ×1
      ['Medium', 150], // ×1
      ['Large', 300], // ×2
      ['Huge', 600], // ×4
      ['Gargantuan', 1200], // ×8
    ] as const)('STR 10 %s → %d lb', (size, expected) => {
      expect(computeCarryingCapacity(sized(size, 10), CONTENT).capacity).toBe(expected);
    });
  });

  it('drag/lift/push maximum is double the carry maximum', () => {
    const r = computeCarryingCapacity(buildFighter({ STR: 10 }), CONTENT);
    expect(r.capacity).toBe(150);
    expect(r.pushDragLift).toBe(300);
  });

  it('Powerful Build (Goliath) counts one size larger: Medium → Large ×2', () => {
    const goliath: Character = { ...buildFighter({ STR: 16 }), speciesId: 'goliath' };
    const r = computeCarryingCapacity(goliath, CONTENT);
    expect(r.capacity).toBe(480); // 16 × 15 × 2
    expect(r.breakdown.some((b) => b.source.includes('Powerful Build'))).toBe(true);
  });

  describe('encumbrance is binary — within capacity or over it (no 2014 tiers)', () => {
    // musket weighs 10 lb in the starter pack — a clean unit for load math.
    const loadOf = (str: number, qty: number) => {
      const m = makeItemInstance('musket', { quantity: qty });
      return computeEncumbrance({
        character: buildFighter({ STR: str, inventory: [m.id] }),
        itemInstances: { [m.id]: m },
        content: CONTENT,
      });
    };

    it('carried weight exactly at the carry max is NOT over capacity', () => {
      const r = loadOf(10, 15); // 15 × 10 lb = 150 == carry 150
      expect(r.carriedWeight).toBe(150);
      expect(r.carryCapacity).toBe(150);
      expect(r.overCapacity).toBe(false);
    });

    it('carried weight above the carry max IS over capacity', () => {
      const r = loadOf(10, 16); // 160 > 150
      expect(r.carriedWeight).toBe(160);
      expect(r.overCapacity).toBe(true);
    });

    it('over-capacity load is still within the drag/lift/push max', () => {
      const r = loadOf(10, 16);
      expect(r.pushDragLiftCapacity).toBe(300);
      expect(r.carriedWeight).toBeLessThanOrEqual(r.pushDragLiftCapacity);
    });

    it('the result carries no 2014 tier label (binary model only)', () => {
      const r = loadOf(10, 1);
      expect(r).not.toHaveProperty('level');
      expect(Object.keys(r).sort()).toEqual(
        ['carriedWeight', 'carryCapacity', 'overCapacity', 'pushDragLiftCapacity'].sort(),
      );
    });
  });
});
