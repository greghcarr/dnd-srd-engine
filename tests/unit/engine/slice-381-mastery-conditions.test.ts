// Slice 381 - Sap / Vex / Slow weapon masteries were mechanically inert.
//
// The weapon-mastery planner emitted ConditionApplied for `sapped`,
// `vexed-by`, and `slowed-10ft`, but none of those conditions were
// DEFINED in the pack, so collectConditionEffects found nothing and the
// masteries did nothing (the marker was stored, the effect never applied).
// This slice defines the three conditions with real effects:
//   - sapped:       SetAdvantage(attack, disadvantage) on the struck creature
//   - slowed-10ft:  ModifySpeed(walk, -10) on the struck creature
//   - vexing-active: SetAdvantageVsSource(attack, advantage) on the ATTACKER,
//                    keyed (sourceCharacterId) to the struck target
// These tests pin the observable mechanical effect, not just the marker.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { getEffectiveSpeed } from '../../../src/engine/plan/_actor-state.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildFighter = (name: string, weaponDefId: string): { char: Character; weaponId: string } => {
  const char = CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
  });
  return { char, weaponId: makeItemInstance(weaponDefId).id };
};

// Picks a weapon whose pack mastery matches, so planWeaponMastery's
// weapon-mastery assertion passes.
const weaponForMastery = (mastery: string): string => {
  for (const item of PACK.items) {
    if (item.itemKind === 'weapon' && item.mastery === mastery) return item.id;
  }
  throw new Error(`no pack weapon has ${mastery} mastery`);
};

const seed = (chars: Character[], weaponDefId: string) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const weapon = makeItemInstance(weaponDefId);
  let campaign: Campaign = engine.createCampaign({ name: 'mastery' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
    ...chars.map((c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated' as const, snapshot: c } satisfies CharacterCreatedEvent)),
  ]);
  return { engine, campaign, weaponId: weapon.id };
};

describe('slice 381: Slow mastery actually reduces speed', () => {
  it('a creature struck by Slow has its walking speed reduced by 10', () => {
    const attackerWeapon = weaponForMastery('Slow');
    const { char: attacker } = buildFighter('Archer', attackerWeapon);
    const { char: target } = buildFighter('Runner', 'longsword');
    const { engine, campaign, weaponId } = seed([attacker, target], attackerWeapon);
    const before = getEffectiveSpeed({ character: campaign.state.characters[target.id]!, content: CONTENT, itemInstances: {} });
    const after = commit(campaign, engine.plan.weaponMastery(campaign.state, {
      mastery: 'Slow', attackerId: attacker.id, targetId: target.id, weaponInstanceId: weaponId,
    }).events);
    const slowed = getEffectiveSpeed({ character: after.state.characters[target.id]!, content: CONTENT, itemInstances: {} });
    expect(slowed).toBe(before - 10);
  });
});

describe('slice 381: Sap mastery imposes disadvantage on the target\'s attack', () => {
  it('a Sapped creature rolls its attack with disadvantage (two d20s, lower kept)', () => {
    const attackerWeapon = weaponForMastery('Sap');
    const { char: attacker } = buildFighter('Cassius', attackerWeapon);
    const { char: sapTarget } = buildFighter('Goblin', 'longsword');
    const { char: bystander } = buildFighter('Bystander', 'longsword');
    const { engine, campaign, weaponId } = seed([attacker, sapTarget, bystander], attackerWeapon);
    // Sap the goblin, then have the goblin attack the bystander.
    let next = commit(campaign, engine.plan.weaponMastery(campaign.state, {
      mastery: 'Sap', attackerId: attacker.id, targetId: sapTarget.id, weaponInstanceId: weaponId,
    }).events);
    expect(next.state.characters[sapTarget.id]!.appliedConditions.some((c) => c.conditionId === 'sapped')).toBe(true);
    const gobWeapon = makeItemInstance('longsword');
    next = commit(next, [{ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: gobWeapon }]);
    const events = engine.plan.attack(next.state, {
      attackerId: sapTarget.id, targetId: bystander.id, weaponInstanceId: gobWeapon.id,
    }).events as ReadonlyArray<Event>;
    const ar = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    expect(ar?.used).toBe('disadvantage');
    expect(ar?.d20.length).toBe(2);
  });
});

describe('slice 381: Vex mastery grants the attacker advantage vs the struck target', () => {
  it('after Vexing a target, the attacker\'s next attack against it has advantage', () => {
    const attackerWeapon = weaponForMastery('Vex');
    const { char: attacker } = buildFighter('Vexer', attackerWeapon);
    const { char: target } = buildFighter('Foe', 'longsword');
    const { char: other } = buildFighter('Other', 'longsword');
    const { engine, campaign, weaponId } = seed([attacker, target, other], attackerWeapon);
    const vexed = commit(campaign, engine.plan.weaponMastery(campaign.state, {
      mastery: 'Vex', attackerId: attacker.id, targetId: target.id, weaponInstanceId: weaponId,
    }).events);
    // The attacker carries vexing-active keyed to the target.
    const cond = vexed.state.characters[attacker.id]!.appliedConditions.find((c) => c.conditionId === 'vexing-active');
    expect(cond?.sourceCharacterId).toBe(target.id);
    // Attacking the vexed target -> advantage; attacking someone else -> none.
    const vsTarget = engine.plan.attack(vexed.state, {
      attackerId: attacker.id, targetId: target.id, weaponInstanceId: weaponId,
    }).events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    expect(vsTarget?.used).toBe('advantage');
    const vsOther = engine.plan.attack(vexed.state, {
      attackerId: attacker.id, targetId: other.id, weaponInstanceId: weaponId,
    }).events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    expect(vsOther?.used).toBe('none');
  });
});
