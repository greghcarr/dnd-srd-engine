// Slice 821: npc-reaction-discovery. The reaction-affordance layer
// (availableReactions / reactionsForTrigger, slices 763-767) enumerated
// reactions from class features / prepared spells only, so a monster's
// granted reaction spells — the Mage/Archmage "Protective Magic" pool
// (Counterspell/Shield, slice 819) — were undiscoverable. Now the Shield +
// Counterspell registry descriptors also recognize a granted per-day pool
// (with budget) and correlate a `useFreeCast` intent that meters via the
// pool instead of a slot. Players are unaffected (gated on `statblockId`).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { InitiativeRolledEvent } from '../../../src/schemas/events/encounter.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const PACK = loadStarterPack();

const buildMage = (opts?: { perDayUsed?: Record<string, number> }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mage',
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

const setup = (chars: Character[]) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign: Campaign = engine.createCampaign({ name: 'npc-reactions' });
  campaign = commit(
    campaign,
    chars.map((c) => ({ id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c }) satisfies CharacterCreatedEvent),
  );
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: chars.map((c) => c.id) });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, [
    {
      id: eventId(), at: isoTimestamp(), type: 'InitiativeRolled', encounterId: enc.encounterId as ULID,
      rolls: chars.map((c, i) => ({ combatantId: c.id as ULID, d20: 15 - i, modifier: 0, total: 15 - i })),
    } satisfies InitiativeRolledEvent,
  ]);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);
  return { engine, campaign, encounterId: enc.encounterId };
};

const attackRolledOn = (targetId: string, attackerId: string, total: number, targetAC: number): Event =>
  ({
    id: eventId(), at: isoTimestamp(), type: 'AttackRolled',
    attackerId: attackerId as ULID, targetId: targetId as ULID, weaponInstanceId: eventId() as ULID,
    d20: [total], used: 'none', attackBonus: 0, total, targetAC, hit: total >= targetAC,
    critical: false, attackKind: 'melee',
  }) as unknown as Event;

const spellCastBy = (casterId: string, spellId: string, slotLevel: number): Event =>
  ({
    id: eventId(), at: isoTimestamp(), type: 'SpellCastDeclared',
    characterId: casterId as ULID, spellId, slotLevel, slotSource: 'standard', targetIds: [], castAsRitual: false,
  }) as unknown as Event;

describe('npc-reaction-discovery: monster Protective Magic (slice 821)', () => {
  it('availableReactions surfaces a Mage\'s granted Counterspell + Shield', () => {
    const mage = buildMage();
    const s = setup([mage, buildEnemy()]);
    const ids = s.engine.query.availableReactions(s.campaign.state, s.encounterId, mage.id).map((r) => r.id);
    expect(ids).toContain('shield');
    expect(ids).toContain('counterspell');
    expect(
      s.engine.query.availableReactions(s.campaign.state, s.encounterId, mage.id).every((r) => r.enabled),
    ).toBe(true);
  });

  it('correlates Counterspell from an enemy leveled cast with a per-day free-cast intent (planner-accepted)', () => {
    const mage = buildMage();
    const enemy = buildEnemy();
    const s = setup([mage, enemy]);
    const reactions = s.engine.query.reactionsForTrigger(
      s.campaign.state, s.encounterId, mage.id, spellCastBy(enemy.id, 'fireball', 3),
    );
    const cs = reactions.find((r) => r.id === 'counterspell');
    expect(cs).toBeDefined();
    const intent = cs!.intent;
    if (intent.type !== 'Counterspell') throw new Error('expected Counterspell');
    expect(intent.useFreeCast).toBe(true);
    expect(intent.castingClassId).toBe(''); // flat statblock DC via the profile
    expect(intent.targetCasterId).toBe(enemy.id);
    // Planner-faithful: meters via the pool (PerDayCastUsed), not a Mage slot.
    const events = s.engine.plan.counterspell(s.campaign.state, intent).events;
    expect(events.map((e) => e.type)).toContain('PerDayCastUsed');
    expect(events.filter((e) => e.type === 'SpellSlotConsumed' && e.characterId === mage.id)).toEqual([]);
  });

  it('correlates Shield from a hit the +5 would flip with a per-day free-cast intent (planner-accepted)', () => {
    const mage = buildMage();
    const enemy = buildEnemy();
    const s = setup([mage, enemy]);
    // total 16 vs AC 15: a hit, and 16 < 15 + 5, so +5 flips it.
    const reactions = s.engine.query.reactionsForTrigger(
      s.campaign.state, s.encounterId, mage.id, attackRolledOn(mage.id, enemy.id, 16, 15),
    );
    const sh = reactions.find((r) => r.id === 'shield');
    expect(sh).toBeDefined();
    const intent = sh!.intent;
    if (intent.type !== 'Shield') throw new Error('expected Shield');
    expect(intent.useFreeCast).toBe(true);
    const events = s.engine.plan.shield(s.campaign.state, intent).events;
    expect(events.map((e) => e.type)).toContain('PerDayCastUsed');
    expect(events.filter((e) => e.type === 'SpellSlotConsumed' && e.characterId === mage.id)).toEqual([]);
  });

  it('an exhausted Protective Magic pool hides both reactions', () => {
    const mage = buildMage({ perDayUsed: { counterspell: 3 } }); // pool spent (3/3)
    const enemy = buildEnemy();
    const s = setup([mage, enemy]);
    const ids = s.engine.query.availableReactions(s.campaign.state, s.encounterId, mage.id).map((r) => r.id);
    expect(ids).not.toContain('shield');
    expect(ids).not.toContain('counterspell');
    expect(
      s.engine.query.reactionsForTrigger(s.campaign.state, s.encounterId, mage.id, spellCastBy(enemy.id, 'fireball', 3))
        .find((r) => r.id === 'counterspell'),
    ).toBeUndefined();
  });

  it('a plain fighter (no grant, no prepared) is offered neither', () => {
    const fighter = buildEnemy();
    const s = setup([fighter, buildMage()]);
    const ids = s.engine.query.availableReactions(s.campaign.state, s.encounterId, fighter.id).map((r) => r.id);
    expect(ids).not.toContain('shield');
    expect(ids).not.toContain('counterspell');
  });
});
