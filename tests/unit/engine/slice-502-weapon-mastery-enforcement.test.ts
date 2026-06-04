// Slice 502: Weapon Mastery enforcement (full RAW — chosen weapon kinds).
//
// RAW (2024 Weapon Mastery, Fighter/Barbarian/Paladin/Ranger/Rogue): a
// martial character chooses a number of specific weapon kinds (Fighter 3,
// the others 2) and may use the mastery property of a weapon only if it
// is one of those chosen kinds AND they have proficiency with it.
//
// Before this slice the engine applied any weapon's intrinsic mastery to
// any wielder for free. Now:
//   - `character.weaponMasteries` stores the chosen weapon definition ids.
//   - `planChooseWeaponMasteries` validates a selection against the
//     mastery slot budget (GrantWeaponMastery.slots), the granted property
//     pool, and weapon proficiency, then emits `WeaponMasteriesChosen`.
//   - `canUseWeaponMastery` gates the four mastery read sites
//     (planWeaponMastery, planCleave, planOffHandAttack's Nick branch;
//     Flex is exempt as the engine's versatile-toggle extension).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { replay } from '../../../src/engine/replay.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { canUseWeaponMastery } from '../../../src/derive/weapon-mastery.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildFighter = (weaponMasteries: string[] = []): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Fighter',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    weaponMasteries,
  });

const buildRogue = (weaponMasteries: string[] = []): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Rogue',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 9, max: 9, temp: 0 },
    weaponMasteries,
  });

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const stackFor = (character: Character) =>
  buildEffectStack({ character, content: CONTENT, itemInstances: {}, pendingChoices: {} });
const weaponDef = (id: string) => {
  const def = CONTENT.items.get(id);
  if (def === undefined || def.itemKind !== 'weapon') throw new Error(`not a weapon: ${id}`);
  return def;
};

describe('Weapon Mastery enforcement (slice 502)', () => {
  describe('effect-stack budget', () => {
    it('a L1 fighter has a 3-weapon mastery budget; the 8 RAW properties are granted', () => {
      const stack = stackFor(buildFighter());
      expect(stack.weaponMasterySlots()).toBe(3);
      expect(stack.grantedWeaponMasteryProperties().has('Topple')).toBe(true);
      expect(stack.grantedWeaponMasteryProperties().has('Cleave')).toBe(true);
    });
    it('a L1 rogue has a 2-weapon budget', () => {
      expect(stackFor(buildRogue()).weaponMasterySlots()).toBe(2);
    });
    it('a wizard has no mastery budget', () => {
      expect(stackFor(buildWizard()).weaponMasterySlots()).toBe(0);
    });
  });

  describe('canUseWeaponMastery gate', () => {
    it('false when the weapon kind was not chosen', () => {
      expect(canUseWeaponMastery(buildFighter([]), weaponDef('quarterstaff'), CONTENT)).toBe(false);
    });
    it('true when chosen and proficient', () => {
      expect(canUseWeaponMastery(buildFighter(['quarterstaff']), weaponDef('quarterstaff'), CONTENT)).toBe(true);
    });
    it('false when chosen but NOT proficient (rogue + martial greataxe)', () => {
      expect(canUseWeaponMastery(buildRogue(['greataxe']), weaponDef('greataxe'), CONTENT)).toBe(false);
    });
    it('Flex is exempt (applies without being chosen)', () => {
      // No SRD weapon carries Flex, so synthesize a Flex weapon shape for
      // the helper; it should return true regardless of the chosen set.
      const flexWeapon = { ...weaponDef('longsword'), id: 'synthetic-flex', mastery: 'Flex' as const };
      expect(canUseWeaponMastery(buildFighter([]), flexWeapon, CONTENT)).toBe(true);
    });
  });

  describe('planChooseWeaponMasteries validation', () => {
    const setup = (character: Character) => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      let campaign: Campaign = engine.createCampaign({ name: 'choose' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
      ]);
      return { engine, campaign };
    };

    it('a valid choice within budget emits WeaponMasteriesChosen and the reducer stores it', () => {
      const fighter = buildFighter();
      const { engine, campaign } = setup(fighter);
      const events = engine.plan.chooseWeaponMasteries(campaign.state, {
        characterId: fighter.id,
        weaponDefinitionIds: ['quarterstaff', 'greataxe', 'longsword'],
      }).events;
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('WeaponMasteriesChosen');
      const after = commit(campaign, events);
      expect(after.state.characters[fighter.id]!.weaponMasteries).toEqual([
        'quarterstaff', 'greataxe', 'longsword',
      ]);
    });

    it('choosing more weapons than the budget throws', () => {
      const fighter = buildFighter();
      const { engine, campaign } = setup(fighter);
      expect(() =>
        engine.plan.chooseWeaponMasteries(campaign.state, {
          characterId: fighter.id,
          weaponDefinitionIds: ['quarterstaff', 'greataxe', 'longsword', 'club'],
        }),
      ).toThrow(/can master at most 3/i);
    });

    it('choosing a weapon the character is not proficient with throws', () => {
      const rogue = buildRogue();
      const { engine, campaign } = setup(rogue);
      expect(() =>
        engine.plan.chooseWeaponMasteries(campaign.state, {
          characterId: rogue.id,
          weaponDefinitionIds: ['greataxe'],
        }),
      ).toThrow(/not proficient/i);
    });

    it('choosing a weapon with no mastery property throws', () => {
      const fighter = buildFighter();
      const { engine, campaign } = setup(fighter);
      expect(() =>
        engine.plan.chooseWeaponMasteries(campaign.state, {
          characterId: fighter.id,
          weaponDefinitionIds: ['unarmed-strike'],
        }),
      ).toThrow(/no mastery property/i);
    });

    it('a class without the Weapon Mastery feature cannot choose', () => {
      const wizard = buildWizard();
      const { engine, campaign } = setup(wizard);
      expect(() =>
        engine.plan.chooseWeaponMasteries(campaign.state, {
          characterId: wizard.id,
          weaponDefinitionIds: ['quarterstaff'],
        }),
      ).toThrow(/does not have the Weapon Mastery feature/i);
    });

    it('the chosen selection replays equivalently', () => {
      const fighter = buildFighter();
      const { engine, campaign } = setup(fighter);
      const events = engine.plan.chooseWeaponMasteries(campaign.state, {
        characterId: fighter.id,
        weaponDefinitionIds: ['quarterstaff'],
      }).events;
      const after = commit(campaign, events);
      expect(replay(after.events)).toEqual(after.state);
    });
  });

  describe('planWeaponMastery gate (Topple via quarterstaff)', () => {
    const run = (fighterMasteries: string[]) => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
      const fighter = buildFighter(fighterMasteries);
      const target = buildTarget();
      const staff = makeItemInstance('quarterstaff');
      let campaign: Campaign = engine.createCampaign({ name: 'topple' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: staff },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      return () => engine.plan.weaponMastery(campaign.state, {
        mastery: 'Topple',
        attackerId: fighter.id,
        targetId: target.id,
        weaponInstanceId: staff.id,
      });
    };

    it('throws when the fighter has not mastered the quarterstaff', () => {
      expect(run([])).toThrow(/has not mastered/i);
    });
    it('succeeds (rolls the CON save) once the quarterstaff is mastered', () => {
      const events = run(['quarterstaff'])().events;
      expect(events.some((e) => e.type === 'WeaponMasteryActivated')).toBe(true);
      expect(events.some((e) => e.type === 'SaveRolled')).toBe(true);
    });
  });

  describe('planCleave gate', () => {
    const run = (fighterMasteries: string[]) => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
      const fighter = buildFighter(fighterMasteries);
      const t1 = buildTarget();
      const t2 = buildTarget();
      const axe = makeItemInstance('greataxe');
      let campaign: Campaign = engine.createCampaign({ name: 'cleave' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: axe },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fighter } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t1 } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t2 } satisfies CharacterCreatedEvent,
      ]);
      return () => engine.plan.cleave(campaign.state, {
        attackerId: fighter.id,
        secondaryTargetId: t2.id,
        weaponInstanceId: axe.id,
        triggeringAttackEventId: eventId(),
      });
    };

    it('throws when the greataxe was not mastered', () => {
      expect(run([])).toThrow(/has not mastered/i);
    });
    it('resolves once the greataxe is mastered', () => {
      const events = run(['greataxe'])().events;
      expect(events.some((e) => e.type === 'AttackRolled')).toBe(true);
    });
  });
});
