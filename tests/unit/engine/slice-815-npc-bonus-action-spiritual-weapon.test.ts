// Slice 815: npc-caster-bonus-action-groups (partial) — the Cultist
// Fanatic's bonus-action Spiritual Weapon (2/Day).
//
// The slice 794/814 NPC-caster sweep covered the core *Spellcasting*
// action; several casters print a SECOND, bonus-action / reaction spell
// group. Most need an engine seam (tracked, see slice-815.md):
//   - Misty Step 3/Day (Mage, Archmage): the dedicated planMistyStep
//     consumes a spell SLOT and recognizes only known/prepared spells, so
//     a slot-less monster can't meter it per-day without a planner change.
//   - Divine Aid 3/Day (Priest): a SHARED 3/Day pool across four spells
//     (perDayCastsUsed is per-spell) + Bless/Dispel Magic cast as a Bonus
//     Action (a cast-time override).
//   - Protective Magic 3/Day (Mage, Archmage): a Counterspell/Shield
//     reaction — needs the monster reaction seam.
//
// Spiritual Weapon needs NO engine work: it's an intrinsic Bonus-Action
// spell ridden by the generic castSpell path, which already meters the
// cultist's Command/Hold Person per-day buckets (slice 794) and consumes
// the bonus action from the spell's casting time (cast-spell.ts). This
// pins the cultist's grant end-to-end.

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

// A Cultist Fanatic at (5,5) and a target at (6,5), the cultist active on
// its turn. Returns the engine + campaign so a test can cast and inspect.
const seedCultistEncounter = (seed: number) => {
  const cultist = buildMonster('cultist-fanatic', 'Encounter Cultist');
  const target = buildMonster('boar', 'Encounter Target');
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  let campaign: Campaign = engine.createCampaign({ name: 'cultist-encounter' });
  const encounterId = newEncounterId();
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cultist } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'EncounterCreated',
      encounterId: encounterId as ULID, combatantIds: [cultist.id as ULID, target.id as ULID],
    } satisfies EncounterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: encounterId as ULID,
      rolls: [
        { combatantId: cultist.id as ULID, d20: 18, modifier: 2, total: 20 },
        { combatantId: target.id as ULID, d20: 4, modifier: 0, total: 4 },
      ],
    } satisfies InitiativeRolledEvent,
    { id: eventId(), at: isoTimestamp(), type: 'EncounterStarted', encounterId: encounterId as ULID } satisfies EncounterStartedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'TurnStarted', encounterId: encounterId as ULID,
      combatantId: cultist.id as ULID, round: 1,
    } satisfies TurnStartedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: encounterId as ULID,
      combatantId: cultist.id as ULID, fromPosition: { x: 0, y: 0 }, toPosition: { x: 5, y: 5 }, feetTraveled: 0,
    } satisfies CombatantMovedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'CombatantMoved', encounterId: encounterId as ULID,
      combatantId: target.id as ULID, fromPosition: { x: 0, y: 0 }, toPosition: { x: 6, y: 5 }, feetTraveled: 0,
    } satisfies CombatantMovedEvent,
  ]);
  const turnUsage = (c: Campaign) =>
    c.state.encounters[encounterId]!.combatants.find((x) => x.combatantId === cultist.id)!.turnUsage;
  return { engine, campaign, encounterId, cultistId: cultist.id, targetId: target.id, turnUsage };
};

describe('npc-caster-bonus-action-groups: Cultist Fanatic Spiritual Weapon (slice 815)', () => {
  it('the Cultist Fanatic ships Spiritual Weapon as a 2/Day bonus-action group', () => {
    const sb = PACK.monsters.find((m) => m.id === 'cultist-fanatic')!;
    const grant = sb.traits.find(
      (t) => t.kind === 'GrantSpell' && (t as { spellId?: string }).spellId === 'spiritual-weapon',
    );
    expect(grant).toMatchObject({ preparation: 'perLongRest', usesPerLongRest: 2 });
    expect(PACK.spells.find((s) => s.id === 'spiritual-weapon')?.castingTime).toBe('Bonus Action');
  });

  it('meters Spiritual Weapon end-to-end: 2/Day, no slot, blocked on the third', () => {
    const cultist = buildMonster('cultist-fanatic', 'Test Cultist');
    const target = buildMonster('boar', 'Target');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(8150) });
    let campaign: Campaign = engine.createCampaign({ name: 'cultist-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: cultist } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const cast = () =>
      engine.plan.castSpell(campaign.state, {
        characterId: cultist.id,
        spellId: 'spiritual-weapon',
        slotLevel: 2,
        targetIds: [target.id],
        useFreeCast: true,
      }).events;

    const first = cast();
    expect(first.map((e) => e.type)).toContain('PerDayCastUsed');
    expect(first.map((e) => e.type)).not.toContain('SpellSlotConsumed');
    campaign = commit(campaign, first);
    campaign = commit(campaign, cast()); // 2/Day: the second is fine
    expect(campaign.state.characters[cultist.id]?.perDayCastsUsed['spiritual-weapon']).toBe(2);
    expect(cast).toThrow(/no remaining daily uses/i); // the third is blocked
  });

  it("the cast itself is a Bonus Action (pure summon, no target → only the bonus action is spent)", () => {
    const s = seedCultistEncounter(8151);
    const events = s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.cultistId, spellId: 'spiritual-weapon', slotLevel: 2,
      targetIds: [], // summon the weapon without the immediate attack
      useFreeCast: true,
    }).events;
    expect(events.map((e) => e.type)).toContain('PerDayCastUsed');
    const after = commit(s.campaign, events);
    expect(s.turnUsage(after).bonusActionUsed).toBe(true);
    expect(s.turnUsage(after).actionUsed).toBe(false);
  });

  // Slice 816 fixed the over-broad `consumesImplicitMagicAction` predicate:
  // RAW (spells.md) Spiritual Weapon's attack is made IMMEDIATELY as part of
  // the Bonus-Action cast (no separate Magic action), so casting it AT a
  // target spends only the bonus action — NOT the Action. (Produce Flame /
  // Flame Blade, whose attack IS a separate Magic action, still spend both;
  // see slice-816-spiritual-weapon-magic-action.test.ts.)
  it('attacking on cast spends ONLY the bonus action (slice 816 — not the Action)', () => {
    const s = seedCultistEncounter(8152);
    const events = s.engine.plan.castSpell(s.campaign.state, {
      characterId: s.cultistId, spellId: 'spiritual-weapon', slotLevel: 2,
      targetIds: [s.targetId], useFreeCast: true,
    }).events;
    const after = commit(s.campaign, events);
    expect(s.turnUsage(after).bonusActionUsed).toBe(true);
    expect(s.turnUsage(after).actionUsed).toBe(false);
  });
});
