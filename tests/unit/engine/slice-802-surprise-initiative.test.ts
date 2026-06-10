// Slice 802: Surprise = Disadvantage on the Initiative roll (Area 4
// divergence `surprise-not-in-initiative`). RAW 2024 (rules-glossary.md
// "Surprise"): "If a creature is caught unawares by the start of combat,
// that creature is surprised, which causes it to have Disadvantage on its
// Initiative roll." `RollInitiativeIntent` had no surprise channel. The
// engine has no awareness model, so the consumer designates the surprised
// combatants via `surprisedCombatantIds`; the planner OR-s it into the
// effect-stack disadvantage (advantage + surprise cancel as usual).
//
// The InitiativeRolled event exposes only the chosen d20, not both dice,
// so disadvantage is proven structurally: for a fixed seed, the FIRST
// combatant consumes the first die(s). Surprised it takes min(d1, d2);
// not surprised it takes d1. So surprised.d20 <= notSurprised.d20 always,
// and strictly < whenever d2 < d1 — which proves two dice were rolled and
// the lower kept.

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

const PACK = loadStarterPack();

const buildPC = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
  });

// Roll initiative for [A, B] at the given seed; A is optionally surprised.
// Returns A's chosen d20 (A is the first combatant, so it rolls first).
const rollFirstD20 = (seed: number, surpriseA: boolean): number => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const a = buildPC('A');
  const b = buildPC('B');
  let campaign: Campaign = engine.createCampaign({ name: 'surprise' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: a } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: b } satisfies CharacterCreatedEvent,
  ]);
  const enc = engine.plan.createEncounter(campaign.state, { combatantIds: [a.id, b.id] });
  campaign = commit(campaign, enc.events);
  const init = engine.plan.rollInitiative(campaign.state, {
    encounterId: enc.encounterId,
    ...(surpriseA ? { surprisedCombatantIds: [a.id] } : {}),
  });
  const rolled = init.events.find((e): e is InitiativeRolledEvent => e.type === 'InitiativeRolled')!;
  return rolled.rolls.find((r) => r.combatantId === a.id)!.d20;
};

describe('Surprise → Disadvantage on Initiative (slice 802)', () => {
  it('a surprised combatant never rolls higher than the same un-surprised roll, and sometimes lower', () => {
    let foundStrictlyLower = false;
    for (let seed = 1; seed < 120; seed += 1) {
      const surprised = rollFirstD20(seed, true);
      const normal = rollFirstD20(seed, false);
      // min(d1, d2) <= d1 always.
      expect(surprised, `seed ${seed}: surprised d20 should be <= un-surprised`).toBeLessThanOrEqual(normal);
      if (surprised < normal) foundStrictlyLower = true;
    }
    // A strictly-lower seed proves two dice were rolled and the lower
    // kept — i.e. Disadvantage actually applied.
    expect(foundStrictlyLower, 'no seed showed the disadvantage lowering the roll').toBe(true);
  });

  it('omitting surprisedCombatantIds is unchanged (a single-die roll, never below a strict min)', () => {
    // Without surprise the d20 is the raw first die (1..20); across seeds
    // it must hit values a min-of-two could not as often (e.g. high rolls).
    const normals = Array.from({ length: 40 }, (_, i) => rollFirstD20(i + 1, false));
    expect(Math.max(...normals)).toBeGreaterThanOrEqual(18); // a single die reaches the top end
  });
});
