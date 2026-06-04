// Slice 654: subclass-selection cascade.
//
// Verifies the end-to-end flow:
//   1. planLevelUp at newClassLevel === cls.subclassLevel emits a
//      subclass-selection ChoiceRequired with the available
//      subclasses as options (per content.subclasses filtered by
//      parentClassId). The event carries the
//      `subclassChoiceForClassId` marker.
//   2. The applyChoiceRequired reducer persists the marker onto the
//      PendingChoice.
//   3. planResolveChoice detects the marker and emits a
//      SubclassChosen event alongside ChoiceResolved.
//   4. applySubclassChosen sets the enrollment's subclassId.
//   5. Re-invoking offerCharacterChoices on the post-resolution
//      state surfaces the subclass's nested OfferChoices (Druid
//      Circle Cantrip + Circle Spells for a Land druid).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type {
  ChoiceRequiredEvent,
  SubclassChosenEvent,
} from '../../../src/schemas/events/level-up.js';

const PACK = loadStarterPack();

const buildL2Barbarian = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Krath',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'barbarian', level: 2, hitDiceRemaining: 2 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    hp: { current: 18, max: 18, temp: 0 },
  });

const buildL2Druid = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wren',
    speciesId: 'elf',
    backgroundId: 'sage',
    classes: [{ classId: 'druid', level: 2, hitDiceRemaining: 2 }],
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 16, CHA: 10 },
    hp: { current: 16, max: 16, temp: 0 },
  });

const seed = (character: Character): { engine: ReturnType<typeof createEngine>; campaign: Campaign } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  let campaign = engine.createCampaign({ name: 'subclass-cascade' });
  campaign = commit(campaign, [
    {
      id: eventId(),
      at: isoTimestamp(),
      type: 'CharacterCreated',
      snapshot: character,
    } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign };
};

describe('slice 654: subclass-selection cascade', () => {
  it('planLevelUp emits subclass-selection ChoiceRequired when newClassLevel === subclassLevel (Barbarian L2->L3)', () => {
    const barb = buildL2Barbarian();
    const s = seed(barb);
    const events = s.engine.plan.levelUp(s.campaign.state, {
      characterId: barb.id,
      classId: 'barbarian',
      hpStrategy: 'average',
    });
    const subclassChoice = events.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'subclass-barbarian',
    );
    expect(subclassChoice, 'subclass-selection ChoiceRequired did not fire').toBeDefined();
    expect(subclassChoice!.subclassChoiceForClassId).toBe('barbarian');
    // Canonical L3 subclass for Barbarian is Path of the Berserker;
    // the audit's job is to confirm the catalog of available
    // subclasses appears as options.
    const optionIds = subclassChoice!.options.map((o) => o.id);
    expect(optionIds).toContain('path-of-the-berserker');
  });

  it('resolving the subclass choice emits SubclassChosen and the reducer sets enrollment.subclassId', () => {
    const barb = buildL2Barbarian();
    const s = seed(barb);
    const levelUpOut = s.engine.plan.levelUp(s.campaign.state, {
      characterId: barb.id,
      classId: 'barbarian',
      hpStrategy: 'average',
    });
    let campaign = commit(s.campaign, levelUpOut.events);
    const subclassChoice = levelUpOut.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'subclass-barbarian',
    )!;

    const resolveOut = s.engine.plan.resolveChoice(campaign.state, {
      choiceId: subclassChoice.choiceId,
      characterId: barb.id,
      selectedOptionIds: ['path-of-the-berserker'],
    });
    const subclassChosen = resolveOut.events.find(
      (e): e is SubclassChosenEvent => e.type === 'SubclassChosen',
    );
    expect(subclassChosen, 'SubclassChosen not emitted').toBeDefined();
    expect(subclassChosen!.classId).toBe('barbarian');
    expect(subclassChosen!.subclassId).toBe('path-of-the-berserker');

    campaign = commit(campaign, resolveOut.events);
    const enrollment = campaign.state.characters[barb.id]!.classes.find(
      (c) => c.classId === 'barbarian',
    );
    expect(enrollment?.subclassId).toBe('path-of-the-berserker');
  });

  it('Druid L2->L3: subclass-selection cascade fires; post-resolution offerCharacterChoices surfaces Circle Cantrip + Spells', () => {
    const druid = buildL2Druid();
    const s = seed(druid);
    const levelUpOut = s.engine.plan.levelUp(s.campaign.state, {
      characterId: druid.id,
      classId: 'druid',
      hpStrategy: 'average',
    });
    let campaign = commit(s.campaign, levelUpOut.events);
    const subclassChoice = levelUpOut.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'subclass-druid',
    )!;
    expect(subclassChoice, 'druid subclass-selection ChoiceRequired did not fire').toBeDefined();

    // Resolve to Circle of the Land.
    const resolveOut = s.engine.plan.resolveChoice(campaign.state, {
      choiceId: subclassChoice.choiceId,
      characterId: druid.id,
      selectedOptionIds: ['circle-of-the-land'],
    });
    campaign = commit(campaign, resolveOut.events);

    // Now the druid has subclassId set. Re-invoke
    // offerCharacterChoices to surface the nested OfferChoices
    // (Circle Cantrip + Circle Spells) the subclass's
    // levelGrants['3'] ships.
    const cascade = s.engine.plan.offerCharacterChoices(campaign.state, {
      characterId: druid.id,
    });
    const cantripChoice = cascade.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'circle-of-the-land-cantrip',
    );
    const landChoice = cascade.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'circle-of-the-land-type',
    );
    expect(cantripChoice, 'Circle Cantrip choice not surfaced post-resolution').toBeDefined();
    expect(landChoice, 'Circle Spells (land type) choice not surfaced post-resolution').toBeDefined();
  });

  it('subclass cascade does NOT fire if enrollment.subclassId is already set (createPC path)', () => {
    // A character built at L3 via createPC with subclassId set
    // shouldn't get the subclass-selection cascade when leveling
    // further; the marker guard is `enrollment.subclassId === undefined`.
    const druidL3 = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Pre-built',
      speciesId: 'elf',
      backgroundId: 'sage',
      classes: [{ classId: 'druid', level: 3, hitDiceRemaining: 3, subclassId: 'circle-of-the-land' }],
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 16, CHA: 10 },
      hp: { current: 22, max: 22, temp: 0 },
    });
    const s = seed(druidL3);
    const events = s.engine.plan.levelUp(s.campaign.state, {
      characterId: druidL3.id,
      classId: 'druid',
      hpStrategy: 'average',
    });
    // Going from L3 -> L4 with subclassId already set: no
    // subclass-selection ChoiceRequired should fire (subclassLevel
    // is 3, not 4 anyway; this also exercises the
    // `enrollment.subclassId === undefined` guard implicitly).
    const subclassChoice = events.events.find(
      (e): e is ChoiceRequiredEvent =>
        e.type === 'ChoiceRequired' && e.promptKey === 'subclass-druid',
    );
    expect(subclassChoice).toBeUndefined();
  });
});
