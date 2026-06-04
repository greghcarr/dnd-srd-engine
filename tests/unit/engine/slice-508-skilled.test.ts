// Slice 508: Skilled origin feat (L1).
//
// RAW (SRD 5.2.1 Skilled, Origin Feat, Repeatable): "You gain proficiency
// in any combination of three skills or tools of your choice."
//
// Engine wiring: the `skilled` feat ships an `OfferChoice` with
// `oneOf: 3` over a 55-option pool (18 skills + 37 tools). Each option's
// effects is a single `GrantProficiency target: 'skill'|'tool'` grant.
// At resolution time the chosen 3 options' effects fold into the effect
// stack via the standard PendingChoice flow (mirror of slice-506
// Divine Order's two-option-pool).
//
// This test seeds the ChoiceRequired + ChoiceResolved pair with a mixed
// pick (one skill + one tool + one of each, exercising both target
// families) and asserts the proficiencies project. Mirror of the
// slice-215 / slice-506 OfferChoice-resolution template.

import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHumanFighterWithSkilled = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Trip',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    // Tag the Skilled feat on the character (the feat's own OfferChoice
    // installs the PendingChoice; we seed both events directly below).
    featsTaken: ['skilled'],
  });

// Seed the OfferChoice from the Skilled feat's content directly so the
// test is robust to the pack's option list growing (we don't replicate
// all 55 options — just the three the player picks).
const seedSkilledChoice = (
  characterId: string,
  picks: ReadonlyArray<{ id: string; target: 'skill' | 'tool' }>,
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId,
      characterId,
      promptKey: 'skilled',
      prompt: 'Pick three skills or tools.',
      options: picks.map(({ id, target }) => ({
        id,
        label: id,
        effects: [{ kind: 'GrantProficiency', target, id, level: 'proficient' }],
      })),
      oneOf: 3,
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceResolved',
      choiceId,
      characterId,
      selectedOptionIds: picks.map((p) => p.id),
    },
  ];
};

describe('Skilled origin feat (slice 508)', () => {
  it('ships an OfferChoice with oneOf:3 over 55 options (18 skills + 37 tools)', () => {
    const f = PACK.feats.find((x) => x.id === 'skilled');
    expect(f).toBeDefined();
    expect(f!.effects).toHaveLength(1);
    const oc = f!.effects[0] as { kind: string; oneOf: number; options: ReadonlyArray<{ id: string; effects: ReadonlyArray<{ kind: string; target: string }> }> };
    expect(oc.kind).toBe('OfferChoice');
    expect(oc.oneOf).toBe(3);
    expect(oc.options).toHaveLength(55);
    const skillCount = oc.options.filter((o) => o.effects[0]!.target === 'skill').length;
    const toolCount = oc.options.filter((o) => o.effects[0]!.target === 'tool').length;
    expect(skillCount).toBe(18);
    expect(toolCount).toBe(37);
  });

  it('resolving the OfferChoice with three picks (mix of skills + tools) projects all three proficiencies', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(508) });
    const pc = buildHumanFighterWithSkilled();
    let campaign: Campaign = engine.createCampaign({ name: 'skilled-mix' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
      ...seedSkilledChoice(pc.id, [
        { id: 'stealth', target: 'skill' },
        { id: 'thieves-tools', target: 'tool' },
        { id: 'forgery-kit', target: 'tool' },
      ]),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[pc.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.proficiencyLevel('skill', 'stealth')).toBe('proficient');
    expect(acc.proficiencyLevel('tool', 'thieves-tools')).toBe('proficient');
    expect(acc.proficiencyLevel('tool', 'forgery-kit')).toBe('proficient');
  });

  it('three pure-skill picks also project (verifies the all-skills path)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(509) });
    const pc = buildHumanFighterWithSkilled();
    let campaign: Campaign = engine.createCampaign({ name: 'skilled-skills' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
      ...seedSkilledChoice(pc.id, [
        { id: 'arcana', target: 'skill' },
        { id: 'investigation', target: 'skill' },
        { id: 'perception', target: 'skill' },
      ]),
    ]);
    const acc = buildEffectStack({
      character: campaign.state.characters[pc.id]!,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.proficiencyLevel('skill', 'arcana')).toBe('proficient');
    expect(acc.proficiencyLevel('skill', 'investigation')).toBe('proficient');
    expect(acc.proficiencyLevel('skill', 'perception')).toBe('proficient');
  });
});
