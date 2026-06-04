// Slice 619: CI-guarded "L1 SRD complete" floor audit.
//
// Companion to slice 574's `srd-l1-invariants.test.ts` (which pins hit
// dice + spell-slot table + ability-score bounds against the SRD).
// This audit goes broader: it locks in the surface area that
// constitutes "a complete L1 SRD experience" so a future slice can't
// silently drop a class feature, a species, or a condition.
//
// What's pinned (each as a separate `it()` so a regression names the
// exact dropped invariant):
//   1. Every SRD class has its canonical L1 feature ids present.
//   2. Every SRD species ships with non-empty traits.
//   3. Every SRD background ships with an originFeatId.
//   4. Every RAW condition (15) ships under its canonical id.
//   5. The slice-618 OfferCharacterChoices path works for a fresh L1
//      Fighter (Fighting Style choice fires with the 6 SRD options).
//
// The audit is intentionally specific about FEATURE / CONDITION /
// SPECIES IDS — those are content-level stable promises. Numerical
// counts (test totals, mechanical-wiring percentages, spell-bucket
// splits) are NOT pinned here because they're already guarded by
// other audits (doc-counts, gaps-spells-counts) or they're volatile
// and not load-bearing for the L1-complete claim.
//
// If a future content edit intentionally renames or removes one of
// these ids, update both the content + this audit in the same slice.
// The audit's job is to make that update visible, not to block valid
// content evolution.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { eventId, isoTimestamp } from '../fixtures/index.js';
import { newCharacterId } from '../../src/ids.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();

// ────────────────────────────────────────────────────────────────────
// 1. Per-class L1 feature presence.
//
// Each row is the canonical id set for that class's L1 row, as it
// stands at the slice-619 reference point. RAW per SRD 5.2.1:
//   - Barbarian: Rage, Unarmored Defense, Weapon Mastery (2 slots)
//   - Bard: Bardic Inspiration, Spellcasting (spellcasting feature
//     is the spellcasting block at the class level, not a row id)
//   - Cleric: Divine Order, Spellcasting
//   - Druid: Druidic, Primal Order, Spellcasting
//   - Fighter: Fighting Style, Second Wind, Weapon Mastery (3 slots)
//   - Monk: Martial Arts, Unarmored Defense
//   - Paladin: Lay on Hands, Spellcasting, Weapon Mastery (2 slots)
//   - Ranger: Favored Enemy, Spellcasting, Weapon Mastery (2 slots)
//   - Rogue: Sneak Attack, Expertise, Weapon Mastery (2 slots),
//     Thieves' Cant
//   - Sorcerer: Innate Sorcery, Spellcasting
//   - Warlock: Eldritch Invocations (2), Pact Magic
//   - Wizard: Arcane Recovery, Ritual Adept, Spellcasting
// ────────────────────────────────────────────────────────────────────
const REQUIRED_L1_FEATURES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['barbarian', ['rage', 'unarmored-defense-barbarian-feature', 'weapon-mastery-barbarian']],
  ['bard', ['bardic-inspiration']],
  ['cleric', ['divine-order']],
  ['druid', ['druidic', 'primal-order']],
  ['fighter', ['second-wind', 'fighting-style-fighter', 'weapon-mastery-fighter']],
  ['monk', ['martial-arts', 'unarmored-defense-monk']],
  ['paladin', ['lay-on-hands', 'weapon-mastery-paladin']],
  ['ranger', ['favored-enemy', 'weapon-mastery-ranger']],
  ['rogue', ['sneak-attack', 'expertise-rogue', 'weapon-mastery-rogue', 'thieves-cant']],
  ['sorcerer', ['innate-sorcery']],
  ['warlock', ['eldritch-invocations-2']],
  ['wizard', ['arcane-recovery', 'ritual-adept']],
]);

// ────────────────────────────────────────────────────────────────────
// 2. SRD 5.2.1 species. Aasimar is PHB-only (non-SRD) so absent.
// ────────────────────────────────────────────────────────────────────
const REQUIRED_SPECIES: ReadonlyArray<string> = [
  'human', 'elf', 'dwarf', 'halfling', 'tiefling',
  'dragonborn', 'gnome', 'goliath', 'orc',
];

// ────────────────────────────────────────────────────────────────────
// 3. SRD 5.2.1 backgrounds. The 15 PHB-2024 backgrounds moved to the
// phb-2024-extras pack in slice 401 so they're not in starter.
// ────────────────────────────────────────────────────────────────────
const REQUIRED_BACKGROUNDS: ReadonlyArray<string> = ['acolyte', 'criminal', 'sage', 'soldier'];

// ────────────────────────────────────────────────────────────────────
// 4. All 15 RAW conditions per PHB 2024 / SRD 5.2.1.
// ────────────────────────────────────────────────────────────────────
const RAW_CONDITIONS: ReadonlyArray<string> = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened',
  'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified',
  'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
];

describe('slice 619: SRD L1 completeness audit', () => {
  describe('per-class L1 features (canonical ids present)', () => {
    for (const [classId, requiredFeatureIds] of REQUIRED_L1_FEATURES) {
      it(`${classId} L1 row has the canonical feature ids`, () => {
        const cls = PACK.classes?.find((c) => c.id === classId);
        expect(cls, `class ${classId} missing from pack`).toBeDefined();
        const l1Features = (cls!.levelTable['1']?.features ?? []).map((f) => f.id);
        for (const requiredId of requiredFeatureIds) {
          expect(l1Features, `${classId} L1 missing canonical feature ${requiredId}`).toContain(requiredId);
        }
      });
    }
  });

  describe('SRD 5.2.1 species (all 9 present with non-empty traits)', () => {
    for (const speciesId of REQUIRED_SPECIES) {
      it(`${speciesId} ships with at least one trait`, () => {
        const sp = PACK.species?.find((s) => s.id === speciesId);
        expect(sp, `species ${speciesId} missing from pack`).toBeDefined();
        expect(sp!.traits.length, `${speciesId} ships with empty traits`).toBeGreaterThan(0);
      });
    }
  });

  describe('SRD 5.2.1 backgrounds (all 4 present with an originFeatId)', () => {
    for (const backgroundId of REQUIRED_BACKGROUNDS) {
      it(`${backgroundId} ships with an originFeatId that resolves to a feat in the pack`, () => {
        const bg = PACK.backgrounds?.find((b) => b.id === backgroundId);
        expect(bg, `background ${backgroundId} missing from pack`).toBeDefined();
        expect(bg!.originFeatId, `${backgroundId} missing originFeatId`).toBeTruthy();
        const originFeat = PACK.feats?.find((f) => f.id === bg!.originFeatId);
        expect(originFeat, `${backgroundId}'s originFeatId '${bg!.originFeatId}' not in pack feats`).toBeDefined();
      });
    }
  });

  describe('RAW conditions (all 15 present)', () => {
    for (const conditionId of RAW_CONDITIONS) {
      it(`${conditionId} is in the pack`, () => {
        const condition = PACK.conditions?.find((c) => c.id === conditionId);
        expect(condition, `RAW condition ${conditionId} missing`).toBeDefined();
      });
    }
  });

  describe('slice 618 OfferChoice cascade (fresh L1 character gets onAcquire choices)', () => {
    it('fresh L1 Fighter emits Fighting Style ChoiceRequired with the 6 SRD options', () => {
      const rng = seededRNG(1);
      const engine = createEngine({ contentPacks: [PACK], rng });
      const fighter: Character = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'L1 Fighter',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 12, max: 12, temp: 0 },
      });
      let campaign = engine.createCampaign({ name: 'l1-complete-audit' });
      campaign = commit(campaign, [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'CharacterCreated',
          snapshot: fighter,
        } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.offerCharacterChoices(campaign.state, {
        characterId: fighter.id,
      });
      const fsChoice = events.find(
        (e): e is ChoiceRequiredEvent =>
          e.type === 'ChoiceRequired' && e.promptKey === 'fighting-style-fighter',
      );
      expect(fsChoice, 'slice 618 OfferCharacterChoices did not emit fighting-style choice').toBeDefined();
      const optionIds = fsChoice?.options.map((o) => o.id).sort();
      expect(optionIds).toEqual(['archery', 'defense', 'dueling', 'great-weapon', 'protection', 'two-weapon']);
    });
  });
});
