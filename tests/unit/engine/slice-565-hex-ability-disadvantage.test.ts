// Slice 565: Hex ability-disadvantage rider.
//
// RAW (SRD 5.2.1 Hex, Warlock L1): "Until the spell ends, you deal an
// extra 1d6 Necrotic damage to the target whenever you hit it with an
// attack roll. Also, choose one ability when you cast the spell. The
// target has Disadvantage on ability checks made with the chosen
// ability."
//
// Pre-slice the engine wired the damage rider (slice 88, target-side
// OnEvent + AddDamage) but had no ability-disadvantage rider. The
// `hexed-active` condition's description carried a "RAW also gives the
// caster Disadvantage on one chosen ability check (nested sub-choice
// not modeled; consumer carries the ability name out-of-band)" note.
//
// This slice replaces the single `hexed-active` condition with 6
// ability-keyed variants (`hexed-STR-active` ... `hexed-CHA-active`),
// each carrying the existing damage rider PLUS a SetAdvantage that
// imposes Disadvantage on ability checks made with that ability.
// Hex's `buff` mechanic switches to `casterChoosesVariant` over the 6
// variants; the cast intent's `casterChoice: { kind: 'variant', value:
// 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' }` selects the
// applied variant.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AbilityCheckRolledEvent } from '../../../src/schemas/events/index.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();
const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
type Ability = (typeof ABILITIES)[number];

const buildHexer = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hexer',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'warlock', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 10, WIS: 12, CHA: 16 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: ['hex'],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Hex ability-disadvantage rider (slice 565)', () => {
  describe('pack declaration', () => {
    it('Hex uses casterChoosesVariant over the 6 ability-keyed variants', () => {
      const hex = PACK.spells?.find((s) => s.id === 'hex');
      expect(hex).toBeDefined();
      const buff = hex!.mechanicalEffects?.find((m) => m.kind === 'buff');
      expect(buff).toBeDefined();
      const variants = (buff as { casterChoosesVariant?: { variants: { key: string; conditionId: string }[] } }).casterChoosesVariant?.variants;
      expect(variants).toBeDefined();
      expect(variants!.map((v) => v.key)).toEqual([...ABILITIES]);
    });

    for (const ability of ABILITIES) {
      it(`hexed-${ability}-active ships with the damage rider + SetAdvantage on ${ability} checks`, () => {
        const cond = PACK.conditions?.find((c) => c.id === `hexed-${ability}-active`);
        expect(cond, `hexed-${ability}-active should be in the pack`).toBeDefined();
        const damageRider = cond!.effects.find(
          (e) => e.kind === 'OnEvent' && (e as { id?: string }).id === 'hex-damage-rider',
        );
        expect(damageRider, 'damage rider preserved from slice 88').toBeDefined();
        const setAdv = cond!.effects.find((e) => e.kind === 'SetAdvantage') as
          | { on: { kind: string; ability?: string }; mode: string }
          | undefined;
        expect(setAdv).toBeDefined();
        expect(setAdv!.mode).toBe('disadvantage');
        expect(setAdv!.on).toEqual({ kind: 'check', ability });
      });
    }

    it('hexed-active (legacy) is removed', () => {
      const legacy = PACK.conditions?.find((c) => c.id === 'hexed-active');
      expect(legacy).toBeUndefined();
    });
  });

  describe('cast applies the chosen variant + imposes disadvantage on that ability check', () => {
    for (const ability of ABILITIES) {
      it(`casterChoice ${ability} → hexed-${ability}-active applied to target`, () => {
        const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
        const hexer = buildHexer();
        const target = buildTarget();
        let campaign = engine.createCampaign({ name: `hex-${ability}` });
        campaign = commit(campaign, [
          { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hexer } satisfies CharacterCreatedEvent,
          { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        ]);
        const { events } = engine.plan.castSpell(campaign.state, {
          characterId: hexer.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
          casterChoice: { kind: 'variant', value: ability },
        });
        const condApplied = events.find((e): e is ConditionAppliedEvent =>
          (e as { type: string }).type === 'ConditionApplied'
          && (e as { conditionId?: string }).conditionId === `hexed-${ability}-active`);
        expect(condApplied).toBeDefined();
        expect(condApplied!.targetId).toBe(target.id);
        expect(condApplied!.sourceCharacterId).toBe(hexer.id);
      });

      it(`target with hexed-${ability}-active rolls ${ability} ability check with disadvantage`, () => {
        const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(7) });
        const hexer = buildHexer();
        const target = buildTarget();
        let campaign = engine.createCampaign({ name: `hex-${ability}-check` });
        campaign = commit(campaign, [
          { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hexer } satisfies CharacterCreatedEvent,
          { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
        ]);
        campaign = commit(
          campaign,
          engine.plan.castSpell(campaign.state, {
            characterId: hexer.id,
            spellId: 'hex',
            slotLevel: 1,
            targetIds: [target.id],
            casterChoice: { kind: 'variant', value: ability },
          }).events,
        );
        const { events } = engine.plan.abilityCheck(campaign.state, {
          characterId: target.id,
          ability,
        });
        const checkEvent = events.find((e): e is AbilityCheckRolledEvent =>
          (e as { type: string }).type === 'AbilityCheckRolled');
        expect(checkEvent).toBeDefined();
        expect(checkEvent!.used).toBe('disadvantage');
      });
    }
  });

  describe('the OTHER five ability checks are unaffected', () => {
    it('hexed-STR-active does NOT impose disadvantage on DEX / CON / INT / WIS / CHA checks', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(11) });
      const hexer = buildHexer();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'hex-STR-scope' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hexer } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.castSpell(campaign.state, {
          characterId: hexer.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
          casterChoice: { kind: 'variant', value: 'STR' },
        }).events,
      );
      for (const otherAbility of ['DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
        const { events } = engine.plan.abilityCheck(campaign.state, {
          characterId: target.id,
          ability: otherAbility,
        });
        const checkEvent = events.find((e): e is AbilityCheckRolledEvent =>
          (e as { type: string }).type === 'AbilityCheckRolled');
        expect(checkEvent, `${otherAbility} check should have rolled`).toBeDefined();
        expect(checkEvent!.used, `${otherAbility} check should NOT be at disadvantage when STR is hexed`).toBe('none');
      }
    });
  });

  describe('cast without casterChoice fails at plan time', () => {
    it('Hex without a casterChoice throws (casterChoosesVariant is required)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const hexer = buildHexer();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'hex-nochoice' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: hexer } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.castSpell(campaign.state, {
          characterId: hexer.id,
          spellId: 'hex',
          slotLevel: 1,
          targetIds: [target.id],
        }),
      ).toThrow(/casterChoice/i);
    });
  });
});
