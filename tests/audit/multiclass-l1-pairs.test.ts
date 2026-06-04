// Slice 642: multiclass L1+L1 build audit.
//
// Fourth of five L2 hardening slices. The slice-633 L2 floor covers
// single-class L2 builds (one entry per class). It does NOT cover
// the other shape of "total character level 2" — a multiclass L1+L1
// character. Any of 66 class pairs could silently break the build,
// the schema parse, the commit, or the derive path without any
// existing audit noticing.
//
// This slice adds 66 tests (one per unordered class pair). Each test
// builds an L1+L1 character with high stats (all 14s, satisfying
// every RAW multiclass prerequisite at 13+), commits the
// CharacterCreated event, and confirms `engine.derive.character`
// returns a defined sheet without throwing.
//
// What this audit deliberately does NOT check:
//   - Specific feature presence per class (covered by the L1 floor
//     for single-class builds; if a single-class L1 X exposes feature
//     F, the multiclass L1 X + L1 Y also exposes F barring an
//     engine bug, and per-pair feature listing would be redundant).
//   - Multiclass spellcasting slot math (Wizard 1 + Cleric 1 → 2 L1
//     slots not 1; covered by the spell-slots derivation and its
//     dedicated tests).
//   - Hit-point computation per RAW (multiclass HP comes from each
//     class's hit die; the engine accepts whatever hpMax the consumer
//     provides at creation time).
//
// The audit's one job: every pair builds + derives. A regression that
// breaks even one pair lights up immediately, naming the offending
// class combo.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { CharacterSchema } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import { eventId, isoTimestamp } from '../fixtures/index.js';

const PACK = loadStarterPack();

const CLASSES = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
] as const;

// Unordered pairs of distinct classes. 12 choose 2 = 66.
const PAIRS: ReadonlyArray<readonly [string, string]> = (() => {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < CLASSES.length; i += 1) {
    for (let j = i + 1; j < CLASSES.length; j += 1) {
      out.push([CLASSES[i]!, CLASSES[j]!]);
    }
  }
  return out;
})();

describe('slice 642: multiclass L1+L1 builds cleanly for every class pair', () => {
  it('enumerates 66 distinct unordered pairs (12 choose 2)', () => {
    expect(PAIRS).toHaveLength(66);
  });

  for (const [a, b] of PAIRS) {
    it(`${a} + ${b}: builds, commits, derives without throwing`, () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      // All-14 stat array: clears every RAW multiclass prerequisite
      // (the highest is 13 for Barbarian/Fighter/Paladin Strength,
      // Monk/Rogue/Ranger Dex, etc.). If the schema or derivation
      // enforces those prereqs, this clears them. If they don't,
      // this audit still exercises a representative valid character.
      const character = CharacterSchema.parse({
        id: newCharacterId(),
        name: `Multiclass ${a}/${b}`,
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [
          { classId: a, level: 1, hitDiceRemaining: 1 },
          { classId: b, level: 1, hitDiceRemaining: 1 },
        ],
        abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 14, WIS: 14, CHA: 14 },
        hp: { current: 16, max: 16, temp: 0, maxBonus: 0 },
      });
      expect(character.classes).toHaveLength(2);
      expect(
        character.classes.map((c) => c.classId).sort(),
        `enrollments don't match expected pair`,
      ).toEqual([a, b].sort());

      let campaign = engine.createCampaign({ name: 'multiclass-audit' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: character,
        } satisfies CharacterCreatedEvent,
      ]);

      // The derivation must complete without throwing. We don't
      // assert specific values per pair (combinatoric explosion); we
      // assert the sheet is computed, which exercises the whole
      // multiclass-aware derive pipeline.
      const derived = engine.derive.character(campaign.state, character.id);
      expect(derived, `engine.derive.character returned no sheet for ${a}/${b}`).toBeDefined();
    });
  }
});
