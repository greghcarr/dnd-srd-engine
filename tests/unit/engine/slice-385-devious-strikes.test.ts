// Slice 385 - Rogue Devious Strikes (L14): two more Cunning Strike options.
//
//   - Obscure  (Cost 3d6): DEX save vs the rogue's DC or Blinded until the
//                          end of its next turn.
//   - Knock Out (Cost 6d6): CON save vs the rogue's DC or Unconscious (1
//                           minute).
// Daze (Cost 2d6) is deferred (needs a partial-action-economy primitive).
// Reuses the slice-384 dice-trade machinery; these are option-table +
// level-gate additions.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { TriggerFiredEvent } from '../../../src/schemas/events/triggers.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildRogue = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Vex', speciesId: 'human', backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level, hitDiceRemaining: level, subclassId: 'thief' }],
    abilityScores: { STR: 10, DEX: 18, CON: 12, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 10 * level, max: 10 * level, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Mark', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 4, CON: 4, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 400, max: 400, temp: 0 }, armorClass: 5,
  });

const seedRogue = (rogue: Character, target: Character, seed: number) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const dagger = makeItemInstance('dagger');
  let campaign: Campaign = engine.createCampaign({ name: 'devious' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: dagger },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: rogue } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, daggerId: dagger.id };
};

const sneakDamage = (events: ReadonlyArray<Event>): number => {
  const triggerIds = new Set(events.filter((e): e is TriggerFiredEvent => e.type === 'TriggerFired').map((e) => e.id));
  const sneak = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied' && triggerIds.has(e.causedByEventId ?? ''));
  return sneak?.components.reduce((s, c) => s + c.amount, 0) ?? 0;
};

// Finds a seed where the attack hits and (when `untilSaveFails`) at least
// one Cunning Strike save fails, so the condition lands deterministically.
const attackUntilHit = (
  rogue: Character, target: Character, cunningStrike: ReadonlyArray<'obscure' | 'knockout'>,
  untilSaveFails = false,
): ReadonlyArray<Event> => {
  for (let seed = 1; seed < 200; seed += 1) {
    const { engine, campaign, daggerId } = seedRogue(rogue, target, seed);
    const events = engine.plan.attack(campaign.state, {
      attackerId: rogue.id, targetId: target.id, weaponInstanceId: daggerId, advantage: 'advantage', cunningStrike,
    }).events as ReadonlyArray<Event>;
    const hit = (events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true;
    if (!hit) continue;
    if (!untilSaveFails) return events;
    if (events.some((e) => e.type === 'SaveRolled' && (e as SaveRolledEvent).success === false)) return events;
  }
  throw new Error('no qualifying seed');
};

describe('slice 385: Devious Strikes effects', () => {
  it('Obscure: a DEX save fires; on a failure the target is Blinded', () => {
    const events = attackUntilHit(buildRogue(14), buildTarget(), ['obscure'], true);
    expect((events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled'))?.ability).toBe('DEX');
    expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'blinded')).toBe(true);
  });

  it('Knock Out: a CON save fires; on a failure the target is Unconscious', () => {
    const events = attackUntilHit(buildRogue(14), buildTarget(), ['knockout'], true);
    expect((events.find((e): e is SaveRolledEvent => e.type === 'SaveRolled'))?.ability).toBe('CON');
    expect(events.some((e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'unconscious')).toBe(true);
  });

  it('Knock Out forgoes 6d6: an L14 rogue (7d6 Sneak Attack) deals at most 1d6 (6) on a non-crit', () => {
    const rogue = buildRogue(14);
    const target = buildTarget();
    let maxNonCrit = 0;
    for (let seed = 1; seed < 90; seed += 1) {
      const { engine, campaign, daggerId } = seedRogue(rogue, target, seed);
      const events = engine.plan.attack(campaign.state, {
        attackerId: rogue.id, targetId: target.id, weaponInstanceId: daggerId, advantage: 'advantage', cunningStrike: ['knockout'],
      }).events as ReadonlyArray<Event>;
      const ar = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      if (ar?.hit === true && ar.critical !== true) maxNonCrit = Math.max(maxNonCrit, sneakDamage(events));
    }
    expect(maxNonCrit).toBeLessThanOrEqual(6); // 7d6 - 6 forgone = 1d6
  });
});

describe('slice 385: Devious Strikes level gate', () => {
  it('an L11 rogue cannot use a Devious Strikes option (requires L14)', () => {
    const rogue = buildRogue(11);
    const target = buildTarget();
    const { engine, campaign, daggerId } = seedRogue(rogue, target, 1);
    expect(() => engine.plan.attack(campaign.state, {
      attackerId: rogue.id, targetId: target.id, weaponInstanceId: daggerId, advantage: 'advantage', cunningStrike: ['obscure'],
    })).toThrow(/Devious Strikes/);
  });

  it('an L14 rogue with Improved Cunning Strike can pair two Devious options if dice allow', () => {
    // 7d6 Sneak Attack; Obscure (3) + Obscure (3) = 6 forgone, leaving 1d6.
    const events = attackUntilHit(buildRogue(14), buildTarget(), ['obscure', 'obscure']);
    const saves = events.filter((e): e is SaveRolledEvent => e.type === 'SaveRolled');
    expect(saves.length).toBe(2);
    expect(saves.every((s) => s.ability === 'DEX')).toBe(true);
  });
});
