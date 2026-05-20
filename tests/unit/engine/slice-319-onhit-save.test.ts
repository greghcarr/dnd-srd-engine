// Slice 319 — on-hit-save weapon riders. An `onHit` rider can carry a
// `save` block (ability + fixed DC + conditionOnFail); on a hit the
// target makes the save and, on failure, gains the condition. The save
// fires only when the rider's slice-318 `condition` gate passes, so the
// two compose. Canonical user: a Ghoul's Claw (CON DC 10 or Paralyzed,
// "if the target isn't an Undead or elf").
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent, DamageRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const WEAPON_ID = 'ghoul-claws';

const buildGhoul = (weaponId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Ghoul', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 22, max: 22, temp: 0 },
    inventory: [weaponId], equipped: { mainHand: weaponId },
  });

// A target with low AC so the claw reliably hits. `speciesId` and an
// optional creature-typed `statblockId` drive the rider gate.
const buildTarget = (opts: { speciesId?: string; statblockId?: string }): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Foe', speciesId: opts.speciesId ?? 'human', backgroundId: 'sage',
    ...(opts.statblockId !== undefined ? { kind: 'creature', statblockId: opts.statblockId } : {}),
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 200, max: 200, temp: 0 }, armorClass: 8,
  });

// Plans a claw attack on the given target and returns the resolution
// events for the first seed that lands a hit (undefined if none did).
const firstHitEvents = (target: Character): ReadonlyArray<Event> | undefined => {
  const weapon = makeItemInstance(WEAPON_ID);
  for (let seed = 1; seed < 80; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    const ghoul = buildGhoul(weapon.id);
    let campaign: Campaign = engine.createCampaign({ name: `cs-${seed}` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ghoul } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, { attackerId: ghoul.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
    if (rolled?.hit === true) return events;
  }
  return undefined;
};

const findUndeadStatblock = (): string | undefined =>
  PACK.monsters.find((m) => (m as { type?: string }).type === 'Undead')?.id;

describe('slice 319: Ghoul Claw on-hit-save rider', () => {
  it('rolls a CON DC 10 save against a non-Undead, non-elf target', () => {
    const events = firstHitEvents(buildTarget({ speciesId: 'human' }));
    expect(events, 'expected a hit').toBeDefined();
    const save = events!.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(save, 'expected an on-hit save').toBeDefined();
    expect(save!.ability).toBe('CON');
    expect(save!.dc).toBe(10);
    // The base slashing damage still lands regardless of the save.
    const damage = events!.find((e): e is DamageRolledEvent => e.type === 'DamageRolled');
    expect(damage!.rolls.some((r) => r.type === 'slashing')).toBe(true);
  });

  it('applies Paralyzed (sourced by the attacker) on a failed save', () => {
    const weapon = makeItemInstance(WEAPON_ID);
    for (let seed = 1; seed < 200; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const ghoul = buildGhoul(weapon.id);
      const target = buildTarget({ speciesId: 'human' });
      let campaign: Campaign = engine.createCampaign({ name: `fail-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ghoul } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, { attackerId: ghoul.id, targetId: target.id, weaponInstanceId: weapon.id }).events;
      const save = events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled');
      if (save?.success !== false) continue;
      const cond = events.find((e): e is ConditionAppliedEvent => e.type === 'ConditionApplied');
      expect(cond, 'failed save should apply a condition').toBeDefined();
      expect(cond!.conditionId).toBe('paralyzed');
      expect(cond!.targetId).toBe(target.id);
      expect(cond!.sourceCharacterId).toBe(ghoul.id);
      return;
    }
    throw new Error('no failed save found within the seed budget');
  });

  it('does NOT roll a save against an Undead target (rider gated off)', () => {
    const undeadId = findUndeadStatblock();
    if (undeadId === undefined) return;
    const events = firstHitEvents(buildTarget({ statblockId: undeadId }));
    expect(events, 'expected a hit').toBeDefined();
    expect(events!.some((e) => e.type === 'SaveRolled')).toBe(false);
    expect(events!.some((e) => e.type === 'ConditionApplied')).toBe(false);
    // Base slashing damage still lands.
    const damage = events!.find((e): e is DamageRolledEvent => e.type === 'DamageRolled');
    expect(damage!.rolls.some((r) => r.type === 'slashing')).toBe(true);
  });

  it('does NOT roll a save against an elf target (rider gated off)', () => {
    const events = firstHitEvents(buildTarget({ speciesId: 'elf' }));
    expect(events, 'expected a hit').toBeDefined();
    expect(events!.some((e) => e.type === 'SaveRolled')).toBe(false);
    expect(events!.some((e) => e.type === 'ConditionApplied')).toBe(false);
  });
});
