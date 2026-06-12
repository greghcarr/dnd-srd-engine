// Slice 834: Wight Life Drain — the save-action max-HP drain. RAW (SRD 5.2.1
// Wight, CR 3): "Life Drain. Constitution Saving Throw: DC 13, one creature
// within 5 feet. Failure: 6 (1d8 + 2) Necrotic damage, and the target's Hit
// Point maximum decreases by an amount equal to the damage taken." Wires the
// slice-828 save-action with a new `onFail.drainMaxHp` arm reusing the
// slice-832 `life-drained` mechanism. Advances the L7 `drain-undead-extra-arms`
// row (the Humanoid-slain → Zombie spawn stays consumer/DM-managed).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const target = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Victim', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 10,
  });

const mkWight = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Wight', kind: 'creature', statblockId: 'wight',
    speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === 'wight')!.abilityScores,
    hp: { current: 100, max: 100, temp: 0 },
  });

// Seed-loop until the CON save lands on the wanted side. `preDrain` pre-applies
// a life-drained reduction to exercise cumulative accumulation.
const runLifeDrain = (
  t: Character, want: 'fail' | 'success', preDrain = 0,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; events: ReadonlyArray<Event>; targetId: string } => {
  const wight = mkWight();
  for (let seed = 1; seed < 300; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    let campaign: Campaign = engine.createCampaign({ name: 'wight' });
    const setup: Event[] = [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wight } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
    ];
    if (preDrain > 0) {
      setup.push({
        id: eventId(), at: isoTimestamp(), type: 'ConditionApplied',
        targetId: t.id, conditionId: 'life-drained', appliedConditionId: eventId(), hpMaxBonusDelta: -preDrain,
      } satisfies ConditionAppliedEvent);
    }
    campaign = commit(campaign, setup);
    const events = engine.plan.saveAction(campaign.state, {
      monsterId: wight.id, saveActionId: 'life-drain', targetId: t.id,
    }).events as ReadonlyArray<Event>;
    const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    if (save === undefined) continue;
    if ((want === 'success') === save.success) return { engine, campaign, events, targetId: t.id };
  }
  throw new Error(`no ${want} seed for Wight Life Drain`);
};

const lifeDrained = (events: ReadonlyArray<Event>): ConditionAppliedEvent | undefined =>
  events.find((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'life-drained');
const necroticTaken = (events: ReadonlyArray<Event>): number => {
  const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
  return (dmg?.components ?? []).filter((c) => c.type === 'necrotic').reduce((s, c) => s + c.amount, 0);
};

describe('Wight Life Drain — save-action max-HP drain (slice 834)', () => {
  it('the Wight carries the Life Drain save-action (CON DC 13, necrotic, drainMaxHp)', () => {
    const spec = PACK.monsters.find((m) => m.id === 'wight')!.saveActions.find((s) => s.id === 'life-drain')!;
    expect(spec).toBeDefined();
    expect(spec.saveAbility).toBe('CON');
    expect(spec.saveDC).toBe(13);
    expect(spec.onFail.damage).toEqual([{ dice: '1d8+2', type: 'necrotic' }]);
    expect(spec.onFail.drainMaxHp).toBe(true);
  });

  it('on a failed save: necrotic damage + max-HP drain equal to the damage taken', () => {
    const { campaign, events, targetId } = runLifeDrain(target(), 'fail');
    expect(necroticTaken(events)).toBeGreaterThan(0);
    const applied = lifeDrained(events)!;
    expect(applied).toBeDefined();
    expect(applied.hpMaxBonusDelta).toBe(-necroticTaken(events));
    expect(events.some((e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'life-drained')).toBe(false);
    const after = commit(campaign, events);
    expect(after.state.characters[targetId]!.hp.maxBonus).toBe(-necroticTaken(events));
  });

  it('on a successful save: nothing (no damage, no drain)', () => {
    const { events } = runLifeDrain(target(), 'success');
    expect(events.map((e) => e.type)).toEqual(['SaveRolled']);
  });

  it('accumulates with a prior drain into one cumulative life-drained entry', () => {
    const { campaign, events, targetId } = runLifeDrain(target(), 'fail', 5);
    expect(events.some((e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'life-drained')).toBe(true);
    expect(lifeDrained(events)!.hpMaxBonusDelta).toBe(-(5 + necroticTaken(events)));
    const after = commit(campaign, events);
    expect(after.state.characters[targetId]!.hp.maxBonus).toBe(-(5 + necroticTaken(events)));
    expect(after.state.characters[targetId]!.appliedConditions.filter((c) => c.conditionId === 'life-drained')).toHaveLength(1);
  });

  it('a Long Rest restores the drained max HP', () => {
    const { engine, campaign, events, targetId } = runLifeDrain(target(), 'fail');
    let after = commit(campaign, events);
    expect(after.state.characters[targetId]!.hp.maxBonus).toBeLessThan(0);
    after = commit(after, engine.plan.longRest(after.state, { participantIds: [targetId] }).events);
    expect(after.state.characters[targetId]!.hp.maxBonus).toBe(0);
    expect(after.state.characters[targetId]!.appliedConditions.some((c) => c.conditionId === 'life-drained')).toBe(false);
  });
});
