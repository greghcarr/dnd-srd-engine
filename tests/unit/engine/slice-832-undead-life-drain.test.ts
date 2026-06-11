// Slice 832: undead Life Drain (max-HP drain). RAW (SRD 5.2.1 Specter CR 1 /
// Wraith CR 5): a Life Drain hit deals Necrotic damage and "its Hit Point
// maximum decreases by an amount equal to the damage taken"; the reduction
// returns to normal on a Long Rest (the 2024 default). Modeled as a weapon
// `drainsMaxHp` flag that applies a cumulative `life-drained` condition
// (negative hpMaxBonusDelta), restored by planLongRest. Advances the L7
// `drain-undead-arms` divergence (the max-HP-drain arm).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent, ConditionRemovedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const target = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Victim', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 300, max: 300, temp: 0 }, armorClass: 3,
  });

const mkMonster = (statblockId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: statblockId, kind: 'creature', statblockId,
    speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === statblockId)!.abilityScores,
    hp: { current: 100, max: 100, temp: 0 },
  });

// Seed-loop until the Life Drain attack hits. `preDrain` pre-applies a
// life-drained reduction (to exercise cumulative accumulation).
const drainAttack = (
  statblockId: string, weaponId: string, t: Character, preDrain = 0,
): { engine: ReturnType<typeof createEngine>; campaign: Campaign; events: ReadonlyArray<Event>; targetId: string } => {
  for (let seed = 1; seed < 200; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const attacker = mkMonster(statblockId);
    const weapon = makeItemInstance(weaponId);
    let campaign: Campaign = engine.createCampaign({ name: 'drain' });
    const setup: Event[] = [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t } satisfies CharacterCreatedEvent,
    ];
    if (preDrain > 0) {
      setup.push({
        id: eventId(), at: isoTimestamp(), type: 'ConditionApplied',
        targetId: t.id, conditionId: 'life-drained', appliedConditionId: eventId(), hpMaxBonusDelta: -preDrain,
      } satisfies ConditionAppliedEvent);
    }
    campaign = commit(campaign, setup);
    const events = engine.plan.attack(campaign.state, {
      attackerId: attacker.id, targetId: t.id, weaponInstanceId: weapon.id, advantage: 'advantage',
    }).events as ReadonlyArray<Event>;
    if ((events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true) {
      return { engine, campaign, events, targetId: t.id };
    }
  }
  throw new Error(`no hitting seed for ${weaponId}`);
};

const lifeDrainApplied = (events: ReadonlyArray<Event>): ConditionAppliedEvent | undefined =>
  events.find((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'life-drained');
const necroticTaken = (events: ReadonlyArray<Event>): number => {
  const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
  return (dmg?.components ?? []).filter((c) => c.type === 'necrotic').reduce((s, c) => s + c.amount, 0);
};

describe('undead Life Drain — max-HP drain (slice 832)', () => {
  it('the Specter/Wraith Life Drain weapons drain max HP, and life-drained ends on a Long Rest', () => {
    for (const id of ['specter-life-drain', 'wraith-life-drain']) {
      const w = PACK.items.find((i) => i.id === id) as { drainsMaxHp?: boolean; damageType?: string };
      expect(w.drainsMaxHp, id).toBe(true);
      expect(w.damageType, id).toBe('necrotic');
    }
    const cond = PACK.conditions.find((c) => c.id === 'life-drained')!;
    expect(cond).toBeDefined();
    expect((cond.endsOn ?? []).some((e: { kind: string }) => e.kind === 'longRest')).toBe(true);
    expect(PACK.monsters.find((m) => m.id === 'specter')!.actions.map((a) => a.weaponId)).toContain('specter-life-drain');
    expect(PACK.monsters.find((m) => m.id === 'wraith')!.actions.map((a) => a.weaponId)).toContain('wraith-life-drain');
  });

  it('a Specter Life Drain hit reduces the target max HP by the necrotic damage taken (no prior drain → no removal)', () => {
    const { campaign, events, targetId } = drainAttack('specter', 'specter-life-drain', target());
    const applied = lifeDrainApplied(events)!;
    expect(applied).toBeDefined();
    expect(applied.hpMaxBonusDelta).toBe(-necroticTaken(events));
    expect(events.some((e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'life-drained')).toBe(false);
    const after = commit(campaign, events);
    expect(after.state.characters[targetId]!.hp.maxBonus).toBe(-necroticTaken(events));
  });

  it('a second Life Drain accumulates: one cumulative life-drained entry (remove-then-readd)', () => {
    const { campaign, events, targetId } = drainAttack('specter', 'specter-life-drain', target(), 5);
    // The prior -5 entry is removed and re-applied as -(5 + new necrotic).
    expect(events.some((e) => e.type === 'ConditionRemoved' && (e as ConditionRemovedEvent).conditionId === 'life-drained')).toBe(true);
    const applied = lifeDrainApplied(events)!;
    expect(applied.hpMaxBonusDelta).toBe(-(5 + necroticTaken(events)));
    const after = commit(campaign, events);
    expect(after.state.characters[targetId]!.hp.maxBonus).toBe(-(5 + necroticTaken(events)));
    expect(after.state.characters[targetId]!.appliedConditions.filter((c) => c.conditionId === 'life-drained')).toHaveLength(1);
  });

  it('a Long Rest restores the drained max HP and clears life-drained', () => {
    const { engine, campaign, events, targetId } = drainAttack('wraith', 'wraith-life-drain', target());
    let after = commit(campaign, events);
    expect(after.state.characters[targetId]!.hp.maxBonus).toBeLessThan(0);
    after = commit(after, engine.plan.longRest(after.state, { participantIds: [targetId] }).events);
    expect(after.state.characters[targetId]!.hp.maxBonus).toBe(0);
    expect(after.state.characters[targetId]!.appliedConditions.some((c) => c.conditionId === 'life-drained')).toBe(false);
  });
});
