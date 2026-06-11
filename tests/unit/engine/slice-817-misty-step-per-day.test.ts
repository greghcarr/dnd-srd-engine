// Slice 817: Misty Step per-day enabler — closes the Misty Step strand of
// `npc-caster-bonus-action-groups`.
//
// Misty Step has a DEDICATED planner (`planMistyStep`) — it needs a
// destination and performs the teleport, so it's off the generic castSpell
// path. That planner always expended a spell SLOT and recognized only
// known/prepared spells, so a slot-less NPC caster (Mage / Archmage, whose
// statblock prints "Misty Step (3/Day)" as a Bonus Action) could not cast
// it. The enabler adds a `useFreeCast` path that mirrors castSpell's
// slice-794 per-day machinery: a granted Misty Step satisfies the
// "knows the spell" check, and a `perLongRest` ("N/Day") grant meters
// against `perDayCastsUsed` + emits PerDayCastUsed instead of
// SpellSlotConsumed. The slot path (players) is unchanged.

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

const buildMage = (opts?: { perDayUsed?: number }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Test Mage',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === 'mage')!.abilityScores,
    hp: { current: 81, max: 81, temp: 0 },
    statblockId: 'mage',
    perDayCastsUsed: opts?.perDayUsed !== undefined ? { 'misty-step': opts.perDayUsed } : {},
  });

// A plain caster who KNOWS Misty Step (prepared) but has no granted bucket.
const buildSorcerer = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sorcerer',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'sorcerer', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
    hp: { current: 38, max: 38, temp: 0 },
    knownSpells: ['misty-step'],
    preparedSpells: ['misty-step'],
  });

const buildDummy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Dummy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 20, max: 20, temp: 0 },
  });

// Seed an encounter with `caster` active at (5,5) and a dummy far away.
const seedEncounter = (caster: Character, seed: number) => {
  const dummy = buildDummy();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'misty-per-day' });
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: caster } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dummy } satisfies CharacterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'EncounterCreated',
      encounterId: encounterId as ULID, combatantIds: [caster.id as ULID, dummy.id as ULID],
    } satisfies EncounterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: encounterId as ULID,
      rolls: [
        { combatantId: caster.id as ULID, d20: 18, modifier: 2, total: 20 },
        { combatantId: dummy.id as ULID, d20: 3, modifier: 0, total: 3 },
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
      combatantId: dummy.id as ULID, fromPosition: { x: 0, y: 0 }, toPosition: { x: 20, y: 20 }, feetTraveled: 0,
    } satisfies CombatantMovedEvent,
  ]);
  const turnUsage = (c: Campaign) =>
    c.state.encounters[encounterId]!.combatants.find((x) => x.combatantId === caster.id)!.turnUsage;
  return { engine, campaign, casterId: caster.id, turnUsage };
};

describe('Misty Step per-day enabler (slice 817)', () => {
  it('the Mage and Archmage ship Misty Step as a 3/Day bonus-action group', () => {
    for (const id of ['mage', 'archmage']) {
      const sb = PACK.monsters.find((m) => m.id === id)!;
      const grant = sb.traits.find(
        (t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === 'misty-step',
      );
      expect(grant, id).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 3 });
    }
  });

  it('a slot-less Mage casts its granted Misty Step per-day: teleport + PerDayCastUsed, no slot', () => {
    const mage = buildMage();
    const s = seedEncounter(mage, 8170);
    const { events } = s.engine.plan.mistyStep(s.campaign.state, {
      casterId: s.casterId, to: { x: 8, y: 5 }, useFreeCast: true,
    });
    const types = events.map((e) => e.type);
    expect(types).toContain('PerDayCastUsed');
    expect(types).not.toContain('SpellSlotConsumed');
    expect(types).toContain('CombatantMoved');
    const after = commit(s.campaign, events);
    expect(after.state.characters[s.casterId]?.perDayCastsUsed['misty-step']).toBe(1);
    expect(s.turnUsage(after).bonusActionUsed).toBe(true);
  });

  it('enforces the 3/Day budget: a Mage who has used all three is blocked', () => {
    const mage = buildMage({ perDayUsed: 3 });
    const s = seedEncounter(mage, 8171);
    expect(() =>
      s.engine.plan.mistyStep(s.campaign.state, { casterId: s.casterId, to: { x: 8, y: 5 }, useFreeCast: true }),
    ).toThrow(/no remaining daily uses/i);
  });

  it('useFreeCast on a caster who knows Misty Step but has no per-day grant is rejected', () => {
    const sorcerer = buildSorcerer();
    const s = seedEncounter(sorcerer, 8172);
    expect(() =>
      s.engine.plan.mistyStep(s.campaign.state, { casterId: s.casterId, to: { x: 8, y: 5 }, useFreeCast: true }),
    ).toThrow(/no per-day grant/i);
  });
});
