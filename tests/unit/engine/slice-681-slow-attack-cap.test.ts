// Slice 681: Slow's max-one-attack cap.
//
// RAW Slow: "the target can make only one melee or ranged attack on
// its turn." Slice 681 enforces this in applyActionEconomyConsumed
// when kind === 'attack'.
//
// What this pins:
//   1. Slowed combatant: first attack-consume OK; second throws.
//   2. Non-slowed combatant: multi-attack baseline preserved.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newAppliedConditionId, newEncounterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { EncounterCreatedEvent, EncounterStartedEvent, InitiativeRolledEvent, TurnStartedEvent } from '../../../src/schemas/events/encounter.js';
import type { ActionEconomyConsumedEvent } from '../../../src/schemas/events/action-economy.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const buildFighter = (opts: { slowed: boolean }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: opts.slowed ? 'Slowed' : 'Normal',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    appliedConditions: opts.slowed
      ? [{ id: newAppliedConditionId(), conditionId: 'slowed-by-spell-active' }]
      : [],
  });

const seedInEncounter = (character: Character): { campaign: Campaign; encounterId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'slow-attack-cap' });
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'EncounterCreated',
      encounterId: encounterId as ULID,
      combatantIds: [character.id as ULID],
    } satisfies EncounterCreatedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'InitiativeRolled',
      encounterId: encounterId as ULID,
      rolls: [{ combatantId: character.id as ULID, d20: 15, modifier: 2, total: 17 }],
    } satisfies InitiativeRolledEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'EncounterStarted',
      encounterId: encounterId as ULID,
    } satisfies EncounterStartedEvent,
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'TurnStarted',
      encounterId: encounterId as ULID,
      combatantId: character.id as ULID,
      round: 1,
    } satisfies TurnStartedEvent,
  ]);
  return { campaign, encounterId };
};

const consumeAttack = (encounterId: string, combatantId: string): ActionEconomyConsumedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'ActionEconomyConsumed',
  encounterId: encounterId as ULID,
  combatantId: combatantId as ULID,
  kind: 'attack',
});

describe('slice 681: Slow max-one-attack cap', () => {
  it('slowed combatant: first attack consume OK; second throws', () => {
    const c = buildFighter({ slowed: true });
    const s = seedInEncounter(c);
    const after = commit(s.campaign, [consumeAttack(s.encounterId, c.id)]);
    expect(after.state.encounters[s.encounterId]!.combatants[0]!.turnUsage.attacksMadeThisTurn).toBe(1);
    expect(() => commit(after, [consumeAttack(s.encounterId, c.id)])).toThrow(/Slowed.*can make only one melee or ranged attack/);
  });

  it('non-slowed Fighter L5+: multi-attack baseline preserved (Extra Attack)', () => {
    const c = buildFighter({ slowed: false });
    const s = seedInEncounter(c);
    let after = commit(s.campaign, [consumeAttack(s.encounterId, c.id)]);
    after = commit(after, [consumeAttack(s.encounterId, c.id)]);
    expect(after.state.encounters[s.encounterId]!.combatants[0]!.turnUsage.attacksMadeThisTurn).toBe(2);
  });
});
