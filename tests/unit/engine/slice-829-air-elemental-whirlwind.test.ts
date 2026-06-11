// Slice 829: Air Elemental Whirlwind — the save-action mechanism extended
// with Recharge (4–6) + forced push, on top of the slice-828 Constrict
// shape. RAW (monsters-A-Z.md): "Whirlwind (Recharge 4–6). Strength Saving
// Throw: DC 13, one Medium or smaller creature in the elemental's space.
// Failure: 24 (4d10 + 2) Thunder damage, and the target is pushed up to 20
// feet straight away from the elemental and has the Prone condition.
// Success: Half damage only." Advances the L7 `monster-whirlwind-actions`.

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
  DamageAppliedEvent,
  CreaturePushedEvent,
} from '../../../src/schemas/events/combat.js';
import type { SaveActionRechargedEvent } from '../../../src/schemas/events/save-action.js';
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

const mkElemental = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Air Elemental',
    statblockId: 'air-elemental',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === 'air-elemental')!.abilityScores,
    hp: { current: 90, max: 90, temp: 0 },
  });

const stage = (monster: Character, t: Character, seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'whirlwind' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: monster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const runWhirlwind = (
  t: Character,
  want: 'fail' | 'success',
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; monster: Character; events: ReadonlyArray<Event> } => {
  const monster = mkElemental();
  for (let seed = 1; seed < 400; seed += 1) {
    const { engine, campaign } = stage(monster, t, seed);
    const events = engine.plan.saveAction(campaign.state, {
      monsterId: monster.id,
      saveActionId: 'whirlwind',
      targetId: t.id,
    }).events as ReadonlyArray<Event>;
    const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    if (save === undefined) continue;
    if ((want === 'success') === save.success) return { engine, campaign, monster, events };
  }
  throw new Error(`no ${want} seed for air-elemental whirlwind`);
};

const conditionsOf = (events: ReadonlyArray<Event>): ConditionAppliedEvent[] =>
  events.filter((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied');

describe('Air Elemental Whirlwind: save-action recharge + push (slice 829)', () => {
  it('the Whirlwind spec matches RAW (DC 13, <=Medium, recharge 4–6, half-on-success, push 20, Prone)', () => {
    const spec = PACK.monsters.find((m) => m.id === 'air-elemental')!.saveActions.find((s) => s.id === 'whirlwind')!;
    expect(spec.saveAbility).toBe('STR');
    expect(spec.saveDC).toBe(13);
    expect(spec.maxTargetSize).toBe('Medium');
    expect(spec.halfDamageOnSuccess).toBe(true);
    expect(spec.recharge).toEqual({ rechargeMin: 4 });
    expect(spec.onFail.applyConditionIds).toEqual(['prone']);
    expect(spec.onFail.pushFeet).toBe(20);
    expect(spec.onFail.damage).toEqual([{ dice: '4d10+2', type: 'thunder' }]);
  });

  it('on a failed save: Thunder damage + Prone + 20-ft push (sourced to the elemental) + expend marker', () => {
    const { events, monster } = runWhirlwind(mkTarget('PC'), 'fail');
    const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied')!;
    expect(dmg.components.some((c) => c.type === 'thunder')).toBe(true);
    expect(conditionsOf(events).map((c) => c.conditionId)).toContain('prone');
    const push = events.find((e): e is CreaturePushedEvent => e.type === 'CreaturePushed')!;
    expect(push.distanceFeet).toBe(20);
    expect(push.sourceCharacterId).toBe(monster.id);
    expect(events.some((e) => e.type === 'SaveActionExpended')).toBe(true);
  });

  it('on a successful save: half damage only — no Prone, no push', () => {
    const { events } = runWhirlwind(mkTarget('PC'), 'success');
    expect(events.some((e) => e.type === 'DamageApplied')).toBe(true);
    expect(events.some((e) => e.type === 'ConditionApplied')).toBe(false);
    expect(events.some((e) => e.type === 'CreaturePushed')).toBe(false);
  });

  it('expends on use: the id lands on expendedSaveActionIds and a re-fire throws', () => {
    const t = mkTarget('PC');
    const { engine, campaign, monster, events } = runWhirlwind(t, 'fail');
    const after = commit(campaign, events);
    expect(after.state.characters[monster.id]!.expendedSaveActionIds).toContain('whirlwind');
    expect(() =>
      engine.plan.saveAction(after.state, {
        monsterId: monster.id,
        saveActionId: 'whirlwind',
        targetId: t.id,
      }),
    ).toThrow(/expended/);
  });

  it('recharges at turn-start on a d6 >= 4: emits SaveActionRecharged, clears the expended id', () => {
    for (let seed = 1; seed < 120; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const elemental = mkElemental();
      const target = mkTarget('Victim');
      let campaign: Campaign = engine.createCampaign({ name: `recharge-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: elemental } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      // Fire the Whirlwind to expend it (the expend marker fires regardless of save outcome).
      const fire = engine.plan.saveAction(campaign.state, {
        monsterId: elemental.id,
        saveActionId: 'whirlwind',
        targetId: target.id,
      }).events;
      campaign = commit(campaign, fire);
      expect(campaign.state.characters[elemental.id]!.expendedSaveActionIds).toContain('whirlwind');

      const created = engine.plan.createEncounter(campaign.state, { combatantIds: [elemental.id, target.id] });
      campaign = commit(campaign, created.events);
      campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events);
      campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events);
      const first = engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId });
      const encounter = campaign.state.encounters[created.encounterId]!;
      if (encounter.combatants[0]!.combatantId !== elemental.id) continue;
      const recharge = first.events.find(
        (e): e is SaveActionRechargedEvent => e.type === 'SaveActionRecharged',
      );
      if (recharge === undefined) continue; // d6 < 4 this seed
      expect(recharge.roll).toBeGreaterThanOrEqual(4);
      expect(recharge.saveActionId).toBe('whirlwind');
      const after = commit(campaign, first.events);
      expect(after.state.characters[elemental.id]!.expendedSaveActionIds).not.toContain('whirlwind');
      return;
    }
    throw new Error('no seed produced an elemental-first-turn with a successful recharge');
  });
});
