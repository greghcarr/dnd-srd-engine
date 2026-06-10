// Slice 783: Sleep rewired to the SRD 5.2.1 mechanic (replacing the 2014
// HP-pool knockout).
//
// RAW (spells.md): "Each creature of your choice in a 5-foot-radius Sphere...
// must succeed on a Wisdom saving throw or have the Incapacitated condition
// until the end of its next turn, at which point it must repeat the save. If
// the target fails the second save, the target has the Unconscious condition
// for the duration. The spell ends on a target if it takes damage... Creatures
// that don't sleep, such as elves, or that have Immunity to the Exhaustion
// condition automatically succeed." Concentration, up to 1 minute.
//
// Wiring (all existing primitives + a small propagation fix):
//   - save mechanic (WIS) -> sleep-drowsy-active (Incapacitated via
//     ACTION_BLOCKING_CONDITIONS), conditionEndsOnDamage, concentration.
//   - sleep-drowsy-active.recurringSave escalates to 'unconscious' on a 2nd
//     failed save (existing escalateToCondition arm).
//   - recurring-save escalation now propagates endsOnDamage +
//     sourceEffectInstanceId onto the escalated Unconscious.
//   - autoSucceedIfImmuneToConditionId 'exhaustion' + Elf Trance immunity to
//     sleep-drowsy-active drive the auto-succeed clause.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConcentrationStartedEvent } from '../../../src/schemas/events/concentration.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Caster', speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 16, WIS: 10, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    knownSpells: ['sleep'], preparedSpells: ['sleep'],
  });

const buildTarget = (speciesId = 'human', WIS = 6): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Sleeper', speciesId, backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 12, INT: 10, WIS, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

const buildSkeleton = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), kind: 'creature', name: 'Skeleton', speciesId: 'companion',
    backgroundId: 'companion', statblockId: 'skeleton',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 14, CON: 15, INT: 6, WIS: 8, CHA: 5 },
    hp: { current: 13, max: 13, temp: 0 },
  });

const seed2Characters = (engine: ReturnType<typeof createEngine>, name: string, a: Character, b: Character): Campaign => {
  let campaign = engine.createCampaign({ name });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: b } satisfies CharacterCreatedEvent,
  ]);
  return campaign;
};

describe('Sleep — SRD 5.2.1 save mechanic (slice 783)', () => {
  it('pack: Sleep is a WIS save -> sleep-drowsy-active, concentration, ends-on-damage, exhaustion auto-succeed', () => {
    const sleep = PACK.spells.find((s) => s.id === 'sleep');
    expect(sleep?.concentration).toBe(true);
    expect(sleep?.mechanicalEffects).toEqual([
      {
        kind: 'save',
        ability: 'WIS',
        conditionOnFail: 'sleep-drowsy-active',
        conditionEndsOnDamage: true,
        autoSucceedIfImmuneToConditionId: 'exhaustion',
      },
    ]);
  });

  it('pack: sleep-drowsy-active escalates to Unconscious on the 2nd failed save', () => {
    const c = PACK.conditions.find((cc) => cc.id === 'sleep-drowsy-active');
    expect(c?.recurringSave).toEqual({
      ability: 'WIS',
      trigger: 'turnEnd',
      onSuccess: 'removeCondition',
      onFail: 'escalateToCondition',
      escalateToConditionId: 'unconscious',
    });
  });

  it('pack: Elf Trance grants immunity to sleep-drowsy-active', () => {
    const elf = PACK.species?.find((s) => s.id === 'elf');
    const immunity = elf?.traits?.find(
      (t) => t.kind === 'GrantConditionImmunity' && (t as { conditionId?: string }).conditionId === 'sleep-drowsy-active',
    );
    expect(immunity).toBeDefined();
  });

  it('cast: a target that fails the WIS save gets sleep-drowsy-active, concentration-bound + ends-on-damage', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const caster = buildWizard();
      const target = buildTarget();
      const campaign = seed2Characters(engine, `cast-${seed}`, caster, target);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: caster.id, spellId: 'sleep', slotLevel: 1, targetIds: [target.id],
      });
      const save = events.find(
        (e): e is SaveRolledEvent => e.type === 'SaveRolled' && (e as SaveRolledEvent).targetId === target.id,
      );
      if (save === undefined || save.success) continue;
      expect(save.ability).toBe('WIS');
      const drowsy = events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'sleep-drowsy-active',
      );
      expect(drowsy?.targetId).toBe(target.id);
      expect(drowsy?.endsOnDamage).toBe(true);
      const conc = events.find((e): e is ConcentrationStartedEvent => e.type === 'ConcentrationStarted');
      expect(conc).toBeDefined();
      expect(drowsy?.sourceEffectInstanceId).toBe(conc?.effectInstanceId);
      return;
    }
    throw new Error('no seed where the target failed the Sleep save');
  });

  it('tick: a 2nd failed save removes drowsy + applies Unconscious, carrying ends-on-damage + the concentration link', () => {
    const effectId = newAppliedConditionId(); // stand-in concentration effect id
    for (let seed = 1; seed < 40; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const caster = buildWizard();
      const base = buildTarget();
      const target: Character = {
        ...base,
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'sleep-drowsy-active',
          sourceCharacterId: caster.id,
          endsOnDamage: true,
          sourceEffectInstanceId: effectId,
        }],
      };
      const campaign = seed2Characters(engine, `tick-fail-${seed}`, caster, target);
      const { events } = engine.plan.tickRecurringSave(campaign.state, {
        targetId: target.id, conditionId: 'sleep-drowsy-active',
      });
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (save?.success !== false) continue;
      const removed = events.find(
        (e): e is ConditionRemovedEvent => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'sleep-drowsy-active',
      );
      expect(removed).toBeDefined();
      const unconscious = events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'unconscious',
      );
      expect(unconscious).toBeDefined();
      expect(unconscious?.endsOnDamage).toBe(true);
      expect(unconscious?.sourceEffectInstanceId).toBe(effectId);
      return;
    }
    throw new Error('no seed where the recurring save failed');
  });

  it('tick: a successful save removes drowsy without escalating to Unconscious', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const caster = buildWizard();
      const base = buildTarget('human', 20); // WIS 20 -> max save odds
      const target: Character = {
        ...base,
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'sleep-drowsy-active',
          sourceCharacterId: caster.id,
        }],
      };
      const campaign = seed2Characters(engine, `tick-pass-${seed}`, caster, target);
      const { events } = engine.plan.tickRecurringSave(campaign.state, {
        targetId: target.id, conditionId: 'sleep-drowsy-active',
      });
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (save?.success !== true) continue;
      expect(events.some((e) => e.type === 'ConditionRemoved')).toBe(true);
      expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'unconscious')).toBe(false);
      return;
    }
    throw new Error('no seed where the recurring save succeeded');
  });

  it('auto-succeed: an Elf (Trance) is skipped — no save rolled, no sleep-drowsy-active applied', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const caster = buildWizard();
    const elf = buildTarget('elf', 6);
    const campaign = seed2Characters(engine, 'elf-auto', caster, elf);
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: caster.id, spellId: 'sleep', slotLevel: 1, targetIds: [elf.id],
    });
    expect(events.some((e) => e.type === 'SaveRolled' && (e as SaveRolledEvent).targetId === elf.id)).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'sleep-drowsy-active')).toBe(false);
  });

  it('auto-succeed: an Exhaustion-immune creature (Skeleton) is skipped — no save, no condition', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const caster = buildWizard();
    const skeleton = buildSkeleton();
    const campaign = seed2Characters(engine, 'skeleton-auto', caster, skeleton);
    const { events } = engine.plan.castSpell(campaign.state, {
      characterId: caster.id, spellId: 'sleep', slotLevel: 1, targetIds: [skeleton.id],
    });
    expect(events.some((e) => e.type === 'SaveRolled' && (e as SaveRolledEvent).targetId === skeleton.id)).toBe(false);
    expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'sleep-drowsy-active')).toBe(false);
  });
});
