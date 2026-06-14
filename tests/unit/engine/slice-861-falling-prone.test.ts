// Slice 861 — `falling-no-prone`.
//
// RAW (SRD 5.2.1, Falling hazard): "A creature that falls takes 1d6
// Bludgeoning damage ... for every 10 feet it fell, to a maximum of 20d6.
// When the creature lands, it has the Prone condition unless it avoids taking
// any damage from the fall."
//
// `planFalling` applied the damage but never the Prone-on-landing condition.
// It now appends a `prone` ConditionApplied when (and only when) the fall
// dealt damage — so a fall avoided entirely (Feather Fall, or Slow Fall
// reducing the damage to 0, or full Bludgeoning Immunity) leaves the creature
// standing, while any fall that hurts knocks it Prone.
//
// (The averaged-vs-rolled damage value is the separate `falling-averaged-not-
// rolled` quirk and is unchanged here.)

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { Event } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();

const buildFighter = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Faller',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
  });

const buildMonk = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: `Monk L${level}`,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'monk', level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 16, CON: 14, INT: 10, WIS: 14, CHA: 10 },
    hp: { current: 100, max: 100, temp: 0 },
  });

const campaignWith = (character: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(0) });
  let campaign: Campaign = engine.createCampaign({ name: 'fall' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

const prone = (events: ReadonlyArray<Event>) =>
  events.find((e) => e.type === 'ConditionApplied' && (e as { conditionId?: string }).conditionId === 'prone');

describe('slice 861: a creature that takes falling damage lands Prone', () => {
  it('a 30-ft fall that deals damage applies the Prone condition to the faller', () => {
    const fighter = buildFighter();
    const { engine, campaign } = campaignWith(fighter);
    const events = engine.plan.falling(campaign.state, {
      characterId: fighter.id,
      distanceFeet: 30,
    }).events;
    expect(events.some((e) => e.type === 'DamageApplied')).toBe(true);
    const proneEvent = prone(events);
    expect(proneEvent).toBeDefined();
    expect((proneEvent as { targetId: string }).targetId).toBe(fighter.id);
    // Prone lands after the damage is applied.
    const dmgIdx = events.findIndex((e) => e.type === 'DamageApplied');
    const proneIdx = events.findIndex((e) => e === proneEvent);
    expect(proneIdx).toBeGreaterThan(dmgIdx);
  });

  it('a fall fully avoided (Slow Fall reduces the damage to 0) does NOT apply Prone', () => {
    const monk = buildMonk(4); // 30 ft → avg 11, Slow Fall reduction 5×4=20 → 0 damage
    const { engine, campaign } = campaignWith(monk);
    const events = engine.plan.falling(campaign.state, {
      characterId: monk.id,
      distanceFeet: 30,
      useSlowFall: true,
    }).events;
    expect(events).toEqual([]); // no damage, no Prone
    expect(prone(events)).toBeUndefined();
  });
});
