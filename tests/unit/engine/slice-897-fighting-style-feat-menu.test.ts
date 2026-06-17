// Slice 897: the L4+ feat menu offers Fighting Style feats to a character that
// has the Fighting Style feature, de-duped against styles it already has.
// Closes the L7 audit Area-5 quirk `l4-menu-no-fighting-style-feats` (arm 2 of
// the `l4-feat-menu-eligibility` split — slice 809 did arm 1, the ability
// prereq).
//
// RAW: the Fighting Style feats (Archery, Defense, Great Weapon Fighting,
// Two-Weapon Fighting) require "the Fighting Style feature," and "you can't take
// the same Fighting Style twice." A Fighter (feature at L1) / Paladin / Ranger
// (L2) can take one at an Ability Score Improvement.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();
const FS_FEATS = ['fighting-style-archery', 'fighting-style-defense', 'fighting-style-great-weapon', 'fighting-style-two-weapon'];

const buildL3 = (classId: string, extra: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Aspirant', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId, level: 3, hitDiceRemaining: 3, subclassId: 'champion' }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 12, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    ...extra,
  });

// Level a L3 character to 4 and return the L4 feat-menu option ids. `pre` lets a
// test commit extra events (e.g. a resolved Fighting Style choice) first.
const l4Options = (pc: Character, classId: string, pre: (id: string) => Parameters<typeof commit>[1] = () => []): string[] => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(897) });
  let campaign: Campaign = engine.createCampaign({ name: 'fs-menu' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
  ]);
  const extra = pre(pc.id);
  if (extra.length > 0) campaign = commit(campaign, extra);
  const lu = engine.plan.levelUp(campaign.state, { characterId: pc.id, classId, hpStrategy: 'average' });
  const featChoice = lu.events.find(
    (e): e is ChoiceRequiredEvent => e.type === 'ChoiceRequired' && e.promptKey === 'ability-score-improvement-4',
  )!;
  return featChoice.options.map((o) => o.id);
};

describe('Fighting Style feats at the L4 feat menu (slice 897)', () => {
  it('a Fighter (has the Fighting Style feature) is offered all four Fighting Style feats + ASI + Grappler', () => {
    const opts = l4Options(buildL3('fighter'), 'fighter');
    expect(opts).toContain('ability-score-improvement');
    expect(opts).toContain('grappler');
    for (const f of FS_FEATS) expect(opts).toContain(f);
  });

  it('a Wizard (no Fighting Style feature) is offered NO Fighting Style feats', () => {
    const opts = l4Options(buildL3('wizard'), 'wizard');
    expect(opts).toContain('ability-score-improvement');
    for (const f of FS_FEATS) expect(opts).not.toContain(f);
  });

  it('de-dups a Fighting Style already taken as a FEAT (can\'t take the same style twice)', () => {
    const opts = l4Options(buildL3('fighter', { featsTaken: ['fighting-style-archery'] }), 'fighter');
    expect(opts).not.toContain('fighting-style-archery');
    expect(opts).toContain('fighting-style-defense'); // the others remain
  });

  it('de-dups the Fighting Style chosen via the class feature (resolved choice)', () => {
    const opts = l4Options(buildL3('fighter'), 'fighter', (charId) => {
      const choiceId = newChoiceId();
      return [
        { id: eventId(), at: isoTimestamp(), type: 'ChoiceRequired', choiceId, characterId: charId,
          promptKey: 'fighting-style-fighter', prompt: 'Choose a Fighting Style.',
          options: [{ id: 'archery', label: 'Archery', effects: [] }, { id: 'defense', label: 'Defense', effects: [] }],
          oneOf: 1 } satisfies ChoiceRequiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'ChoiceResolved', choiceId, characterId: charId,
          selectedOptionIds: ['archery'] } satisfies ChoiceResolvedEvent,
      ];
    });
    expect(opts).not.toContain('fighting-style-archery');
    expect(opts).toContain('fighting-style-two-weapon');
  });
});
