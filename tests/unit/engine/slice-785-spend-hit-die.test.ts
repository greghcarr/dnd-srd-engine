// Slice 785: planSpendHitDie — the short rest's defining heal.
//
// RAW (SRD 5.2.1 rules-glossary.md, "Short Rest"): "You can spend one or
// more of your Hit Point Dice to regain Hit Points. For each Hit Point Die
// you spend in this way, roll the die and add your Constitution modifier to
// it. You regain Hit Points equal to the total (minimum of 1 Hit Point)."
//
// The `HitDieSpentEvent` + `applyHitDieSpent` reducer already existed; this
// slice adds the planner (RNG capture + the CON-mod / minimum-1 math) so a
// consumer can finally heal on a short rest through the engine. Closes the
// `no-hit-die-spend-planner` L7-audit blocker (Area 8).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { HitDieSpentEvent } from '../../../src/schemas/events/resources.js';

const PACK = loadStarterPack();

const build = (
  classes: Character['classes'],
  con: number,
  hp: { current: number; max: number },
  speciesId = 'human',
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Alyx',
    speciesId,
    backgroundId: 'soldier',
    classes,
    abilityScores: { STR: 14, DEX: 12, CON: con, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: hp.current, max: hp.max, temp: 0 },
  });

const seed = (c: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'hit-dice' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('planSpendHitDie (slice 785)', () => {
  it('emits one HitDieSpent event with the class die, captured roll, CON mod, and computed heal', () => {
    const fighter = build([{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }], 14, { current: 5, max: 28 });
    const { engine, campaign } = seed(fighter);
    const events = engine.plan.spendHitDie(campaign.state, { characterId: fighter.id }).events;

    expect(events.length).toBe(1);
    const e = events[0] as HitDieSpentEvent;
    expect(e.type).toBe('HitDieSpent');
    expect(e.die).toBe(10); // Fighter is a d10 class
    expect(e.rolled).toBeGreaterThanOrEqual(1);
    expect(e.rolled).toBeLessThanOrEqual(10);
    expect(e.conMod).toBe(2); // CON 14 → +2
    expect(e.healed).toBe(Math.max(1, e.rolled + e.conMod));
  });

  it('rolls the class hit die size (Wizard d6, Barbarian d12)', () => {
    const wizard = build([{ classId: 'wizard', level: 2, hitDiceRemaining: 2 }], 12, { current: 4, max: 12 });
    const wEvents = seedAndSpend(wizard);
    expect((wEvents[0] as HitDieSpentEvent).die).toBe(6);

    const barb = build([{ classId: 'barbarian', level: 2, hitDiceRemaining: 2 }], 14, { current: 6, max: 26 });
    const bEvents = seedAndSpend(barb);
    expect((bEvents[0] as HitDieSpentEvent).die).toBe(12);
  });

  it('clamps the heal to a minimum of 1 even with a negative CON modifier', () => {
    // CON 8 → -1. Whatever the d-roll, healed is never below 1.
    const fighter = build([{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }], 8, { current: 10, max: 44 });
    const { engine, campaign } = seed(fighter);
    const e = engine.plan.spendHitDie(campaign.state, { characterId: fighter.id }).events[0] as HitDieSpentEvent;
    expect(e.conMod).toBe(-1);
    expect(e.healed).toBe(Math.max(1, e.rolled + e.conMod));
    expect(e.healed).toBeGreaterThanOrEqual(1);
  });

  it('on commit: HP rises by the healed amount (capped at max) and one Hit Die is spent', () => {
    const fighter = build([{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }], 14, { current: 5, max: 28 });
    const { engine, campaign: c0 } = seed(fighter);
    const events = engine.plan.spendHitDie(c0.state, { characterId: fighter.id }).events;
    const healed = (events[0] as HitDieSpentEvent).healed;
    const campaign = commit(c0, events);
    const after = campaign.state.characters[fighter.id]!;
    expect(after.hp.current).toBe(Math.min(5 + healed, 28));
    const fighterEnrollment = after.classes.find((c) => c.classId === 'fighter')!;
    expect(fighterEnrollment.hitDiceRemaining).toBe(2);
  });

  it('heal never overshoots max HP', () => {
    const fighter = build([{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }], 18, { current: 43, max: 44 });
    const { engine, campaign: c0 } = seed(fighter);
    const campaign = commit(c0, engine.plan.spendHitDie(c0.state, { characterId: fighter.id }).events);
    expect(campaign.state.characters[fighter.id]!.hp.current).toBe(44);
  });

  it('spends the first class enrollment with Hit Dice remaining (multiclass, class-array order)', () => {
    // Fighter d10 listed first but out of dice → falls through to Wizard d6.
    const gish = build(
      [
        { classId: 'fighter', level: 2, hitDiceRemaining: 0 },
        { classId: 'wizard', level: 1, hitDiceRemaining: 1 },
      ],
      14,
      { current: 8, max: 22 },
    );
    const events = seedAndSpend(gish);
    expect((events[0] as HitDieSpentEvent).die).toBe(6); // Wizard's die, not the Fighter's

    // Both have dice → first in array order (Fighter d10) is spent.
    const gish2 = build(
      [
        { classId: 'fighter', level: 2, hitDiceRemaining: 2 },
        { classId: 'wizard', level: 1, hitDiceRemaining: 1 },
      ],
      14,
      { current: 8, max: 22 },
    );
    const events2 = seedAndSpend(gish2);
    expect((events2[0] as HitDieSpentEvent).die).toBe(10);
  });

  it('throws when no Hit Dice remain', () => {
    const fighter = build([{ classId: 'fighter', level: 2, hitDiceRemaining: 0 }], 14, { current: 5, max: 20 });
    const { engine, campaign } = seed(fighter);
    expect(() => engine.plan.spendHitDie(campaign.state, { characterId: fighter.id })).toThrow(
      /no Hit Dice remaining/,
    );
  });

  it('throws when the character is at 0 HP (dying creatures cannot spend Hit Dice)', () => {
    const fighter = build([{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }], 14, { current: 0, max: 28 });
    const { engine, campaign } = seed(fighter);
    expect(() => engine.plan.spendHitDie(campaign.state, { characterId: fighter.id })).toThrow(
      /0 HP and cannot spend Hit Dice/,
    );
  });
});

function seedAndSpend(c: Character) {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'hit-dice' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: c } satisfies CharacterCreatedEvent,
  ]);
  return engine.plan.spendHitDie(campaign.state, { characterId: c.id }).events;
}
