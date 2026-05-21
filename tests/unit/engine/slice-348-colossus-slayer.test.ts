// Slice 348 - Hunter's Prey: Colossus Slayer (Ranger Hunter L3).
//
// RAW 2024: "When you hit a creature with a weapon, the weapon deals an
// extra 1d8 damage to the target if it's missing any of its Hit Points.
// You can deal this extra damage only once per turn." Wired as an
// OfferChoice (Colossus Slayer / Horde Breaker); the Colossus Slayer
// option is an OnEvent AttackRolled rider gated on the new
// `event.targetMissingHp` fact, `oncePer: turn`, mirroring Sneak Attack.
// Horde Breaker stays a deferred stub (needs an extra-attack-vs-
// different-target primitive). The 1d8 damage type is a fixed
// approximation of "the weapon's type" (same convention as Sneak Attack).
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import type { Effect } from '../../../src/schemas/effects.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const huntersPreyOffer = (() => {
  const hunter = PACK.subclasses.find((s) => s.id === 'hunter')!;
  const feature = hunter.levelGrants['3']!.find((f) => f.id === 'hunters-prey')!;
  return feature.effects.find(
    (e): e is Extract<Effect, { kind: 'OfferChoice' }> => e.kind === 'OfferChoice',
  )!;
})();

const buildRanger = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pathfinder',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'ranger', level: 3, hitDiceRemaining: 3, subclassId: 'hunter' }],
    abilityScores: { STR: 12, DEX: 18, CON: 14, INT: 10, WIS: 14, CHA: 8 },
    hp: { current: 28, max: 28, temp: 0 },
  });

const buildTarget = (hpCurrent: number, hpMax: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Quarry',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: hpCurrent, max: hpMax, temp: 0 },
    armorClass: 5,
  });

interface HitResult {
  events: ReadonlyArray<import('../../../src/schemas/events/index.js').Event>;
}

// Builds a fresh ranger-vs-target campaign with Colossus Slayer chosen,
// drives one attack, and returns the events on a hit (else undefined).
const attackOnHit = (seed: number, target: Character): HitResult | undefined => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const ranger = buildRanger();
  const bow = makeItemInstance('rapier');
  const choiceId = newChoiceId();
  let campaign: Campaign = engine.createCampaign({ name: `colossus-${seed}` });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId, characterId: ranger.id,
      promptKey: 'hunters-prey', prompt: huntersPreyOffer.prompt, options: huntersPreyOffer.options, oneOf: 1,
    } satisfies ChoiceRequiredEvent,
    {
      id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId, characterId: ranger.id,
      selectedOptionIds: ['colossus-slayer'],
    } satisfies ChoiceResolvedEvent,
  ]);
  const events = engine.plan.attack(campaign.state, {
    attackerId: ranger.id, targetId: target.id, weaponInstanceId: bow.id,
  }).events;
  const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
  return rolled?.hit === true ? { events } : undefined;
};

const colossusFired = (events: ReadonlyArray<Event>): boolean =>
  events.some((e) => e.type === 'TriggerFired' && e.triggerId.endsWith('colossus-slayer'));

describe('slice 348: Hunter Colossus Slayer', () => {
  it("Hunter's Prey offers Colossus Slayer (wired) and Horde Breaker (stub)", () => {
    expect(huntersPreyOffer.oneOf).toBe(1);
    expect(huntersPreyOffer.options.map((o) => o.id)).toEqual(['colossus-slayer', 'horde-breaker']);
    const colossus = huntersPreyOffer.options.find((o) => o.id === 'colossus-slayer')!;
    const rider = colossus.effects.find((e): e is Extract<Effect, { kind: 'OnEvent' }> => e.kind === 'OnEvent')!;
    expect(rider.oncePer).toBe('turn');
    expect(rider.actions).toEqual([{ kind: 'AddDamage', dice: '1d8', damageType: 'piercing' }]);
    expect(huntersPreyOffer.options.find((o) => o.id === 'horde-breaker')!.effects).toEqual([]);
  });

  it('fires against a target already missing Hit Points', () => {
    let fired = false;
    for (let seed = 1; seed < 60 && !fired; seed += 1) {
      const out = attackOnHit(seed, buildTarget(18, 30));
      if (out === undefined) continue;
      expect(colossusFired(out.events)).toBe(true);
      fired = true;
    }
    expect(fired, 'expected at least one hit to exercise the rider').toBe(true);
  });

  it('does NOT fire against a full-HP target', () => {
    let testedAHit = false;
    for (let seed = 1; seed < 60 && !testedAHit; seed += 1) {
      const out = attackOnHit(seed, buildTarget(30, 30));
      if (out === undefined) continue;
      expect(colossusFired(out.events)).toBe(false);
      testedAHit = true;
    }
    expect(testedAHit, 'expected at least one hit on the full-HP target').toBe(true);
  });
});
