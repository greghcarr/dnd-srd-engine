// Slice 680: Slow's no-reactions + action-OR-bonus restrictions.
//
// The Slow spell RAW: "the target can take only one Action or one
// Bonus Action on a turn, not both, and it can't take Reactions."
// Slice 680 enforces this in applyActionEconomyConsumed: when the
// bearer has `slowed-by-spell-active`, the reducer throws when:
//   - Attempting a reaction at all.
//   - Attempting action after bonusAction (or vice versa).
//
// What this pins:
//   1. Slowed combatant: ActionEconomyConsumed { kind: reaction }
//      throws.
//   2. Slowed combatant: action-then-bonus throws on the bonus
//      commit.
//   3. Slowed combatant: bonus-then-action throws on the action
//      commit.
//   4. Slowed combatant: action alone is OK; bonus alone is OK.
//   5. Non-slowed combatant: unrestricted (today's behavior).

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

const buildCharacter = (opts: { slowed: boolean }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: opts.slowed ? 'Slowed' : 'Normal',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 40, max: 40, temp: 0 },
    appliedConditions: opts.slowed
      ? [{ id: newAppliedConditionId(), conditionId: 'slowed-by-spell-active' }]
      : [],
  });

const seedInEncounter = (character: Character): { campaign: Campaign; encounterId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'slow-econ' });
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

const consume = (encounterId: string, combatantId: string, kind: 'action' | 'bonusAction' | 'reaction'): ActionEconomyConsumedEvent => ({
  id: eventId(),
  at: isoTimestamp(),
  type: 'ActionEconomyConsumed',
  encounterId: encounterId as ULID,
  combatantId: combatantId as ULID,
  kind,
});

describe('slice 680: Slow action-economy gates', () => {
  it('slowed combatant: reaction consume throws', () => {
    const c = buildCharacter({ slowed: true });
    const s = seedInEncounter(c);
    expect(() => commit(s.campaign, [consume(s.encounterId, c.id, 'reaction')])).toThrow(/Slowed.*cannot use Reactions/);
  });

  it('slowed combatant: action-then-bonus throws on the bonus commit', () => {
    const c = buildCharacter({ slowed: true });
    const s = seedInEncounter(c);
    const after = commit(s.campaign, [consume(s.encounterId, c.id, 'action')]);
    expect(() => commit(after, [consume(s.encounterId, c.id, 'bonusAction')])).toThrow(/Slowed.*cannot use Bonus Action when an Action has already been used/);
  });

  it('slowed combatant: bonus-then-action throws on the action commit', () => {
    const c = buildCharacter({ slowed: true });
    const s = seedInEncounter(c);
    const after = commit(s.campaign, [consume(s.encounterId, c.id, 'bonusAction')]);
    expect(() => commit(after, [consume(s.encounterId, c.id, 'action')])).toThrow(/Slowed.*cannot use Action when a Bonus Action has already been used/);
  });

  it('slowed combatant: action alone is OK; bonus alone is OK', () => {
    const cA = buildCharacter({ slowed: true });
    const sA = seedInEncounter(cA);
    expect(() => commit(sA.campaign, [consume(sA.encounterId, cA.id, 'action')])).not.toThrow();
    const cB = buildCharacter({ slowed: true });
    const sB = seedInEncounter(cB);
    expect(() => commit(sB.campaign, [consume(sB.encounterId, cB.id, 'bonusAction')])).not.toThrow();
  });

  it('non-slowed combatant: action + bonus + reaction all OK (today\'s baseline)', () => {
    const c = buildCharacter({ slowed: false });
    const s = seedInEncounter(c);
    let after = commit(s.campaign, [consume(s.encounterId, c.id, 'action')]);
    after = commit(after, [consume(s.encounterId, c.id, 'bonusAction')]);
    after = commit(after, [consume(s.encounterId, c.id, 'reaction')]);
    // All three accepted.
    const combatant = after.state.encounters[s.encounterId]!.combatants[0]!;
    expect(combatant.turnUsage.actionUsed).toBe(true);
    expect(combatant.turnUsage.bonusActionUsed).toBe(true);
    expect(combatant.turnUsage.reactionUsedThisRound).toBe(true);
  });
});
