// Slice 582: minimal encumbrance domain — carrying capacity derive +
// creature weight derive.
//
// RAW PHB 2024:
//   - Carrying capacity = STR × 15 lb (base).
//   - Goliath Powerful Build doubles capacity (Medium → Large).
//   - Petrified multiplies the bearer's weight ×10.
//
// Scope intentionally narrow: no per-item weights, no total-carried-
// load tracking, no speed-by-load gates. Just the two derive
// functions so a consumer surfacing the sheet has a canonical source.

import { describe, expect, it } from 'vitest';
import {
  computeCarryingCapacity,
  computeCreatureWeight,
} from '../../../src/derive/carrying-capacity.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildCharacter = (params: {
  speciesId?: string;
  str: number;
  petrified?: boolean;
}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Test',
    speciesId: params.speciesId ?? 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: params.str, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 10, max: 10, temp: 0 },
    ...(params.petrified
      ? {
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'petrified',
          appliedAt: isoTimestamp(),
        }],
      }
      : {}),
  });

describe('computeCarryingCapacity (slice 582)', () => {
  it('Human STR 10 → 150 lb (10 × 15)', () => {
    const c = buildCharacter({ str: 10 });
    const r = computeCarryingCapacity(c, CONTENT);
    expect(r.capacity).toBe(150);
    expect(r.breakdown.find((b) => b.source.startsWith('STR'))?.value).toBe(150);
  });

  it('Human STR 18 → 270 lb (18 × 15)', () => {
    const c = buildCharacter({ str: 18 });
    const r = computeCarryingCapacity(c, CONTENT);
    expect(r.capacity).toBe(270);
  });

  it('Human STR 1 → 15 lb (boundary low)', () => {
    const c = buildCharacter({ str: 1 });
    const r = computeCarryingCapacity(c, CONTENT);
    expect(r.capacity).toBe(15);
  });

  it('Goliath STR 16 → 480 lb (16 × 15 × 2 Powerful Build)', () => {
    const c = buildCharacter({ speciesId: 'goliath', str: 16 });
    const r = computeCarryingCapacity(c, CONTENT);
    expect(r.capacity).toBe(480);
    expect(r.breakdown.find((b) => b.source.includes('Powerful Build'))?.value).toBe(240);
  });

  it('Goliath STR 20 → 600 lb (20 × 15 × 2)', () => {
    const c = buildCharacter({ speciesId: 'goliath', str: 20 });
    const r = computeCarryingCapacity(c, CONTENT);
    expect(r.capacity).toBe(600);
  });

  it('Non-Goliath species do not get Powerful Build', () => {
    for (const speciesId of ['human', 'elf', 'dwarf', 'halfling', 'tiefling', 'dragonborn', 'gnome', 'orc']) {
      const c = buildCharacter({ speciesId, str: 16 });
      const r = computeCarryingCapacity(c, CONTENT);
      expect(r.capacity, `${speciesId} should be 240 lb (no Powerful Build)`).toBe(240);
      expect(r.breakdown.some((b) => b.source.includes('Powerful Build'))).toBe(false);
    }
  });
});

describe('computeCreatureWeight (slice 582)', () => {
  it('Medium creature defaults to 150 lb', () => {
    const c = buildCharacter({ str: 10 });
    const r = computeCreatureWeight(c, CONTENT);
    expect(r.weight).toBe(150);
    expect(r.breakdown.find((b) => b.source === 'size:medium')?.value).toBe(150);
  });

  it('Small creature (halfling) defaults to 40 lb', () => {
    const c = buildCharacter({ speciesId: 'halfling', str: 10 });
    const r = computeCreatureWeight(c, CONTENT);
    expect(r.weight).toBe(40);
  });

  it('Petrified Medium creature weighs 1500 lb (×10)', () => {
    const c = buildCharacter({ str: 10, petrified: true });
    const r = computeCreatureWeight(c, CONTENT);
    expect(r.weight).toBe(1500);
    expect(r.breakdown.find((b) => b.source.includes('Petrified'))?.value).toBe(1350);
  });

  it('Petrified Small creature weighs 400 lb', () => {
    const c = buildCharacter({ speciesId: 'gnome', str: 10, petrified: true });
    const r = computeCreatureWeight(c, CONTENT);
    expect(r.weight).toBe(400);
  });

  it('Non-Petrified character has no Petrified breakdown entry', () => {
    const c = buildCharacter({ str: 10, petrified: false });
    const r = computeCreatureWeight(c, CONTENT);
    expect(r.breakdown.some((b) => b.source.includes('Petrified'))).toBe(false);
  });
});
