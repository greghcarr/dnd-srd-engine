import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEventId } from '../../../src/ids.js';
import type { Campaign } from '../../../src/engine/commit.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent, HealedEvent, ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AbsorbElementsCastEvent } from '../../../src/schemas/events/reactive-spells.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { TriggerFiredEvent } from '../../../src/schemas/events/triggers.js';
import type { ULID } from '../../../src/engine/ids-utils.js';
import type { DamageType } from '../../../src/schemas/primitives.js';
import { eventId, isoTimestamp, makeItemInstance, loadPhbExtrasTestPack } from '../../fixtures/index.js';

// Tests Absorb Elements as a dedicated reaction planner. The triggering
// DamageApplied event has already committed; planAbsorbElements emits a
// compensating Healed event for the absorbed half, plus a
// per-damage-type absorb-elements-charged-<type>-active condition that
// rides the caster's next melee hit (consumeOnTrigger).

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Absorber',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 14, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: [],
    preparedSpells: ['absorb-elements'],
  });

const buildAttacker = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Burning Mage',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 12, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: [],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 12, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    hp: { current: 60, max: 60, temp: 0 },
    featsTaken: [],
  });

const buildCampaign = () => {
  const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(0) });
  const wizard = buildWizard();
  let campaign: Campaign = engine.createCampaign({ name: 'absorb-elements' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, wizard };
};

// Helper: commit a DamageApplied of the given type+amount to the wizard
// (mimicking a fire bolt landing), then return the triggering event id
// for the planner to reference.
const applyIncomingDamage = (
  engine: ReturnType<typeof createEngine>,
  campaign: Campaign,
  targetId: string,
  damageType: DamageType,
  amount: number,
): { campaign: Campaign; triggeringId: string } => {
  const triggeringId = newEventId();
  const dmg: DamageAppliedEvent = {
    id: triggeringId as ULID,
    at: isoTimestamp(),
    type: 'DamageApplied',
    targetId: targetId as ULID,
    components: [{ amount, type: damageType }],
    source: 'incoming-damage',
  };
  const next = commit(campaign, [dmg]);
  return { campaign: next, triggeringId };
};

describe('engine.plan.absorbElements', () => {
  it.each<DamageType>(['acid', 'cold', 'fire', 'lightning', 'thunder'])(
    "absorbs %s damage: halves the original, applies the matching charged condition",
    (damageType) => {
      const { engine, campaign: c0, wizard } = buildCampaign();
      const { campaign: c1, triggeringId } = applyIncomingDamage(engine, c0, wizard.id, damageType, 20);

      const hpBefore = c1.state.characters[wizard.id]!.hp.current;
      const outcome = engine.plan.absorbElements(c1.state, {
        casterId: wizard.id,
        triggeringDamageEventId: triggeringId,
        damageType,
        damageAmount: 20,
      });

      expect(outcome.halvedAmount).toBe(10);

      const healed = outcome.events.find((e) => e.type === 'Healed') as HealedEvent | undefined;
      expect(healed).toBeDefined();
      expect(healed!.amount).toBe(10);

      const cond = outcome.events.find((e) => e.type === 'ConditionApplied') as ConditionAppliedEvent | undefined;
      expect(cond).toBeDefined();
      expect(cond!.conditionId).toBe(`absorb-elements-charged-${damageType}-active`);

      const cast = outcome.events.find((e) => e.type === 'AbsorbElementsCast') as AbsorbElementsCastEvent | undefined;
      expect(cast).toBeDefined();
      expect(cast!.damageType).toBe(damageType);
      expect(cast!.halvedAmount).toBe(10);

      const c2 = commit(c1, outcome.events);
      const hpAfter = c2.state.characters[wizard.id]!.hp.current;
      expect(hpAfter - hpBefore).toBe(10);
    },
  );

  it('the on-next-hit rider adds +1d6 of the absorbed type and then the condition consumes', () => {
    for (let seed = 1; seed < 100; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const wizard = buildWizard();
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `absorb-followup-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);

      const { campaign: c1, triggeringId } = applyIncomingDamage(engine, campaign, wizard.id, 'fire', 12);
      const absorbOutcome = engine.plan.absorbElements(c1.state, {
        casterId: wizard.id,
        triggeringDamageEventId: triggeringId,
        damageType: 'fire',
        damageAmount: 12,
      });
      const c2 = commit(c1, absorbOutcome.events);

      // The wizard now has the absorb-elements-charged-fire-active
      // condition. Their next melee hit should fire the rider.
      const charged = c2.state.characters[wizard.id]!.appliedConditions.find(
        (c) => c.conditionId === 'absorb-elements-charged-fire-active',
      );
      expect(charged).toBeDefined();

      const attack = engine.plan.attack(c2.state, {
        attackerId: wizard.id,
        targetId: target.id,
        weaponInstanceId: longsword.id,
      }).events;
      const attackRolled = attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (attackRolled?.hit !== true) continue;

      const fireDamage = attack.find(
        (e) =>
          e.type === 'DamageApplied'
          && (e as DamageAppliedEvent).components.some((c) => c.type === 'fire'),
      ) as DamageAppliedEvent | undefined;
      expect(fireDamage, 'expected +1d6 fire on the absorb-charged hit').toBeDefined();
      const fireTotal = fireDamage!.components
        .filter((c) => c.type === 'fire')
        .reduce((sum, c) => sum + c.amount, 0);
      expect(fireTotal).toBeGreaterThanOrEqual(1);
      expect(fireTotal).toBeLessThanOrEqual(attackRolled.critical ? 12 : 6);

      // consumeOnTrigger means a TriggerFired + the parent condition
      // should be lifted via ConditionRemoved.
      const triggered = attack.find(
        (e) => e.type === 'TriggerFired' && (e as TriggerFiredEvent).triggerId.endsWith('absorb-elements-fire-rider'),
      );
      expect(triggered).toBeDefined();

      const c3 = commit(c2, attack);
      const stillCharged = c3.state.characters[wizard.id]!.appliedConditions.find(
        (c) => c.conditionId === 'absorb-elements-charged-fire-active',
      );
      expect(stillCharged, 'expected absorb-charged-fire to be consumed after first hit').toBeUndefined();
      return;
    }
    throw new Error('no seed produced a hit on the absorb-charged follow-up attack');
  });

  it('upcast scales the next-hit rider: a 3rd-level slot bakes a 3d6 rider (slice 390)', () => {
    // The charged condition carries the per-instance dice override, and a
    // non-crit hit can exceed 6 (impossible with the base 1d6).
    let maxNonCritFire = 0;
    for (let seed = 1; seed < 120; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(seed) });
      const longsword = makeItemInstance('longsword');
      const wizard = buildWizard();
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `absorb-upcast-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const { campaign: c1, triggeringId } = applyIncomingDamage(engine, campaign, wizard.id, 'fire', 12);
      const c2 = commit(c1, engine.plan.absorbElements(c1.state, {
        casterId: wizard.id, triggeringDamageEventId: triggeringId, damageType: 'fire', damageAmount: 12, slotLevel: 3,
      }).events);
      const charged = c2.state.characters[wizard.id]!.appliedConditions.find((c) => c.conditionId === 'absorb-elements-charged-fire-active')!;
      expect(charged.riderDamageDice).toBe('3d6');
      const attack = engine.plan.attack(c2.state, { attackerId: wizard.id, targetId: target.id, weaponInstanceId: longsword.id }).events;
      const ar = attack.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (ar?.hit !== true || ar.critical === true) continue;
      const fire = (attack.find((e) => e.type === 'DamageApplied' && (e as DamageAppliedEvent).components.some((c) => c.type === 'fire')) as DamageAppliedEvent | undefined);
      const fireTotal = fire?.components.filter((c) => c.type === 'fire').reduce((s, c) => s + c.amount, 0) ?? 0;
      expect(fireTotal).toBeLessThanOrEqual(18); // 3d6
      maxNonCritFire = Math.max(maxNonCritFire, fireTotal);
    }
    expect(maxNonCritFire).toBeGreaterThan(6); // exceeds a single 1d6, proving the scaling
  });

  it('throws when the damage type is outside the allowed elements', () => {
    const { engine, campaign: c0, wizard } = buildCampaign();
    const { campaign: c1, triggeringId } = applyIncomingDamage(
      engine,
      c0,
      wizard.id,
      'fire',
      10,
    );
    expect(() =>
      engine.plan.absorbElements(c1.state, {
        casterId: wizard.id,
        triggeringDamageEventId: triggeringId,
        damageType: 'necrotic' as DamageType,
        damageAmount: 10,
      }),
    ).toThrow(/not in allowed list/);
  });

  it('floors odd damage when halving (15 → 7)', () => {
    const { engine, campaign: c0, wizard } = buildCampaign();
    const { campaign: c1, triggeringId } = applyIncomingDamage(engine, c0, wizard.id, 'cold', 15);
    const outcome = engine.plan.absorbElements(c1.state, {
      casterId: wizard.id,
      triggeringDamageEventId: triggeringId,
      damageType: 'cold',
      damageAmount: 15,
    });
    expect(outcome.halvedAmount).toBe(7);
  });

  it('with 0 incoming damage emits no Healed event but still applies the charged condition', () => {
    const { engine, campaign: c0, wizard } = buildCampaign();
    const { campaign: c1, triggeringId } = applyIncomingDamage(engine, c0, wizard.id, 'lightning', 0);
    const outcome = engine.plan.absorbElements(c1.state, {
      casterId: wizard.id,
      triggeringDamageEventId: triggeringId,
      damageType: 'lightning',
      damageAmount: 0,
    });
    expect(outcome.halvedAmount).toBe(0);
    expect(outcome.events.some((e) => e.type === 'Healed')).toBe(false);
    expect(
      outcome.events.some(
        (e) => e.type === 'ConditionApplied' && e.conditionId === 'absorb-elements-charged-lightning-active',
      ),
    ).toBe(true);
  });

  it('throws when the reactor has already used their reaction this round (in encounter)', () => {
    const engine = createEngine({ contentPacks: [PACK, loadPhbExtrasTestPack()], rng: seededRNG(0) });
    const wizard = buildWizard();
    const attacker = buildAttacker();
    let campaign: Campaign = engine.createCampaign({ name: 'absorb-reaction-gate' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    ]);
    const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [wizard.id, attacker.id] });
    campaign = commit(campaign, enc.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);

    const { campaign: c1, triggeringId: t1 } = applyIncomingDamage(engine, campaign, wizard.id, 'fire', 10);
    campaign = commit(
      c1,
      engine.plan.absorbElements(c1.state, {
        casterId: wizard.id,
        triggeringDamageEventId: t1,
        damageType: 'fire',
        damageAmount: 10,
      }).events,
    );

    const { campaign: c2, triggeringId: t2 } = applyIncomingDamage(engine, campaign, wizard.id, 'cold', 8);
    expect(() =>
      engine.plan.absorbElements(c2.state, {
        casterId: wizard.id,
        triggeringDamageEventId: t2,
        damageType: 'cold',
        damageAmount: 8,
      }),
    ).toThrow(/reaction already used/);
  });
});
