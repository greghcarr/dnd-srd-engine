// Slice 809: the L4 feat menu filters feats by their (machine-checkable)
// ability prerequisite (Area 5 divergence `l4-feat-menu-eligibility`,
// arm 1). RAW: the improvement offers "an Ability Score Improvement or a
// feat for which you qualify." Grappler requires Strength or Dexterity
// 13+; a character that meets neither no longer sees it offered. A new
// `Feat.abilityPrerequisite` ({ abilities, min }) carries the
// machine-checkable form (the free-text `prerequisites` is display-only).
//
// Arm 2 (injecting Fighting-Style feats for classes with the Fighting
// Style feature) is tracked separately — it needs feature-detection +
// de-dup machinery the content doesn't yet model.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();

const buildL3Fighter = (str: number, dex: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Aspirant', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: str, DEX: dex, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
  });

// Level a L3 Fighter to 4 and return the L4 feat-menu option ids.
const l4FeatOptions = (str: number, dex: number): string[] => {
  const pc = buildL3Fighter(str, dex);
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(809) });
  let campaign: Campaign = engine.createCampaign({ name: 'l4-menu' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
  ]);
  const lu = engine.plan.levelUp(campaign.state, { characterId: pc.id, classId: 'fighter', hpStrategy: 'average' });
  const featChoice = lu.events.find(
    (e): e is ChoiceRequiredEvent =>
      (e as { type?: string }).type === 'ChoiceRequired' &&
      (e as { promptKey?: string }).promptKey === 'ability-score-improvement-4',
  )!;
  return featChoice.options.map((o) => o.id);
};

describe('L4 feat-menu eligibility (slice 809)', () => {
  it('pack: Grappler carries the machine-checkable ability prerequisite (STR/DEX 13)', () => {
    const grappler = PACK.feats.find((f) => f.id === 'grappler')!;
    expect(grappler.abilityPrerequisite).toEqual({ abilities: ['STR', 'DEX'], min: 13 });
  });

  it('a STR 16 Fighter is still offered Grappler', () => {
    const opts = l4FeatOptions(16, 12);
    expect(opts).toContain('ability-score-improvement');
    expect(opts).toContain('grappler');
  });

  it('a STR 10 / DEX 10 Fighter is NOT offered Grappler (prereq unmet) — ASI remains', () => {
    const opts = l4FeatOptions(10, 10);
    expect(opts).toContain('ability-score-improvement');
    expect(opts).not.toContain('grappler');
  });

  it('the prereq is "or": DEX 14 (STR 8) still qualifies for Grappler', () => {
    const opts = l4FeatOptions(8, 14);
    expect(opts).toContain('grappler');
  });
});
