// Slice 830: Djinni Create Whirlwind — the persistent-hazard whirlwind, the
// last arm of the L7 `monster-whirlwind-actions` quirk. RAW (Djinni, CR 11):
// a creature caught in the conjured whirlwind makes a STR DC 17 save; on a
// failure it has Restrained + moves with the whirlwind, takes 6d6 Thunder at
// the start of each turn, and repeats the save at the end of each turn,
// ending the effect on a success. Modeled as a `create-whirlwind` save-action
// (the catch) applying the `djinni-whirlwind-caught` condition (Restrained +
// recurringDamage + recurringSave). The conjure / move / Concentration /
// membership stays positional → consumer-owned.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type {
  ConditionAppliedEvent,
  ConditionRemovedEvent,
  DamageAppliedEvent,
} from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const mkTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 },
    armorClass: 10,
  });

const mkDjinni = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Djinni',
    statblockId: 'djinni',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === 'djinni')!.abilityScores,
    hp: { current: 160, max: 160, temp: 0 },
  });

const stage = (djinni: Character, t: Character, seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'whirlwind' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: djinni } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

// Seed-loop the catch save until it lands on the wanted side.
const runCatch = (
  t: Character,
  want: 'fail' | 'success',
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; djinniId: string; events: ReadonlyArray<Event> } => {
  const djinni = mkDjinni();
  for (let seed = 1; seed < 400; seed += 1) {
    const { engine, campaign } = stage(djinni, t, seed);
    const events = engine.plan.saveAction(campaign.state, {
      monsterId: djinni.id,
      saveActionId: 'create-whirlwind',
      targetId: t.id,
    }).events as ReadonlyArray<Event>;
    const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    if (save === undefined) continue;
    if ((want === 'success') === save.success) return { engine, campaign, djinniId: djinni.id, events };
  }
  throw new Error(`no ${want} catch seed`);
};

describe('Djinni Create Whirlwind (slice 830)', () => {
  it('the djinni-whirlwind-caught condition carries Restrained + recurring thunder + STR-save-to-end', () => {
    const c = PACK.conditions.find((x) => x.id === 'djinni-whirlwind-caught')!;
    expect(c).toBeDefined();
    // Restrained's effects ride along (speed 0 + attack/Dex-save disadvantage + advantage to attackers).
    const kinds = c.effects.map((e: { kind: string }) => e.kind).sort();
    expect(kinds).toEqual(['GrantAdvantageToAttackers', 'ModifySpeed', 'SetAdvantage', 'SetAdvantage']);
    expect(c.recurringDamage).toEqual({ dice: '6d6', damageType: 'thunder', trigger: 'turnStart' });
    expect(c.recurringSave).toMatchObject({ ability: 'STR', fixedDC: 17, trigger: 'turnEnd', onSuccess: 'removeCondition' });
  });

  it('the djinni create-whirlwind save-action is STR DC 17, applies the caught condition, deals no immediate damage', () => {
    const spec = PACK.monsters.find((m) => m.id === 'djinni')!.saveActions.find((s) => s.id === 'create-whirlwind')!;
    expect(spec.saveAbility).toBe('STR');
    expect(spec.saveDC).toBe(17);
    expect(spec.onFail.applyConditionIds).toEqual(['djinni-whirlwind-caught']);
    expect(spec.onFail.damage).toEqual([]);
    expect(spec.maxTargetSize).toBeUndefined();
  });

  it('catch on a failed save: applies djinni-whirlwind-caught (sourced to the djinni), no immediate damage', () => {
    const { events, djinniId } = runCatch(mkTarget('PC'), 'fail');
    const applied = events.find(
      (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'djinni-whirlwind-caught',
    )!;
    expect(applied).toBeDefined();
    expect(applied.sourceCharacterId).toBe(djinniId);
    expect(events.some((e) => e.type === 'DamageApplied')).toBe(false);
  });

  it('catch on a successful save: nothing happens (only the SaveRolled)', () => {
    const { events } = runCatch(mkTarget('PC'), 'success');
    expect(events.map((e) => e.type)).toEqual(['SaveRolled']);
  });

  it('a caught creature takes 6d6 Thunder at turn-start via tickRecurringDamage (sourced to the djinni)', () => {
    const t = mkTarget('PC');
    const { engine, campaign, djinniId, events } = runCatch(t, 'fail');
    const after = commit(campaign, events);
    const tick = engine.plan.tickRecurringDamage(after.state, {
      targetId: t.id,
      conditionId: 'djinni-whirlwind-caught',
    });
    const dmg = tick.events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied')!;
    expect(dmg).toBeDefined();
    expect(dmg.components.every((c) => c.type === 'thunder')).toBe(true);
    expect(dmg.sourceCharacterId).toBe(djinniId);
    // 6d6 thunder: 6..36 before mitigation; the unarmoured wizard has no thunder resistance.
    expect(dmg.components.reduce((s, c) => s + c.amount, 0)).toBeGreaterThanOrEqual(6);
  });

  it('the end-of-turn STR save ends the effect on a success (tickRecurringSave removes the condition)', () => {
    for (let seed = 1; seed < 400; seed += 1) {
      const t = mkTarget('PC');
      const djinni = mkDjinni();
      const { engine, campaign } = stage(djinni, t, seed);
      const fire = engine.plan.saveAction(campaign.state, {
        monsterId: djinni.id,
        saveActionId: 'create-whirlwind',
        targetId: t.id,
      }).events;
      const caught = fire.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (caught === undefined || caught.success) continue; // need the catch to land
      let next: Campaign = commit(campaign, fire);
      const tick = engine.plan.tickRecurringSave(next.state, {
        targetId: t.id,
        conditionId: 'djinni-whirlwind-caught',
      });
      const tickSave = tick.events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (tickSave === undefined || !tickSave.success) continue; // need the end-of-turn save to pass
      expect(tickSave.dc).toBe(17);
      expect(tickSave.ability).toBe('STR');
      const removed = tick.events.find(
        (e): e is ConditionRemovedEvent => e.type === 'ConditionRemoved' && e.conditionId === 'djinni-whirlwind-caught',
      );
      expect(removed).toBeDefined();
      next = commit(next, tick.events);
      expect(next.state.characters[t.id]!.appliedConditions.some((a) => a.conditionId === 'djinni-whirlwind-caught')).toBe(false);
      return;
    }
    throw new Error('no seed produced a caught-then-saved flow');
  });
});
