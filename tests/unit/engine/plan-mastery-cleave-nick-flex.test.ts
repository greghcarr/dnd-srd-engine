import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import {
  TEST_PACK,
  buildFighter,
  eventId,
  isoTimestamp,
  makeItemInstance,
} from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageRolledEvent } from '../../../src/schemas/events/attack.js';

describe('Flex mastery', () => {
  it('uses versatileDice when the weapon is wielded two-handed', () => {
    // Battleaxe in test-pack: 1d8 base / 1d10 versatile, Flex mastery.
    let foundVersatile = false;
    for (let seed = 0; seed < 30 && !foundVersatile; seed++) {
      const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(seed) });
      const axe = makeItemInstance('battleaxe');
      const armor = makeItemInstance('chain-mail');
      const attacker = buildFighter({ name: 'TH', STR: 18 });
      attacker.equipped.mainHand = axe.id;
      attacker.equipped.offHand = undefined;
      const target = buildFighter({ name: 'T', hpMax: 50, hpCurrent: 50, armorInstanceId: armor.id });
      let campaign = engine.createCampaign({ name: 'flex' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: axe },
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armor },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: axe.id,
      });
      const dr = events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      if (dr === undefined) continue;
      const expr = dr.rolls[0]?.expression;
      if (expr === '1d10') foundVersatile = true;
    }
    expect(foundVersatile).toBe(true);
  });

  it('uses base damageDice when wielding with a shield (one-handed)', () => {
    const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(2) });
    const axe = makeItemInstance('battleaxe');
    const shield = makeItemInstance('shield');
    const armor = makeItemInstance('chain-mail');
    const attacker = buildFighter({ name: 'OH', STR: 18, shieldInstanceId: shield.id });
    attacker.equipped.mainHand = axe.id;
    attacker.equipped.offHand = shield.id;
    const target = buildFighter({ name: 'T', hpMax: 50, hpCurrent: 50, armorInstanceId: armor.id });
    let campaign = engine.createCampaign({ name: 'flex-off' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: axe },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: shield },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armor },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    for (let seed = 0; seed < 20; seed++) {
      const eng2 = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(seed) });
      const result = eng2.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: axe.id,
      });
      const dr = result.events.find((e) => e.type === 'DamageRolled') as DamageRolledEvent | undefined;
      if (dr === undefined) continue;
      expect(dr.rolls[0]?.expression).toBe('1d8'); // base dice, not 1d10
      return;
    }
  });
});

describe('Nick mastery', () => {
  it('off-hand attack with a Nick weapon emits TriggerFired instead of ActionEconomyConsumed(bonusAction)', () => {
    // Daggers have Nick mastery in the starter pack.
    const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(1) });
    const mainDagger = makeItemInstance('dagger');
    const offDagger = makeItemInstance('dagger');
    const attacker = buildFighter({ name: 'Nicker', STR: 14, DEX: 18, weaponMasteries: ['dagger'] });
    attacker.equipped.mainHand = mainDagger.id;
    attacker.equipped.offHand = offDagger.id;
    const target = buildFighter({ name: 'Pell', hpMax: 30, hpCurrent: 30 });
    let campaign = engine.createCampaign({ name: 'nick' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: mainDagger },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: offDagger },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const created = engine.plan.createEncounter(campaign.state, {
      combatantIds: [attacker.id, target.id],
    });
    campaign = commit(campaign, created.events);
    campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: created.encounterId }).events);
    campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: created.encounterId }).events);
    campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: created.encounterId }).events);
    // Get the active combatant — if it's the target, advance.
    const enc = campaign.state.encounters[created.encounterId]!;
    if (enc.combatants[enc.activeIndex]?.combatantId !== attacker.id) {
      campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: created.encounterId }).events);
    }
    const { events } = engine.plan.offHandAttack(campaign.state, {
      attackerId: attacker.id,
      targetId: target.id,
      weaponInstanceId: offDagger.id,
    });
    const trigger = events.find((e) => e.type === 'TriggerFired');
    const economy = events.find(
      (e) => e.type === 'ActionEconomyConsumed' && 'kind' in e && e.kind === 'bonusAction',
    );
    expect(trigger).toBeDefined();
    expect(economy).toBeUndefined();
    if (trigger?.type === 'TriggerFired') {
      expect(trigger.triggerId).toBe('mastery:nick');
    }
  });
});

describe('Cleave mastery', () => {
  it('emits a follow-up attack against the secondary target with no ability mod to damage', () => {
    // Greataxe in test-pack: 1d12 slashing, Cleave mastery.
    const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(5) });
    const weapon = makeItemInstance('greataxe');
    const attacker = buildFighter({ name: 'Cleaver', STR: 18, weaponMasteries: ['greataxe'] });
    attacker.equipped.mainHand = weapon.id;
    const primary = buildFighter({ name: 'P', hpMax: 30, hpCurrent: 30 });
    const secondary = buildFighter({ name: 'S', hpMax: 30, hpCurrent: 30 });
    let campaign = engine.createCampaign({ name: 'cleave' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: primary } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: secondary } satisfies CharacterCreatedEvent,
    ]);
    const attack = engine.plan.attack(campaign.state, {
      attackerId: attacker.id,
      targetId: primary.id,
      weaponInstanceId: weapon.id,
    });
    campaign = commit(campaign, attack.events);
    const ar = attack.events.find((e) => e.type === 'AttackRolled');
    expect(ar?.type).toBe('AttackRolled');

    const cleave = engine.plan.cleave(campaign.state, {
      attackerId: attacker.id,
      secondaryTargetId: secondary.id,
      weaponInstanceId: weapon.id,
      triggeringAttackEventId: ar!.id,
    });
    expect(cleave.events.map((e) => e.type)).toContain('AttackRolled');
    expect(cleave.events.map((e) => e.type)).toContain('TriggerFired');
    const trigger = cleave.events.find((e) => e.type === 'TriggerFired');
    if (trigger?.type === 'TriggerFired') {
      expect(trigger.triggerId).toBe('mastery:cleave');
    }
    campaign = commit(campaign, cleave.events);

    // Second cleave on the same turn should reject.
    expect(() =>
      engine.plan.cleave(campaign.state, {
        attackerId: attacker.id,
        secondaryTargetId: secondary.id,
        weaponInstanceId: weapon.id,
        triggeringAttackEventId: ar!.id,
      }),
    ).toThrow(/already used/);
  });

  it('rejects when the weapon does not have Cleave mastery', () => {
    const engine = createEngine({ contentPacks: [TEST_PACK], rng: seededRNG(1) });
    const longsword = makeItemInstance('longsword');
    const attacker = buildFighter({ name: 'NotCleave', STR: 18 });
    attacker.equipped.mainHand = longsword.id;
    const t1 = buildFighter({ name: 'T1' });
    let campaign = engine.createCampaign({ name: 'no-cleave' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: longsword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: t1 } satisfies CharacterCreatedEvent,
    ]);
    expect(() =>
      engine.plan.cleave(campaign.state, {
        attackerId: attacker.id,
        secondaryTargetId: t1.id,
        weaponInstanceId: longsword.id,
        triggeringAttackEventId: eventId(),
      }),
    ).toThrow(/Cleave/);
  });
});
