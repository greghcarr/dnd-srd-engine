// Slice 883 — verify (and guard) the per-level Monk Focus (Ki) / Sorcerer
// Sorcery Point counts at L6-7. Closes the L7 audit Area-5 `[verify]` row
// `ki-sorcery-point-undercount` as CONFIRMED CORRECT (not a bug).
//
// RAW (2024 classes.md): "Your Monk level determines the number of [Focus]
// points you have" — Focus Points = Monk level (from L2). Sorcerer's Font of
// Magic likewise grants Sorcery Points equal to the Sorcerer level (from L2).
// Both scale PER LEVEL, not on milestones.
//
// The audit suspected a possible off-milestone undercount at L6-7 (if the max
// were a frozen milestone value rather than a per-level formula). It isn't:
// the pack grants `ki` and `sorcery-points` with `max: { kind: 'level',
// classId }`, and `seedResourcesFromContent` evaluates that formula against the
// character's CURRENT class level (src/engine/seed-resources.ts) — so a
// freshly-seeded L6 Monk has 6 Focus, an L7 Sorcerer has 7 Sorcery Points.
// This guard pins L2/L6/L7 so a regression to a milestone table would fail.
//
// (Separate, by-design note: the level-up reducer doesn't auto-mutate
// `character.resources[].max` — resources are consumer-seeded state since
// slice 675, re-seeded on level change. That's the consumer-seed contract, not
// the per-level-formula question this row raised.)

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { seedResourcesFromContent } from '../../../src/engine/seed-resources.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';

const PACK = loadStarterPack();
const ENGINE = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });

const buildMonk = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Po',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{
      classId: 'monk', level, hitDiceRemaining: level,
      subclassId: level >= 3 ? 'warrior-of-the-open-hand' : undefined,
    }],
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 8 * level, max: 8 * level, temp: 0 },
  });

const buildSorcerer = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Tia',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{
      classId: 'sorcerer', level, hitDiceRemaining: level,
      subclassId: level >= 3 ? 'draconic-sorcery' : undefined,
    }],
    abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 16 },
    hp: { current: 6 * level, max: 6 * level, temp: 0 },
  });

const maxOf = (character: Character, resourceId: string): number | undefined =>
  seedResourcesFromContent(character, ENGINE.content)
    .resources.find((r) => r.resourceId === resourceId)?.max;

describe('Monk Focus / Sorcerer Sorcery points scale per level (slice 883 — verify)', () => {
  it('Monk Focus (resource `ki`) max equals Monk level: L2=2, L6=6, L7=7', () => {
    expect(maxOf(buildMonk(2), 'ki')).toBe(2);
    expect(maxOf(buildMonk(6), 'ki')).toBe(6);
    expect(maxOf(buildMonk(7), 'ki')).toBe(7);
  });

  it('Sorcerer Sorcery Points max equals Sorcerer level: L2=2, L6=6, L7=7', () => {
    expect(maxOf(buildSorcerer(2), 'sorcery-points')).toBe(2);
    expect(maxOf(buildSorcerer(6), 'sorcery-points')).toBe(6);
    expect(maxOf(buildSorcerer(7), 'sorcery-points')).toBe(7);
  });

  it('the counts are not a frozen L2 milestone (L6/L7 strictly exceed the L2 value)', () => {
    expect(maxOf(buildMonk(6), 'ki')!).toBeGreaterThan(maxOf(buildMonk(2), 'ki')!);
    expect(maxOf(buildSorcerer(7), 'sorcery-points')!).toBeGreaterThan(maxOf(buildSorcerer(2), 'sorcery-points')!);
  });
});
