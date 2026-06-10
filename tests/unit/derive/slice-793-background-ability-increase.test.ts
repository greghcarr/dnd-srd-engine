// Slice 793: the 2024 background ability-score increase is engine-applied.
// When a character carries a `backgroundAbilityIncrease` allocation, the
// engine adds it on top of the base `abilityScores` (composed through the
// effectiveAbilityScoreIncrease accumulator, capped at 20), so every
// derivation reflects it — closing the `background-ability-bonus` blocker.
// Opt-in: a character without the allocation is byte-unchanged.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newEventId } from '../../../src/ids.js';
import { isoTimestamp } from '../../fixtures/index.js';
import { validateBackgroundAbilityIncrease } from '../../../src/derive/background-asi.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// A Sage (background ASI options CON/INT/WIS, +2/+1) with base INT 15.
const buildSage = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Merik',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 15, WIS: 13, CHA: 10 },
    hp: { current: 8, max: 8, temp: 0 },
    ...overrides,
  });

const derive = (character: Character) => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'bg-asi' });
  campaign = commit(campaign, [
    { id: newEventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: character } satisfies CharacterCreatedEvent,
  ]);
  return engine.derive.character(campaign.state, character.id);
};

describe('background ability-score increase — application (slice 793)', () => {
  it('applies the +2/+1 to the derived scores (Sage INT 15 → 17, WIS 13 → 14)', () => {
    const sage = buildSage({ backgroundAbilityIncrease: { INT: 2, WIS: 1 } });
    const d = derive(sage);
    expect(d.abilityScores.INT).toBe(17);
    expect(d.abilityScores.WIS).toBe(14);
    expect(d.abilityScores.CON).toBe(14); // untouched
  });

  it('is opt-in: a character without the allocation is unchanged (base scores)', () => {
    const sage = buildSage();
    const d = derive(sage);
    expect(d.abilityScores.INT).toBe(15);
    expect(d.abilityScores.WIS).toBe(13);
  });

  it('caps the increased score at 20 (the 2024 chargen ceiling)', () => {
    const sage = buildSage({
      abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 19, WIS: 13, CHA: 10 },
      backgroundAbilityIncrease: { INT: 2, WIS: 1 },
    });
    expect(derive(sage).abilityScores.INT).toBe(20); // 19 + 2 → 20, not 21
  });
});

describe('validateBackgroundAbilityIncrease (slice 793)', () => {
  it('accepts a legal +2/+1 allocation within the background options', () => {
    const sage = buildSage({ backgroundAbilityIncrease: { INT: 2, WIS: 1 } });
    expect(validateBackgroundAbilityIncrease(sage, CONTENT)).toEqual([]);
  });
  it('accepts an absent allocation', () => {
    expect(validateBackgroundAbilityIncrease(buildSage(), CONTENT)).toEqual([]);
  });
  it('rejects an ability the background cannot increase (STR not in Sage CON/INT/WIS)', () => {
    const bad = buildSage({ backgroundAbilityIncrease: { STR: 2, INT: 1 } });
    expect(validateBackgroundAbilityIncrease(bad, CONTENT).join(' ')).toMatch(/STR is not an ability/);
  });
  it('rejects the wrong pattern (+2/+2 instead of +2/+1)', () => {
    const bad = buildSage({ backgroundAbilityIncrease: { INT: 2, WIS: 2 } });
    expect(validateBackgroundAbilityIncrease(bad, CONTENT).join(' ')).toMatch(/\+2\/\+1 pattern/);
  });
  it('rejects a +1/+1/+1 shape for a +2/+1 background', () => {
    const bad = buildSage({ backgroundAbilityIncrease: { CON: 1, INT: 1, WIS: 1 } });
    expect(validateBackgroundAbilityIncrease(bad, CONTENT).join(' ')).toMatch(/\+2\/\+1 pattern/);
  });
});
