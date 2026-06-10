// Slice 803: planGrapple / planShove enforce the RAW gates they skipped
// (Area 4 divergence `grapple-shove-missing-gates`). RAW (rules-glossary
// "Unarmed Strike"): a Grapple/Shove "is possible only if the target is
// no more than one size larger than you", a Grapple additionally requires
// "a hand free to grab it", and either requires the actor to be able to
// act. Without these, a Stunned Medium PC could grapple a Gargantuan
// dragon two-handed.

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
import type { Size } from '../../../src/schemas/primitives.js';

const PACK = loadStarterPack();

interface BuildOpts {
  size?: Size;
  stunned?: boolean;
  mainHand?: string; // weapon definition id
}

const build = (name: string, opts: BuildOpts = {}): { character: Character; instance?: ReturnType<typeof ItemInstanceSchema.parse> } => {
  let instance: ReturnType<typeof ItemInstanceSchema.parse> | undefined;
  let mainHandId: string | undefined;
  if (opts.mainHand !== undefined) {
    instance = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: opts.mainHand });
    mainHandId = instance.id;
  }
  const character = CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    ...(opts.size !== undefined ? { sizeOverride: opts.size } : {}),
    ...(opts.stunned ? { appliedConditions: [{ id: newAppliedConditionId(), conditionId: 'stunned' }] } : {}),
    ...(mainHandId !== undefined ? { equipped: { mainHand: mainHandId, attuned: [] } } : {}),
  });
  return { character, instance };
};

const seat = (attacker: ReturnType<typeof build>, target: ReturnType<typeof build>): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(803) });
  let campaign: Campaign = engine.createCampaign({ name: 'gates' });
  const events = [];
  for (const inst of [attacker.instance, target.instance]) {
    if (inst !== undefined) events.push({ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired' as const, instance: inst });
  }
  events.push(
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker.character } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target.character } satisfies CharacterCreatedEvent,
  );
  campaign = commit(campaign, events);
  return { engine, campaign };
};

describe('Grapple / Shove RAW gates (slice 803)', () => {
  it('a Stunned attacker cannot grapple or shove', () => {
    const attacker = build('Stunned', { stunned: true });
    const target = build('Target');
    const { engine, campaign } = seat(attacker, target);
    expect(() => engine.plan.grapple(campaign.state, { attackerId: attacker.character.id, targetId: target.character.id }))
      .toThrow(/cannot grapple while Stunned/i);
    expect(() => engine.plan.shove(campaign.state, { attackerId: attacker.character.id, targetId: target.character.id, mode: 'prone' }))
      .toThrow(/cannot shove while Stunned/i);
  });

  it('cannot grapple/shove a target more than one size larger', () => {
    const attacker = build('Medium'); // Medium
    const huge = build('HugeTarget', { size: 'Huge' }); // +2 sizes
    const { engine, campaign } = seat(attacker, huge);
    expect(() => engine.plan.grapple(campaign.state, { attackerId: attacker.character.id, targetId: huge.character.id }))
      .toThrow(/more than one size larger/i);
    expect(() => engine.plan.shove(campaign.state, { attackerId: attacker.character.id, targetId: huge.character.id, mode: 'push' }))
      .toThrow(/more than one size larger/i);
  });

  it('CAN grapple a target exactly one size larger (Large)', () => {
    const attacker = build('Medium');
    const large = build('LargeTarget', { size: 'Large' });
    const { engine, campaign } = seat(attacker, large);
    expect(() => engine.plan.grapple(campaign.state, { attackerId: attacker.character.id, targetId: large.character.id }))
      .not.toThrow();
  });

  it('a two-handed weapon leaves no free hand → grapple is blocked', () => {
    const attacker = build('Greatswordsman', { mainHand: 'greatsword' });
    const target = build('Target');
    const { engine, campaign } = seat(attacker, target);
    expect(() => engine.plan.grapple(campaign.state, { attackerId: attacker.character.id, targetId: target.character.id }))
      .toThrow(/free hand/i);
  });

  it('Shove has no free-hand requirement: a two-handed wielder can still shove', () => {
    const attacker = build('Greatswordsman', { mainHand: 'greatsword' });
    const target = build('Target');
    const { engine, campaign } = seat(attacker, target);
    expect(() => engine.plan.shove(campaign.state, { attackerId: attacker.character.id, targetId: target.character.id, mode: 'prone' }))
      .not.toThrow();
  });

  it('a clean, empty-handed Medium-vs-Medium grapple still works', () => {
    const attacker = build('Wrestler');
    const target = build('Target');
    const { engine, campaign } = seat(attacker, target);
    const events = engine.plan.grapple(campaign.state, { attackerId: attacker.character.id, targetId: target.character.id }).events;
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(true);
  });
});
