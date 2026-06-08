// Slice 734: CI-guarded "L6 SRD complete" floor audit.
//
// Companion to the L1-L5 floors (srd-l{1,2,3,4,5}-complete.test.ts). Pins
// the surface that constitutes a complete L6 SRD experience. Every L6 row
// (base class + subclass) is now wired:
//
//   Base classes:
//     - Fighter: Ability Score Improvement (a second extra ASI, slice 727)
//     - Rogue: Expertise (second pick)
//     - Monk: Empowered Strikes (unarmed strikes count as magical)
//     - Paladin: Aura of Protection (GrantAura + the CHA-mod save bonus)
//     - Barbarian: more Rage uses; Cleric: second Channel Divinity use;
//       Druid: third Wild Shape use; Ranger: Roving (+speed, climb/swim)
//   Subclasses (this cycle, slices 728-733, + pre-existing 204/357):
//     - Berserker Mindless Rage (728), Life Blessed Healer (731),
//       Land Natural Recovery (729), Fiend Dark One's Own Luck (730),
//       Evoker Sculpt Spells (732), Lore Magical Discoveries (733),
//       Draconic Elemental Affinity (204), Open Hand Wholeness of Body (357)
//
// Companion infra: the fuzz matrix extends to L6 (fuzz-matrix.test.ts).

import { describe, expect, it } from 'vitest';
import * as planNs from '../../src/engine/plan/index.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { computeAvailableSpellSlots } from '../../src/derive/spell-slots.js';
import { buildEffectStack } from '../../src/derive/effect-stack.js';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { commit } from '../../src/engine/commit.js';
import { EFFECT_KINDS } from '../../src/schemas/effects.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../src/ids.js';
import { eventId, isoTimestamp } from '../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);
const plan = planNs as Record<string, unknown>;

interface PackFeature {
  readonly id: string;
  readonly effects?: ReadonlyArray<{ kind: string; [k: string]: unknown }>;
}
const findFeature = (classId: string, level: string, featureId: string): PackFeature | undefined =>
  ((PACK.classes?.find((c) => c.id === classId)?.levelTable?.[level]?.features as ReadonlyArray<PackFeature>) ?? []).find(
    (f) => f.id === featureId,
  );
const findSubclassFeature = (subclassId: string, level: string, featureId: string): PackFeature | undefined =>
  ((PACK.subclasses?.find((s) => s.id === subclassId)?.levelGrants?.[level] as ReadonlyArray<PackFeature>) ?? []).find(
    (f) => f.id === featureId,
  );
const hasEffect = (feature: PackFeature | undefined, kind: string): boolean =>
  (feature?.effects ?? []).some((e) => e.kind === kind);

const buildPC = (classId: string, level: number, extra: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `${classId}-${level}`,
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId, level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 12, WIS: 12, CHA: 12 },
    hp: { current: 36, max: 36, temp: 0 },
    ...extra,
  });

describe('slice 734: SRD L6 completeness audit', () => {
  describe('Section 1: base-class L6 features', () => {
    it('Fighter L6 grants an Ability Score Improvement (OfferChoice)', () => {
      const f = findFeature('fighter', '6', 'ability-score-improvement-6');
      expect(f, "fighter L6 missing 'ability-score-improvement-6'").toBeDefined();
      expect(hasEffect(f, 'OfferChoice')).toBe(true);
    });
    it('Rogue L6 grants a second Expertise (OfferChoice)', () => {
      const f = findFeature('rogue', '6', 'expertise-rogue-2');
      expect(f, "rogue L6 missing 'expertise-rogue-2'").toBeDefined();
      expect(hasEffect(f, 'OfferChoice')).toBe(true);
    });
    // Empowered Strikes is wired, but to the 2014 "Ki-Empowered Strikes"
    // semantics (GrantUnarmedAsMagical: unarmed strikes count as magical).
    // SRD 5.2.1 is the Force-damage-type choice ("it can deal your choice of
    // Force damage or its normal damage type"). Re-wiring to 2024 is the one
    // tracked L6 correctness follow-up (see gaps-class-features.md); the
    // floor only pins that the row is wired, not the (drifted) semantics.
    it('Monk L6 Empowered Strikes is wired', () => {
      const f = findFeature('monk', '6', 'empowered-strikes');
      expect(f, "monk L6 missing 'empowered-strikes'").toBeDefined();
      expect((f?.effects ?? []).length, 'empowered-strikes carries no effect').toBeGreaterThan(0);
    });
    it('Paladin L6 grants Aura of Protection (GrantAura)', () => {
      const f = findFeature('paladin', '6', 'aura-of-protection');
      expect(f, "paladin L6 missing 'aura-of-protection'").toBeDefined();
      expect(hasEffect(f, 'GrantAura')).toBe(true);
    });
    it('Barbarian / Cleric / Druid / Ranger carry their L6 rows', () => {
      expect(hasEffect(findFeature('barbarian', '6', 'rage-uses-4'), 'GrantResource')).toBe(true);
      expect(hasEffect(findFeature('cleric', '6', 'channel-divinity-cleric-2'), 'GrantResource')).toBe(true);
      expect(hasEffect(findFeature('druid', '6', 'wild-shape-uses-3'), 'GrantResource')).toBe(true);
      expect(hasEffect(findFeature('ranger', '6', 'roving'), 'ModifySpeed')).toBe(true);
    });
  });

  describe('Section 2: subclass L6 features (slices 728-733 + 204/357)', () => {
    it('Life Domain Blessed Healer (GrantBlessedHealer)', () => {
      expect(hasEffect(findSubclassFeature('life-domain', '6', 'blessed-healer'), 'GrantBlessedHealer')).toBe(true);
    });
    it('Evoker Sculpt Spells (GrantSculptSpells)', () => {
      expect(hasEffect(findSubclassFeature('evoker', '6', 'sculpt-spells'), 'GrantSculptSpells')).toBe(true);
    });
    it('Circle of the Land Natural Recovery (GrantResource gate)', () => {
      expect(hasEffect(findSubclassFeature('circle-of-the-land', '6', 'natural-recovery'), 'GrantResource')).toBe(true);
    });
    it("Fiend Patron Dark One's Own Luck (GrantResource gate)", () => {
      expect(hasEffect(findSubclassFeature('fiend-patron', '6', 'dark-ones-own-luck'), 'GrantResource')).toBe(true);
    });
    it('College of Lore Magical Discoveries (OfferChoice)', () => {
      expect(hasEffect(findSubclassFeature('college-of-lore', '6', 'magical-discoveries'), 'OfferChoice')).toBe(true);
    });
    it('Draconic Sorcery Elemental Affinity (OfferChoice)', () => {
      expect(hasEffect(findSubclassFeature('draconic-sorcery', '6', 'elemental-affinity'), 'OfferChoice')).toBe(true);
    });
    it('Open Hand Wholeness of Body (GrantResource)', () => {
      expect(hasEffect(findSubclassFeature('warrior-of-the-open-hand', '6', 'wholeness-of-body'), 'GrantResource')).toBe(true);
    });
    // Berserker Mindless Rage is a planner-gated marker (the behavior lives
    // in planRage at subclass + L6), so the row carries no effect — like the
    // L5 sear-undead / tactical-shift markers.
    it('Path of the Berserker Mindless Rage row exists (planner-gated)', () => {
      expect(findSubclassFeature('path-of-the-berserker', '6', 'mindless-rage')).toBeDefined();
    });
  });

  describe('Section 3: planner + effect-kind presence for L6 features', () => {
    for (const exportName of ['planNaturalRecovery', 'planDarkOnesOwnLuck', 'planRage']) {
      it(`${exportName} is exported`, () => {
        expect(typeof plan[exportName], `${exportName} not exported from src/engine/plan`).toBe('function');
      });
    }
    for (const kind of ['GrantSculptSpells', 'GrantBlessedHealer', 'GrantUnarmedAsMagical']) {
      it(`${kind} is a registered effect kind`, () => {
        expect((EFFECT_KINDS as ReadonlyArray<string>).includes(kind)).toBe(true);
      });
    }
  });

  describe('Section 4: behavioral — leveling 5→6 grants Empowered Strikes', () => {
    const unarmedMagical = (character: Character): boolean =>
      buildEffectStack({ character, content: CONTENT, itemInstances: {}, pendingChoices: {} }).hasUnarmedAsMagical();

    it("a Monk's unarmed strikes become magical only at L6", () => {
      expect(unarmedMagical(buildPC('monk', 5, { classes: [{ classId: 'monk', level: 5, hitDiceRemaining: 5, subclassId: 'warrior-of-the-open-hand' }] }))).toBe(false);
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const monk = buildPC('monk', 5, { classes: [{ classId: 'monk', level: 5, hitDiceRemaining: 5, subclassId: 'warrior-of-the-open-hand' }] });
      let campaign = engine.createCampaign({ name: 'l6-empowered-strikes' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monk } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(campaign, engine.plan.levelUp(campaign.state, {
        characterId: monk.id, classId: 'monk', hpStrategy: 'average',
      }).events);
      const leveled = campaign.state.characters[monk.id]!;
      expect(leveled.classes[0]!.level).toBe(6);
      expect(unarmedMagical(leveled)).toBe(true);
    });
  });

  describe('Section 5: spell-slot floor carries to L6', () => {
    for (const classId of ['bard', 'cleric', 'druid', 'sorcerer', 'wizard']) {
      it(`${classId} (full caster) has a 3rd-level slot at L6`, () => {
        const slots = computeAvailableSpellSlots(buildPC(classId, 6), CONTENT.classes);
        expect(slots.standardByLevel[2] ?? 0, `${classId} has no 3rd-level slot`).toBeGreaterThan(0);
      });
    }
    for (const classId of ['paladin', 'ranger']) {
      it(`${classId} (half caster) has a 2nd-level slot at L6`, () => {
        const slots = computeAvailableSpellSlots(buildPC(classId, 6), CONTENT.classes);
        expect(slots.standardByLevel[1] ?? 0, `${classId} has no 2nd-level slot`).toBeGreaterThan(0);
      });
    }
    it('warlock Pact Magic is at 3rd-level slots at L6', () => {
      const slots = computeAvailableSpellSlots(buildPC('warlock', 6), CONTENT.classes);
      expect(slots.pact?.level, 'warlock pact slot not at level 3').toBe(3);
    });
  });
});
