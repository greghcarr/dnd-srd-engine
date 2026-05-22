// Slice 120 — Protection Fighting Style reaction planner.
//
// RAW 2024: "When a creature you can see attacks a target other than
// you that is within 5 feet of you, you can use your reaction to
// impose Disadvantage on the attack roll. You must be wielding a
// Shield."
//
// Engine-side checks: protector has the Fighting Style marker, has a
// shield equipped, and hasn't used their reaction this round. Roll a
// fresh d20 for the consumer to pair with the original AttackRolled
// for the disadvantage outcome. Position / vision preconditions stay
// consumer-side (the engine doesn't model them).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
// Protection is a PHB-2024 fighting style (non-SRD); it lives in the
// extras pack since slice 401, so this test loads both packs.
import { loadPhbExtrasPack } from '../../../src/content/packs/extras.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEventId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ProtectionUsedEvent } from '../../../src/schemas/events/reactive-spells.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const EXTRAS = loadPhbExtrasPack();

const buildProtector = (opts: {
  hasFightingStyle: boolean;
  shieldId?: string;
}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Shielder',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: opts.hasFightingStyle ? ['fighting-style-protection'] : [],
    inventory: opts.shieldId !== undefined ? [opts.shieldId] : [],
    equipped: {
      ...(opts.shieldId !== undefined ? { shield: opts.shieldId } : {}),
      attuned: [],
    },
  });

const buildAttacker = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Goblin',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 12, INT: 8, WIS: 10, CHA: 8 },
    hp: { current: 11, max: 11, temp: 0 },
    featsTaken: [],
  });

const seedScene = (opts: {
  hasFightingStyle: boolean;
  withShield: boolean;
}): {
  engine: ReturnType<typeof createEngine>;
  campaign: Campaign;
  protectorId: string;
  attackerId: string;
} => {
  const engine = createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(7) });
  const shield = opts.withShield ? makeItemInstance('shield') : undefined;
  const protector = buildProtector({
    hasFightingStyle: opts.hasFightingStyle,
    shieldId: shield?.id,
  });
  const attacker = buildAttacker();
  let campaign: Campaign = engine.createCampaign({ name: 'protection' });
  const seedEvents = [];
  if (shield !== undefined) {
    seedEvents.push({
      id: eventId(),
      at: isoTimestamp(),
      type: 'ItemAcquired' as const,
      instance: shield,
    });
  }
  seedEvents.push(
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: protector } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
  );
  campaign = commit(campaign, seedEvents);
  return { engine, campaign, protectorId: protector.id, attackerId: attacker.id };
};

describe('planProtection — Fighting Style reaction', () => {
  it('emits ProtectionUsed with a fresh d20 when protector has FS + shield', () => {
    const { engine, campaign, protectorId, attackerId } = seedScene({
      hasFightingStyle: true,
      withShield: true,
    });
    const triggeringAttackEventId = newEventId();
    const outcome = engine.plan.protection(campaign.state, {
      protectorId,
      attackerId,
      triggeringAttackEventId,
    });
    expect(outcome.newD20).toBeGreaterThanOrEqual(1);
    expect(outcome.newD20).toBeLessThanOrEqual(20);
    const protectionEvent = outcome.events.find(
      (e): e is ProtectionUsedEvent => e.type === 'ProtectionUsed',
    );
    expect(protectionEvent).toBeDefined();
    expect(protectionEvent!.protectorId).toBe(protectorId);
    expect(protectionEvent!.attackerId).toBe(attackerId);
    expect(protectionEvent!.triggeringAttackEventId).toBe(triggeringAttackEventId);
    expect(protectionEvent!.newD20).toBe(outcome.newD20);
  });

  it('rejects without a shield equipped', () => {
    const { engine, campaign, protectorId, attackerId } = seedScene({
      hasFightingStyle: true,
      withShield: false,
    });
    expect(() =>
      engine.plan.protection(campaign.state, {
        protectorId,
        attackerId,
        triggeringAttackEventId: newEventId(),
      }),
    ).toThrow(/shield must be equipped/);
  });

  it('rejects without the Fighting Style', () => {
    const { engine, campaign, protectorId, attackerId } = seedScene({
      hasFightingStyle: false,
      withShield: true,
    });
    expect(() =>
      engine.plan.protection(campaign.state, {
        protectorId,
        attackerId,
        triggeringAttackEventId: newEventId(),
      }),
    ).toThrow(/does not have the Fighting Style/);
  });
});
