// Slice 796: Guiding Bolt's defining rider — "the next attack roll made
// against the target before the end of your next turn has Advantage"
// (SRD 5.2.1). The spell was a flat 4d6 radiant; the advantage grant was
// missing entirely (Area 2 divergence `guiding-bolt-no-advantage-grant`).
//
// Fix: a new `guiding-bolt-glow` condition carrying GrantAdvantageTo
// Attackers + autoExpiry { afterRounds 1, turnEnd } (the same window
// shape Color Spray's blind uses), applied via the attack mechanic's
// `conditionOnHit`. A one-spot engine fix makes the attack-mechanic
// on-hit path stamp the rider's autoExpiry (it previously only stamped
// it on the save / buff paths), so a non-concentration on-hit rider
// actually lifts at the end of the caster's next turn.
//
// RAW grants Advantage only to the NEXT attack; the engine grants it to
// attackers throughout the 1-round window (no "consume on first attack"
// machinery exists) — a minor over-grant noted on the condition.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId, newAppliedConditionId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';

const PACK = loadStarterPack();

const buildCleric = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Cleric', speciesId: 'human', backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
    hp: { current: 33, max: 33, temp: 0 },
    knownSpells: ['guiding-bolt'], preparedSpells: ['guiding-bolt'],
  });

// Very low AC so the bolt hits on nearly every seed.
const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 1, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 }, armorClass: 5,
  });

const buildAttacker = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Ally', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Guiding Bolt — advantage grant (slice 796)', () => {
  it('pack: Guiding Bolt is a ranged attack (4d6 radiant) with conditionOnHit guiding-bolt-glow', () => {
    const gb = PACK.spells.find((s) => s.id === 'guiding-bolt');
    expect(gb?.mechanicalEffects).toEqual([
      { kind: 'attack', attackKind: 'ranged', damageDice: '4d6', damageType: 'radiant', extraDicePerSlotLevel: 1, conditionOnHit: 'guiding-bolt-glow' },
    ]);
  });

  it('pack: guiding-bolt-glow grants advantage to attackers + lifts at end of caster\'s next turn', () => {
    const c = PACK.conditions.find((cc) => cc.id === 'guiding-bolt-glow');
    expect(c?.effects).toEqual([{ kind: 'GrantAdvantageToAttackers' }]);
    expect(c?.autoExpiry).toEqual({ afterRounds: 1, trigger: 'turnEnd' });
  });

  it('cast in an encounter: a hit applies guiding-bolt-glow to the target with a 1-round turnEnd expiry', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const cleric = buildCleric();
      const target = buildTarget();
      let campaign: Campaign = engine.createCampaign({ name: `gb-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [cleric.id, target.id] });
      campaign = commit(campaign, enc.events);
      campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
      campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
      campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);

      const round = campaign.state.encounters[enc.encounterId]!.round;
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: cleric.id, spellId: 'guiding-bolt', slotLevel: 1, targetIds: [target.id], ignorePreparation: true,
      });
      const attack = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (attack === undefined || attack.hit === false) continue;
      const glow = events.find(
        (e): e is ConditionAppliedEvent => e.type === 'ConditionApplied' && e.conditionId === 'guiding-bolt-glow',
      );
      expect(glow, 'glow not applied on hit').toBeDefined();
      expect(glow!.targetId).toBe(target.id);
      expect(glow!.sourceCharacterId).toBe(cleric.id);
      // The engine fix: the on-hit rider now carries the autoExpiry stamp.
      expect(glow!.expiryTrigger).toBe('turnEnd');
      expect(glow!.expiresOnRound).toBe(round + 1);
      return;
    }
    throw new Error('no seed where Guiding Bolt hit');
  });

  it('a target carrying guiding-bolt-glow grants Advantage to the next attacker', () => {
    const cleric = buildCleric();
    const target = buildTarget();
    const ally = buildAttacker();
    const sword = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    let campaign: Campaign = engine.createCampaign({ name: 'gb-adv' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cleric } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      // Give the ally the sword + apply the glow to the target directly.
      { id: eventId(), at: isoTimestamp(), type: 'ItemEquipped', characterId: ally.id, instanceId: sword.id, slot: 'mainHand' },
      {
        id: eventId(), at: isoTimestamp(), type: 'ConditionApplied', targetId: target.id,
        conditionId: 'guiding-bolt-glow', appliedConditionId: newAppliedConditionId(), sourceCharacterId: cleric.id,
      } satisfies ConditionAppliedEvent,
    ]);
    const { events } = engine.plan.attack(campaign.state, {
      attackerId: ally.id, targetId: target.id, weaponInstanceId: sword.id,
    });
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    expect(rolled).toBeDefined();
    expect(rolled!.d20).toHaveLength(2);
    expect(rolled!.used).toBe('advantage');
  });
});
