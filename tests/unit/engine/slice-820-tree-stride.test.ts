// Slice 820: the Dryad's Tree Stride Bonus Action — the last
// `npc-caster-bonus-action-groups` item (and the only one that isn't a
// spell). RAW: "If within 5 feet of a Large or bigger tree, the dryad
// teleports to an unoccupied space within 5 feet of a second Large or
// bigger tree that is within 60 feet of the previous tree."
//
// Trees are terrain the engine doesn't model (positions are tracked,
// terrain is consumer-managed), so the tree-adjacency constraints are
// consumer-validated. The engine enforces what it owns: the bearer has
// Tree Stride (a new `GrantTreeStride` marker), it's their turn with a
// Bonus Action free, and the destination is within 60 ft + unoccupied.

import { describe, expect, it } from 'vitest';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEncounterId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  EncounterCreatedEvent,
  EncounterStartedEvent,
  InitiativeRolledEvent,
  TurnStartedEvent,
} from '../../../src/schemas/events/encounter.js';
import type { CombatantMovedEvent } from '../../../src/schemas/events/movement.js';
import type { ULID } from '../../../src/engine/ids-utils.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildFrom = (statblockId: string | undefined, name: string, abilityScores: Character['abilityScores']): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores,
    hp: { current: 22, max: 22, temp: 0 },
    ...(statblockId !== undefined ? { statblockId } : {}),
  });

const buildDryad = () =>
  buildFrom('dryad', 'Test Dryad', PACK.monsters.find((m) => m.id === 'dryad')!.abilityScores);
const buildPlain = () =>
  buildFrom(undefined, 'Fighter', { STR: 14, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 });

// Seed an active encounter with `caster` active at (5,5) and a second
// combatant parked far away (and optionally at a blocking cell).
const seedEncounter = (caster: Character, seed: number, otherAt: { x: number; y: number } = { x: 30, y: 30 }) => {
  const other = buildPlain();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'tree-stride' });
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: other } satisfies CharacterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'EncounterCreated',
      encounterId: encounterId as ULID, combatantIds: [caster.id as ULID, other.id as ULID],
    } satisfies EncounterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: encounterId as ULID,
      rolls: [
        { combatantId: caster.id as ULID, d20: 18, modifier: 2, total: 20 },
        { combatantId: other.id as ULID, d20: 3, modifier: 0, total: 3 },
      ],
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: encounterId as ULID } satisfies EncounterStartedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: encounterId as ULID,
      combatantId: caster.id as ULID, round: 1,
    } satisfies TurnStartedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: encounterId as ULID,
      combatantId: caster.id as ULID, fromPosition: { x: 0, y: 0 }, toPosition: { x: 5, y: 5 }, feetTraveled: 0,
    } satisfies CombatantMovedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: encounterId as ULID,
      combatantId: other.id as ULID, fromPosition: { x: 0, y: 0 }, toPosition: otherAt, feetTraveled: 0,
    } satisfies CombatantMovedEvent,
  ]);
  const combatant = (c: Campaign, id: string) =>
    c.state.encounters[encounterId]!.combatants.find((x) => x.combatantId === id)!;
  return { engine, campaign, encounterId, casterId: caster.id, otherId: other.id, combatant };
};

describe('Dryad Tree Stride (slice 820)', () => {
  it('the Dryad ships the Tree Stride ability marker', () => {
    const d = PACK.monsters.find((m) => m.id === 'dryad')!;
    expect(d.traits.some((t) => t.kind === 'GrantTreeStride')).toBe(true);
  });

  it('teleports up to 60 ft as a Bonus Action without draining movement', () => {
    const s = seedEncounter(buildDryad(), 8200);
    const { events } = s.engine.plan.treeStride(s.campaign.state, { casterId: s.casterId, to: { x: 15, y: 5 } });
    expect(events.map((e) => e.type)).toEqual(['ActionEconomyConsumed', 'CombatantMoved']);
    const reaction = events.find((e) => e.type === 'ActionEconomyConsumed') as { kind?: string } | undefined;
    expect(reaction?.kind).toBe('bonusAction');
    const moved = events.find((e) => e.type === 'CombatantMoved') as { feetTraveled?: number } | undefined;
    expect(moved?.feetTraveled).toBe(0); // teleport — no normal movement spent
    const after = commit(s.campaign, events);
    expect(s.combatant(after, s.casterId).position).toEqual({ x: 15, y: 5 });
    expect(s.combatant(after, s.casterId).turnUsage.bonusActionUsed).toBe(true);
  });

  it('rejects a destination beyond 60 ft', () => {
    const s = seedEncounter(buildDryad(), 8201);
    // (5,5) -> (70,5) is 65 ft (Chebyshev), past the 60 ft reach.
    expect(() => s.engine.plan.treeStride(s.campaign.state, { casterId: s.casterId, to: { x: 70, y: 5 } })).toThrow(/max 60ft/i);
  });

  it('rejects an occupied destination', () => {
    const s = seedEncounter(buildDryad(), 8202, { x: 10, y: 5 });
    expect(() => s.engine.plan.treeStride(s.campaign.state, { casterId: s.casterId, to: { x: 10, y: 5 } })).toThrow(/occupied/i);
  });

  it('rejects when the Bonus Action is already spent', () => {
    const s = seedEncounter(buildDryad(), 8203);
    const first = s.engine.plan.treeStride(s.campaign.state, { casterId: s.casterId, to: { x: 8, y: 5 } }).events;
    const after = commit(s.campaign, first);
    expect(() => s.engine.plan.treeStride(after.state, { casterId: s.casterId, to: { x: 10, y: 5 } })).toThrow(/bonus action/i);
  });

  it('rejects a creature that does not have Tree Stride', () => {
    const s = seedEncounter(buildPlain(), 8204);
    expect(() => s.engine.plan.treeStride(s.campaign.state, { casterId: s.casterId, to: { x: 8, y: 5 } })).toThrow(/does not have Tree Stride/i);
  });
});
