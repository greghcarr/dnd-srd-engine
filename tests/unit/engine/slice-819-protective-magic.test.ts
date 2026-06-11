// Slice 819: Protective Magic (3/Day) — the Mage / Archmage Reaction that
// casts Counterspell OR Shield, the last `npc-caster-bonus-action-groups`
// item needing an engine seam.
//
// Counterspell and Shield are dedicated planners (off the generic castSpell
// path) that expend a spell SLOT — like Misty Step (817). With THREE such
// planners now needing slot-less NPC per-day metering, the shared helper
// `resolvePerDayFreeCast` was extracted (mirroring castSpell's slice-794/818
// path) and Misty Step refactored onto it. Protective Magic reuses the
// slice-818 `perDayPoolId`: Counterspell + Shield share one 3/Day budget.
//
// This pins: a slot-less Mage casts each as a Reaction (reaction economy +
// PerDayCastUsed, no caster slot), and the shared budget — three uses across
// the pool block a fourth, even of a spell never cast.

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
import type { ULID } from '../../../src/engine/ids-utils.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildMage = (opts?: { perDayUsed?: Record<string, number> }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Test Mage',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === 'mage')!.abilityScores,
    hp: { current: 81, max: 81, temp: 0 },
    statblockId: 'mage',
    perDayCastsUsed: opts?.perDayUsed ?? {},
  });

const buildEnemy = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Enemy',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

// Seed an ACTIVE encounter (mage + enemy) so the mage has a reaction
// available; it's the enemy's turn (reactions fire off-turn).
const seedEncounter = (mage: Character, seed: number) => {
  const enemy = buildEnemy();
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'protective-magic' });
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: mage } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: enemy } satisfies CharacterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'EncounterCreated',
      encounterId: encounterId as ULID, combatantIds: [mage.id as ULID, enemy.id as ULID],
    } satisfies EncounterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: encounterId as ULID,
      rolls: [
        { combatantId: enemy.id as ULID, d20: 18, modifier: 2, total: 20 },
        { combatantId: mage.id as ULID, d20: 4, modifier: 0, total: 4 },
      ],
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: encounterId as ULID } satisfies EncounterStartedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: encounterId as ULID,
      combatantId: enemy.id as ULID, round: 1,
    } satisfies TurnStartedEvent,
  ]);
  return { engine, campaign, encounterId, mageId: mage.id, enemyId: enemy.id };
};

const types = (events: ReadonlyArray<{ type: string }>) => events.map((e) => e.type);
const mageSlotEvents = (events: ReadonlyArray<{ type: string; characterId?: string }>, mageId: string) =>
  events.filter((e) => e.type === 'SpellSlotConsumed' && e.characterId === mageId);

describe('Protective Magic 3/Day (slice 819)', () => {
  it('the Mage and Archmage ship Counterspell + Shield sharing one 3/Day pool (INT)', () => {
    for (const id of ['mage', 'archmage']) {
      const sb = PACK.monsters.find((m) => m.id === id)!;
      const pm = sb.traits.filter(
        (t) => t.kind === 'GrantSpell' && (t as { perDayPoolId?: string }).perDayPoolId === 'protective-magic',
      ) as Array<{ spellId: string; usesPerLongRest?: number }>;
      expect(pm.map((g) => g.spellId).sort()).toEqual(['counterspell', 'shield']);
      for (const g of pm) expect(g.usesPerLongRest).toBe(3);
    }
  });

  it('a slot-less Mage casts Shield as a Reaction: reaction economy + PerDayCastUsed, no slot', () => {
    const mage = buildMage();
    const s = seedEncounter(mage, 8190);
    const { events } = s.engine.plan.shield(s.campaign.state, {
      casterId: s.mageId, triggeringAttackEventId: 'atk-1', triggeringAttackTotal: 18, originalAC: 15, useFreeCast: true,
    });
    expect(types(events)).toContain('PerDayCastUsed');
    expect(mageSlotEvents(events, s.mageId)).toEqual([]);
    const reaction = events.find((e) => e.type === 'ActionEconomyConsumed') as { kind?: string } | undefined;
    expect(reaction?.kind).toBe('reaction');
    const after = commit(s.campaign, events);
    expect(after.state.characters[s.mageId]?.perDayCastsUsed['shield']).toBe(1);
  });

  it('a slot-less Mage casts Counterspell as a Reaction: reaction economy + PerDayCastUsed, no caster slot', () => {
    const mage = buildMage();
    const s = seedEncounter(mage, 8191);
    const { events } = s.engine.plan.counterspell(s.campaign.state, {
      counterCasterId: s.mageId, targetCasterId: s.enemyId, originalSpellEventId: 'cast-1',
      spellId: 'fireball', castingClassId: '', originalSpellLevel: 0, useFreeCast: true,
    });
    expect(types(events)).toContain('PerDayCastUsed');
    expect(types(events)).toContain('SaveRolled'); // the counter still rolls the CON save
    expect(mageSlotEvents(events, s.mageId)).toEqual([]);
    const after = commit(s.campaign, events);
    expect(after.state.characters[s.mageId]?.perDayCastsUsed['counterspell']).toBe(1);
  });

  it('shares one 3/Day budget across Counterspell + Shield: three Counterspells block a never-cast Shield', () => {
    const mage = buildMage({ perDayUsed: { counterspell: 3 } });
    const s = seedEncounter(mage, 8192);
    // Shield was never cast, but the shared pool is spent (3/3).
    expect(() =>
      s.engine.plan.shield(s.campaign.state, {
        casterId: s.mageId, triggeringAttackEventId: 'atk-2', triggeringAttackTotal: 18, originalAC: 15, useFreeCast: true,
      }),
    ).toThrow(/no remaining daily uses/i);
    // And a fourth Counterspell is blocked too.
    expect(() =>
      s.engine.plan.counterspell(s.campaign.state, {
        counterCasterId: s.mageId, targetCasterId: s.enemyId, originalSpellEventId: 'cast-2',
        spellId: 'fireball', castingClassId: '', originalSpellLevel: 0, useFreeCast: true,
      }),
    ).toThrow(/no remaining daily uses/i);
  });

  it('a long rest refreshes the shared pool', () => {
    const mage = buildMage({ perDayUsed: { counterspell: 2, shield: 1 } });
    const s = seedEncounter(mage, 8193);
    expect(() =>
      s.engine.plan.shield(s.campaign.state, {
        casterId: s.mageId, triggeringAttackEventId: 'atk-3', triggeringAttackTotal: 18, originalAC: 15, useFreeCast: true,
      }),
    ).toThrow(/no remaining daily uses/i);
    const rested = commit(s.campaign, s.engine.plan.longRest(s.campaign.state, { participantIds: [s.mageId] }).events);
    const { events } = s.engine.plan.shield(rested.state, {
      casterId: s.mageId, triggeringAttackEventId: 'atk-4', triggeringAttackTotal: 18, originalAC: 15, useFreeCast: true,
    });
    expect(types(events)).toContain('PerDayCastUsed');
  });
});
