// Slice 461: Human Skillful species trait.
//
// RAW (SRD 5.2.1 Human): "Skillful. You gain proficiency in one skill
// of your choice." Modeled as an OfferChoice oneOf:1 over all 18
// skills with `when: 'onAcquire'`, mirroring slice-447's Elf Keen
// Senses pattern.
//
// Resourceful (Heroic Inspiration on Long Rest) and Versatile (gain
// an origin feat) stay deferred: each needs novel primitives the
// engine doesn't yet carry (a Heroic Inspiration tracker; a
// feat-grant-from-choice resolution path).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
} from '../../../src/schemas/events/level-up.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildHuman = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Mira',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    featsTaken: [],
  });

const seedSkillfulChoice = (
  characterId: string,
  selected: string,
): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
  const choiceId = newChoiceId();
  const allSkills = [
    'acrobatics', 'animal-handling', 'arcana', 'athletics',
    'deception', 'history', 'insight', 'intimidation',
    'investigation', 'medicine', 'nature', 'perception',
    'performance', 'persuasion', 'religion', 'sleight-of-hand',
    'stealth', 'survival',
  ] as const;
  return [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceRequired',
      choiceId,
      characterId,
      promptKey: 'human-skillful',
      prompt: 'Choose a skill to gain proficiency in (Human Skillful).',
      options: allSkills.map((s) => ({
        id: s,
        label: s,
        effects: [{ kind: 'GrantProficiency', target: 'skill', id: s, level: 'proficient' }],
      })),
      oneOf: 1,
    },
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'ChoiceResolved',
      choiceId,
      characterId,
      selectedOptionIds: [selected],
    },
  ];
};

describe('Human Skillful (slice 461)', () => {
  it('a Human who picks Perception folds it into the effect stack as proficient', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const human = buildHuman();
    let campaign: Campaign = engine.createCampaign({ name: 'human-skillful' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
      ...seedSkillfulChoice(human.id, 'perception'),
    ]);
    const stored = campaign.state.characters[human.id]!;
    const acc = buildEffectStack({
      character: stored,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.proficiencyLevel('skill', 'perception')).toBe('proficient');
    expect(acc.proficiencyLevel('skill', 'stealth')).not.toBe('proficient');
  });

  it('a Human who picks Stealth gets Stealth, not Perception', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const human = buildHuman();
    let campaign: Campaign = engine.createCampaign({ name: 'human-stealth' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
      ...seedSkillfulChoice(human.id, 'stealth'),
    ]);
    const stored = campaign.state.characters[human.id]!;
    const acc = buildEffectStack({
      character: stored,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(acc.proficiencyLevel('skill', 'stealth')).toBe('proficient');
    expect(acc.proficiencyLevel('skill', 'perception')).not.toBe('proficient');
  });

  it('a Human with no chosen skill has no Skillful-derived proficiency on the effect stack', () => {
    // Without seeding a ChoiceResolved, the OfferChoice stays
    // unresolved and contributes no projected proficiency.
    const human = buildHuman();
    const acc = buildEffectStack({
      character: human,
      content: CONTENT,
      itemInstances: {},
    });
    expect(acc.proficiencyLevel('skill', 'perception')).not.toBe('proficient');
    expect(acc.proficiencyLevel('skill', 'stealth')).not.toBe('proficient');
  });
});
