// Slice 818: Priest Divine Aid (3/Day) — the last of the
// `npc-caster-bonus-action-groups` items that needed engine seams.
//
// Two coordinated additions on the GrantSpell effect:
//   - `perDayPoolId`: a SHARED "N/Day" budget across several perLongRest
//     grants. RAW "Divine Aid (3/Day)" casts ONE of Bless / Dispel Magic /
//     Healing Word / Lesser Restoration — 3 uses TOTAL, not 3 each. The
//     cast path sums every pool member's `perDayCastsUsed` counter against
//     the shared `usesPerLongRest` budget (each cast still increments its
//     own spell's counter, so PerDayCastUsed.spellId stays accurate; the
//     long rest clears them all). No resource seeding needed — unlike a
//     `freeCastResourceId` pool, the per-day counter is base character
//     state, so it works for a monster out of the box.
//   - `castAsBonusAction`: a cast-time override. Divine Aid is a Bonus
//     Action, but Bless and Dispel Magic are Action spells — cast through
//     the grant they consume the Bonus Action.

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

const buildMonster = (statblockId: string, name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: PACK.monsters.find((m) => m.id === statblockId)!.abilityScores,
    hp: { current: 200, max: 200, temp: 0 },
    statblockId,
  });

const POOL = ['bless', 'dispel-magic', 'healing-word', 'lesser-restoration'] as const;
const LEVEL: Record<string, number> = { bless: 1, 'dispel-magic': 3, 'healing-word': 1, 'lesser-restoration': 2 };

describe('Priest Divine Aid 3/Day (slice 818)', () => {
  it('ships the four Divine Aid spells sharing one 3/Day pool, Bless/Dispel Magic as Bonus Actions', () => {
    const pr = PACK.monsters.find((m) => m.id === 'priest')!;
    const grants = pr.traits.filter(
      (t) => t.kind === 'GrantSpell' && (t as { perDayPoolId?: string }).perDayPoolId === 'divine-aid',
    ) as Array<{ spellId: string; usesPerLongRest?: number; castAsBonusAction?: boolean }>;
    expect(grants.map((g) => g.spellId).sort()).toEqual([...POOL].sort());
    for (const g of grants) expect(g.usesPerLongRest).toBe(3);
    const ba = new Set(grants.filter((g) => g.castAsBonusAction).map((g) => g.spellId));
    expect(ba).toEqual(new Set(['bless', 'dispel-magic']));
  });

  it('shares one 3/Day budget across the pool: three different spells exhaust it, a fourth (never cast) is blocked', () => {
    const priest = buildMonster('priest', 'Test Priest');
    const target = buildMonster('boar', 'Target');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8180) });
    let campaign: Campaign = engine.createCampaign({ name: 'divine-aid' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: priest } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const cast = (spellId: string) =>
      engine.plan.castSpell(campaign.state, {
        characterId: priest.id, spellId, slotLevel: LEVEL[spellId]!, targetIds: [target.id], useFreeCast: true,
      }).events;

    // Three DIFFERENT pool spells, each metering its own counter.
    for (const spellId of ['bless', 'healing-word', 'lesser-restoration']) {
      const events = cast(spellId);
      expect(events.map((e) => e.type), spellId).toContain('PerDayCastUsed');
      expect(events.map((e) => e.type), spellId).not.toContain('SpellSlotConsumed');
      campaign = commit(campaign, events);
    }
    const used = campaign.state.characters[priest.id]!.perDayCastsUsed;
    expect(used).toMatchObject({ bless: 1, 'healing-word': 1, 'lesser-restoration': 1 });

    // The shared budget is spent (3/3) — so Dispel Magic, never cast, is blocked.
    expect(() => cast('dispel-magic')).toThrow(/no remaining daily uses/i);
    // And a repeat of an already-cast pool spell is blocked too.
    expect(() => cast('bless')).toThrow(/no remaining daily uses/i);
  });

  it('a long rest refreshes the shared pool', () => {
    const priest = buildMonster('priest', 'Rested Priest');
    const target = buildMonster('boar', 'Target');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8181) });
    let campaign: Campaign = engine.createCampaign({ name: 'divine-aid-rest' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: priest } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const cast = (spellId: string) =>
      engine.plan.castSpell(campaign.state, {
        characterId: priest.id, spellId, slotLevel: LEVEL[spellId]!, targetIds: [target.id], useFreeCast: true,
      }).events;
    for (const spellId of ['bless', 'healing-word', 'lesser-restoration']) campaign = commit(campaign, cast(spellId));
    expect(() => cast('bless')).toThrow(/no remaining daily uses/i);
    campaign = commit(campaign, engine.plan.longRest(campaign.state, { participantIds: [priest.id] }).events);
    // Pool refreshed: a cast succeeds again.
    expect(cast('bless').map((e) => e.type)).toContain('PerDayCastUsed');
  });

  it('casts Bless (an Action spell) as a Bonus Action through Divine Aid', () => {
    const priest = buildMonster('priest', 'Encounter Priest');
    const ally = buildMonster('boar', 'Ally');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8182) });
    let campaign: Campaign = engine.createCampaign({ name: 'divine-aid-econ' });
    const encounterId = newEncounterId();
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: priest } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ally } satisfies CharacterCreatedEvent,
      {
        id: eventId(), at: isoTimestamp(), type: 'EncounterCreated',
        encounterId: encounterId as ULID, combatantIds: [priest.id as ULID, ally.id as ULID],
      } satisfies EncounterCreatedEvent,
      {
        id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: encounterId as ULID,
        rolls: [
          { combatantId: priest.id as ULID, d20: 18, modifier: 2, total: 20 },
          { combatantId: ally.id as ULID, d20: 3, modifier: 0, total: 3 },
        ],
      } satisfies InitiativeRolledEvent,
      { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: encounterId as ULID } satisfies EncounterStartedEvent,
      {
        id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: encounterId as ULID,
        combatantId: priest.id as ULID, round: 1,
      } satisfies TurnStartedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: priest.id, spellId: 'bless', slotLevel: 1, targetIds: [priest.id], useFreeCast: true,
    }).events;
    const after = commit(campaign, events);
    const turnUsage = after.state.encounters[encounterId]!.combatants.find((c) => c.combatantId === priest.id)!.turnUsage;
    expect(turnUsage.bonusActionUsed).toBe(true);
    expect(turnUsage.actionUsed).toBe(false);
  });
});
