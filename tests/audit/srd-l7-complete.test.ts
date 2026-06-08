// Slice 742: CI-guarded "L7 SRD complete" floor audit.
//
// Companion to the L1-L6 floors. Pins the surface that constitutes a
// complete L7 SRD experience. Every L7 row (base class + subclass) is wired:
//
//   Base classes:
//     - Monk Evasion; Rogue Evasion + Reliable Talent (738);
//     - Barbarian Feral Instinct + Instinctive Pounce (741);
//     - Bard Countercharm (740); Cleric Blessed Strikes;
//     - Druid Elemental Fury (739); Sorcerer Sorcery Incarnate.
//     (Fighter / Paladin / Ranger / Wizard gain a subclass feature or just
//      spell slots at L7 — no base-class L7 feature.)
//   Subclasses (L7): Champion Additional Fighting Style, Oath of Devotion
//     Aura of Devotion, Hunter Defensive Tactics, Life/Draconic/Fiend L7
//     spell grants.
//   Spell slots: full casters reach 4th-level slots; Warlock pact reaches
//     4th-level pact slots.
//
// Companion infra: the fuzz matrix extends to L7 (fuzz-matrix.test.ts).

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

const buildPC = (classId: string, level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `${classId}-${level}`,
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId, level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 14, WIS: 14, CHA: 14 },
    hp: { current: 40, max: 40, temp: 0 },
  });

describe('slice 742: SRD L7 completeness audit', () => {
  describe('Section 1: base-class L7 features', () => {
    it('Monk Evasion (GrantEvasion)', () => {
      expect(hasEffect(findFeature('monk', '7', 'evasion-monk'), 'GrantEvasion')).toBe(true);
    });
    it('Rogue Evasion + Reliable Talent', () => {
      expect(hasEffect(findFeature('rogue', '7', 'evasion-rogue'), 'GrantEvasion')).toBe(true);
      expect(hasEffect(findFeature('rogue', '7', 'reliable-talent'), 'GrantReliableTalent')).toBe(true);
    });
    it('Barbarian Feral Instinct + Instinctive Pounce', () => {
      expect(hasEffect(findFeature('barbarian', '7', 'feral-instinct'), 'SetAdvantage')).toBe(true);
      expect(hasEffect(findFeature('barbarian', '7', 'instinctive-pounce'), 'Custom')).toBe(true);
    });
    it('Bard Countercharm (planner-backed marker)', () => {
      expect(hasEffect(findFeature('bard', '7', 'countercharm'), 'Custom')).toBe(true);
    });
    it('Cleric Blessed Strikes + Druid Elemental Fury (OfferChoice)', () => {
      expect(hasEffect(findFeature('cleric', '7', 'blessed-strikes'), 'OfferChoice')).toBe(true);
      expect(hasEffect(findFeature('druid', '7', 'elemental-fury'), 'OfferChoice')).toBe(true);
    });
    it('Sorcerer Sorcery Incarnate (GrantInnateSorcerySpendAlternative)', () => {
      expect(hasEffect(findFeature('sorcerer', '7', 'sorcery-incarnate'), 'GrantInnateSorcerySpendAlternative')).toBe(true);
    });
  });

  describe('Section 2: subclass L7 features', () => {
    it('Champion Additional Fighting Style (OfferChoice)', () => {
      expect(hasEffect(findSubclassFeature('champion', '7', 'additional-fighting-style'), 'OfferChoice')).toBe(true);
    });
    it('Oath of Devotion Aura of Devotion (GrantAura)', () => {
      expect(hasEffect(findSubclassFeature('oath-of-devotion', '7', 'aura-of-devotion'), 'GrantAura')).toBe(true);
    });
    it('Hunter Defensive Tactics (OfferChoice)', () => {
      expect(hasEffect(findSubclassFeature('hunter', '7', 'defensive-tactics'), 'OfferChoice')).toBe(true);
    });
    it('Life / Draconic / Fiend L7 spell grants (GrantSpell)', () => {
      expect(hasEffect(findSubclassFeature('life-domain', '7', 'life-domain-spells-l7'), 'GrantSpell')).toBe(true);
      expect(hasEffect(findSubclassFeature('draconic-sorcery', '7', 'draconic-spells-l7'), 'GrantSpell')).toBe(true);
      expect(hasEffect(findSubclassFeature('fiend-patron', '7', 'fiend-spells-l7'), 'GrantSpell')).toBe(true);
    });
  });

  describe('Section 3: planner + effect-kind presence for L7 features', () => {
    it('planCountercharm is exported', () => {
      expect(typeof plan['planCountercharm']).toBe('function');
    });
    it('GrantReliableTalent is a registered effect kind', () => {
      expect((EFFECT_KINDS as ReadonlyArray<string>).includes('GrantReliableTalent')).toBe(true);
    });
  });

  describe('Section 4: behavioral — leveling 6→7', () => {
    it('a Wizard leveling 6→7 gains a 4th-level spell slot', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const wiz = buildPC('wizard', 6);
      let campaign = engine.createCampaign({ name: 'l7-slots' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wiz } satisfies CharacterCreatedEvent,
      ]);
      expect((computeAvailableSpellSlots(campaign.state.characters[wiz.id]!, CONTENT.classes).standardByLevel[3] ?? 0)).toBe(0);
      campaign = commit(campaign, engine.plan.levelUp(campaign.state, { characterId: wiz.id, classId: 'wizard', hpStrategy: 'average' }).events);
      const leveled = campaign.state.characters[wiz.id]!;
      expect(leveled.classes[0]!.level).toBe(7);
      expect(computeAvailableSpellSlots(leveled, CONTENT.classes).standardByLevel[3] ?? 0).toBeGreaterThan(0);
    });
    it('a Rogue leveling 6→7 gains Reliable Talent', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
      const rogue = buildPC('rogue', 6);
      const hasRT = (c: Character): boolean =>
        buildEffectStack({ character: c, content: CONTENT, itemInstances: {}, pendingChoices: {} }).hasReliableTalent();
      expect(hasRT(rogue)).toBe(false);
      let campaign = engine.createCampaign({ name: 'l7-rt' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: rogue } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(campaign, engine.plan.levelUp(campaign.state, { characterId: rogue.id, classId: 'rogue', hpStrategy: 'average' }).events);
      const leveled = campaign.state.characters[rogue.id]!;
      expect(leveled.classes[0]!.level).toBe(7);
      expect(hasRT(leveled)).toBe(true);
    });
  });

  describe('Section 5: spell-slot milestone at L7', () => {
    for (const classId of ['bard', 'cleric', 'druid', 'sorcerer', 'wizard']) {
      it(`${classId} (full caster) has a 4th-level slot at L7`, () => {
        const slots = computeAvailableSpellSlots(buildPC(classId, 7), CONTENT.classes);
        expect(slots.standardByLevel[3] ?? 0, `${classId} has no 4th-level slot`).toBeGreaterThan(0);
      });
    }
    for (const classId of ['paladin', 'ranger']) {
      it(`${classId} (half caster) has a 2nd-level slot at L7`, () => {
        const slots = computeAvailableSpellSlots(buildPC(classId, 7), CONTENT.classes);
        expect(slots.standardByLevel[1] ?? 0, `${classId} has no 2nd-level slot`).toBeGreaterThan(0);
      });
    }
    it('warlock Pact Magic reaches 4th-level slots at L7', () => {
      const slots = computeAvailableSpellSlots(buildPC('warlock', 7), CONTENT.classes);
      expect(slots.pact?.level, 'warlock pact slot not at level 4').toBe(4);
    });
  });
});
