// Slice 738: Rogue L7 Reliable Talent.
//
// SRD 5.2.1: "Whenever you make an ability check that uses one of your
// skill or tool proficiencies, you can treat a d20 roll of 9 or lower as
// a 10." Wired via the `GrantReliableTalent` marker; planAbilityCheck
// floors the chosen d20 to 10 when the check used a real proficiency
// (proficient / expertise — NOT the half-proficiency floor).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AbilityCheckRolledEvent } from '../../../src/schemas/events/checks.js';
import type { AbilityScore } from '../../../src/schemas/primitives.js';
import type { Skill } from '../../../src/schemas/primitives.js';

const PACK = loadStarterPack();

// Soldier background grants Athletics (STR) proficiency.
const buildRogue = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Sly',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'rogue', level, hitDiceRemaining: level }],
    abilityScores: { STR: 14, DEX: 16, CON: 12, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

// Run the check across seeds until the raw d20 satisfies `want` (low ≤9 or
// high ≥10), returning that event. `effectiveD20` = total − bonus is the
// die value actually used (10 when Reliable Talent floors it).
const checkWithRawD20 = (
  rogue: Character,
  ability: AbilityScore,
  skill: Skill | undefined,
  want: 'low' | 'high',
): AbilityCheckRolledEvent => {
  for (let seed = 1; seed < 300; seed += 1) {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
    let camp: Campaign = engine.createCampaign({ name: 'reliable-talent' });
    camp = commit(camp, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: rogue } satisfies CharacterCreatedEvent,
    ]);
    const ev = engine.plan.abilityCheck(camp.state, {
      characterId: rogue.id,
      ability,
      ...(skill !== undefined ? { skill } : {}),
    }).events.find((e): e is AbilityCheckRolledEvent => e.type === 'AbilityCheckRolled')!;
    if (ev.d20.length !== 1) continue; // no advantage/disadvantage on these checks
    const raw = ev.d20[0]!;
    if (want === 'low' && raw <= 9) return ev;
    if (want === 'high' && raw >= 10) return ev;
  }
  throw new Error(`no ${want} raw d20 found in 300 seeds`);
};

const effectiveD20 = (ev: AbilityCheckRolledEvent): number => ev.total - ev.bonus;
const hasReliableTalentMark = (ev: AbilityCheckRolledEvent): boolean =>
  (ev.breakdown ?? []).some((b) => b.source === 'reliable-talent');

describe('slice 738: Reliable Talent (Rogue L7)', () => {
  it('a L7 rogue treats a d20 of 9 or lower as 10 on a proficient (Athletics) check', () => {
    const ev = checkWithRawD20(buildRogue(7), 'STR', 'athletics', 'low');
    expect(ev.d20[0]!).toBeLessThan(10); // the die actually rolled low
    expect(effectiveD20(ev)).toBe(10); // ...but it's treated as a 10
    expect(hasReliableTalentMark(ev)).toBe(true);
  });

  it('does not floor a non-proficient check (raw STR check, no skill)', () => {
    const ev = checkWithRawD20(buildRogue(7), 'STR', undefined, 'low');
    expect(effectiveD20(ev)).toBe(ev.d20[0]!); // low die stands
    expect(hasReliableTalentMark(ev)).toBe(false);
  });

  it('does not change a high roll on a proficient check (10+ stays as rolled)', () => {
    const ev = checkWithRawD20(buildRogue(7), 'STR', 'athletics', 'high');
    expect(effectiveD20(ev)).toBe(ev.d20[0]!);
    expect(hasReliableTalentMark(ev)).toBe(false);
  });

  it('a L6 rogue has no Reliable Talent yet (low proficient roll stands)', () => {
    const ev = checkWithRawD20(buildRogue(6), 'STR', 'athletics', 'low');
    expect(effectiveD20(ev)).toBe(ev.d20[0]!);
    expect(hasReliableTalentMark(ev)).toBe(false);
  });
});
