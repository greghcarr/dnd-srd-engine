// Slice 463: Cleric L2 Channel Divinity — Turn Undead.
//
// RAW (SRD 5.2.1 Cleric L2): "As a Magic action, you present your
// Holy Symbol and censure Undead creatures. Each Undead of your
// choice within 30 feet of you must make a Wisdom saving throw. If
// the creature fails its save, it has the Frightened and
// Incapacitated conditions for 1 minute. ... This effect ends early
// on the creature if it takes any damage..."
//
// New planTurnUndead spends 1 Channel Divinity use, computes the
// cleric's spell save DC (8 + WIS + PB), rolls WIS saves per target,
// and applies Frightened + Incapacitated (both with endsOnDamage:
// true) per failure. Non-Undead targets are silently skipped.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildCleric = (level: number, cdRemaining = 2): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mira',
    speciesId: 'human',
    backgroundId: 'acolyte',
    classes: [{ classId: 'cleric', level, hitDiceRemaining: level, subclassId: 'life-domain' }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 12 },
    hp: { current: 20, max: 20, temp: 0 },
    resources: [{ resourceId: 'channel-divinity', current: cdRemaining, max: 2 }],
  });

const buildZombie = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Zombie',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'zombie',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 13, DEX: 6, CON: 16, INT: 3, WIS: 6, CHA: 5 },
    hp: { current: 15, max: 15, temp: 0 },
  });

const buildHumanTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alex',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

const setup = (characters: Character[]): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'turn-undead' });
  campaign = commit(
    campaign,
    characters.map(
      (c) =>
        ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent,
    ),
  );
  return { engine, campaign };
};

describe('Cleric Turn Undead (slice 463)', () => {
  it('a L2 cleric targeting a Zombie: rolls WIS save; on failure applies Frightened + Incapacitated with endsOnDamage', () => {
    // The zombie's WIS is 6 (mod -2), DC = 8 + WIS 16 (+3) + PB 2 = 13.
    // Zombie needs d20 >= 15 to save. Try seeds until one rolls a failure.
    let attempt = 0;
    let proven = false;
    while (attempt < 40 && !proven) {
      attempt += 1;
      const cleric = buildCleric(2);
      const zombie = buildZombie();
      const { engine, campaign } = setup([cleric, zombie]);
      const events = engine.plan.turnUndead(campaign.state, {
        clericId: cleric.id,
        targetIds: [zombie.id],
      }).events;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(save?.ability).toBe('WIS');
      expect(save?.dc).toBe(13);
      const resSpent = events.find((e) => e.type === 'ResourceSpent');
      expect(resSpent).toBeDefined();
      if (save !== undefined && !save.success) {
        const frightened = events.find(
          (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'frightened',
        ) as ConditionAppliedEvent | undefined;
        const incapacitated = events.find(
          (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'incapacitated',
        ) as ConditionAppliedEvent | undefined;
        expect(frightened).toBeDefined();
        expect(incapacitated).toBeDefined();
        expect(frightened!.endsOnDamage).toBe(true);
        expect(incapacitated!.endsOnDamage).toBe(true);
        proven = true;
      }
    }
    expect(proven, `no save failure in ${attempt} seeds`).toBe(true);
  });

  it('cleric L1 rejected (Channel Divinity requires Cleric L2)', () => {
    const cleric = buildCleric(1);
    const zombie = buildZombie();
    const { engine, campaign } = setup([cleric, zombie]);
    expect(() =>
      engine.plan.turnUndead(campaign.state, { clericId: cleric.id, targetIds: [zombie.id] }),
    ).toThrow(/Channel Divinity.*level 2/);
  });

  it('cleric with no Channel Divinity uses remaining is rejected', () => {
    const cleric = buildCleric(2, 0);
    const zombie = buildZombie();
    const { engine, campaign } = setup([cleric, zombie]);
    expect(() =>
      engine.plan.turnUndead(campaign.state, { clericId: cleric.id, targetIds: [zombie.id] }),
    ).toThrow(/no Channel Divinity uses/);
  });

  it('non-Undead target is silently skipped (no save rolled for them)', () => {
    const cleric = buildCleric(2);
    const human = buildHumanTarget();
    const { engine, campaign } = setup([cleric, human]);
    const events = engine.plan.turnUndead(campaign.state, {
      clericId: cleric.id,
      targetIds: [human.id],
    }).events;
    // ResourceSpent still fires (action is used), but no SaveRolled
    // for the non-Undead target.
    expect(events.some((e) => e.type === 'ResourceSpent')).toBe(true);
    expect(events.some((e) => e.type === 'SaveRolled')).toBe(false);
  });

  it('non-cleric is rejected', () => {
    const human = buildHumanTarget();
    const { engine, campaign } = setup([human]);
    expect(() =>
      engine.plan.turnUndead(campaign.state, { clericId: human.id, targetIds: [] }),
    ).toThrow(/does not have Channel Divinity/);
  });
});
