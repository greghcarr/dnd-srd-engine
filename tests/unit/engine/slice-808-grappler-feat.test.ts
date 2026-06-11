// Slice 808: the Grappler feat, previously inert (effects: []). RAW
// (feats.md): +1 STR or DEX, and "Advantage on attack rolls against a
// creature Grappled by you." (The Punch-and-Grab and Fast-Wrestler
// action-economy / movement arms are deferred.) The advantage arm uses a
// new attack-planner fact `event.targetGrappledByAttacker`.
//
// Also: this slice confirms `savage-attacker-feat-inert` is a stale audit
// false-positive — slice 467 implemented Savage Attacker (the feat works
// via the useSavageAttacker intent + the effective-feat-list check, so
// its empty `effects` array is correct, not a bug).

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

const PACK = loadStarterPack();

const buildGrappler = (): { character: Character; swordId: string; sword: ReturnType<typeof ItemInstanceSchema.parse> } => {
  const sword = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });
  const character = CharacterSchema.parse({
    id: newCharacterId(), name: 'Grappler', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 4, hitDiceRemaining: 4 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 36, max: 36, temp: 0 }, featsTaken: ['grappler'],
  });
  return { character, swordId: sword.id, sword };
};

// A target optionally Grappled by `grappledById`.
const buildTarget = (grappledById?: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
    ...(grappledById !== undefined
      ? { appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'grappled', sourceCharacterId: grappledById }] }
      : {}),
  });

const attackUsed = (target: Character): string => {
  const g = buildGrappler();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(808) });
  let campaign: Campaign = engine.createCampaign({ name: 'grappler' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: g.sword },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: g.character } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'ItemEquipped', characterId: g.character.id, instanceId: g.swordId, slot: 'mainHand' },
  ]);
  const events = engine.plan.attack(campaign.state, {
    attackerId: g.character.id, targetId: target.id, weaponInstanceId: g.swordId,
  }).events;
  return (events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled')!).used;
};

describe('Grappler feat (slice 808)', () => {
  it('the feat ships its RAW effects (ASI choice + advantage vs grappled-by-you)', () => {
    const feat = PACK.feats.find((f) => f.id === 'grappler')!;
    const asi = feat.effects.find((e) => e.kind === 'OfferChoice');
    expect(asi).toBeDefined();
    expect((asi as { options: Array<{ id: string }> }).options.map((o) => o.id)).toEqual(['str', 'dex']);
    const adv = feat.effects.find((e) => e.kind === 'SetAdvantage');
    expect(adv).toMatchObject({ on: 'attack', mode: 'advantage', condition: { kind: 'eq', path: 'event.targetGrappledByAttacker', value: true } });
  });

  it('the grappler has Advantage attacking a creature it has Grappled', () => {
    const grappler = buildGrappler();
    // target must reference the grappler's id, so build it from the same id.
    const target = buildTarget(grappler.character.id);
    // Re-seat with this specific grappler so ids line up.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(808) });
    let campaign: Campaign = engine.createCampaign({ name: 'grappler-adv' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: grappler.sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: grappler.character } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'ItemEquipped', characterId: grappler.character.id, instanceId: grappler.swordId, slot: 'mainHand' },
    ]);
    const rolled = engine.plan.attack(campaign.state, {
      attackerId: grappler.character.id, targetId: target.id, weaponInstanceId: grappler.swordId,
    }).events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled')!;
    expect(rolled.used).toBe('advantage');
  });

  it('no advantage against a non-grappled target, or one grappled by someone else', () => {
    expect(attackUsed(buildTarget(undefined))).toBe('none');
    expect(attackUsed(buildTarget(newCharacterId()))).toBe('none'); // grappled by a third party
  });
});
