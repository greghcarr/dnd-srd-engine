// Slice 707: the L4 Ability Score Improvement choice, end to end.
//
// Each class's levelTable['4'] now ships an `ability-score-improvement-4`
// feature whose OfferChoice grants the ASI feat (slice 703) or another
// general feat (Grappler). This test drives the full level-up cascade
// for a Fighter — level 3 → 4 emits the feat ChoiceRequired; picking the
// ASI feat cascades into the +2/+1 allocate choice, then the ability
// picker; resolving the leaf raises the derived ability score (the
// IncreaseAbilityScore projects through the source:'choice' effect-stack
// path).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent } from '../../../src/schemas/events/level-up.js';
import type { Event } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const choiceIdByPrompt = (events: ReadonlyArray<Event>, promptKey: string): string | undefined =>
  events.find(
    (e): e is ChoiceRequiredEvent =>
      (e as { type?: string }).type === 'ChoiceRequired' &&
      (e as { promptKey?: string }).promptKey === promptKey,
  )?.choiceId;

const buildL3Fighter = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Climber',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
  });

describe('slice 707: L4 Ability Score Improvement choice (Fighter, end to end)', () => {
  it('leveling 3→4 emits the feat ChoiceRequired offering ASI + Grappler', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const pc = buildL3Fighter();
    let campaign: Campaign = engine.createCampaign({ name: 'l4-asi' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
    ]);
    const lu = engine.plan.levelUp(campaign.state, {
      characterId: pc.id,
      classId: 'fighter',
      hpStrategy: 'average',
    });
    const featChoice = lu.events.find(
      (e): e is ChoiceRequiredEvent =>
        (e as { type?: string }).type === 'ChoiceRequired' &&
        (e as { promptKey?: string }).promptKey === 'ability-score-improvement-4',
    );
    expect(featChoice, 'no ASI/feat ChoiceRequired on the 3→4 level-up').toBeDefined();
    expect(featChoice!.oneOf).toBe(1);
    expect(featChoice!.options.map((o) => o.id)).toEqual(['ability-score-improvement', 'grappler']);
  });

  it('picking ASI → +2 to one ability → STR raises the derived STR save by 1', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
    const pc = buildL3Fighter();
    let campaign: Campaign = engine.createCampaign({ name: 'l4-asi-resolve' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
    ]);

    // 1. Level 3 → 4: emits + installs the feat ChoiceRequired.
    const lu = engine.plan.levelUp(campaign.state, {
      characterId: pc.id,
      classId: 'fighter',
      hpStrategy: 'average',
    });
    campaign = commit(campaign, lu.events);
    const featChoiceId = choiceIdByPrompt(lu.events, 'ability-score-improvement-4');
    expect(featChoiceId).toBeDefined();

    // 2. Pick the ASI feat → cascades the feat's +2/+1 allocate choice.
    const r1 = engine.plan.resolveChoice(campaign.state, {
      characterId: pc.id,
      choiceId: featChoiceId!,
      selectedOptionIds: ['ability-score-improvement'],
    });
    campaign = commit(campaign, r1.events);
    const allocateId = choiceIdByPrompt(r1.events, 'ability-score-improvement');
    expect(allocateId, 'ASI feat allocate choice did not cascade').toBeDefined();

    // 3. Pick "+2 to one ability" → cascades the ability picker.
    const r2 = engine.plan.resolveChoice(campaign.state, {
      characterId: pc.id,
      choiceId: allocateId!,
      selectedOptionIds: ['plus-2-one'],
    });
    campaign = commit(campaign, r2.events);
    const pickId = choiceIdByPrompt(r2.events, 'asi-plus2-ability');
    expect(pickId, 'ASI ability picker did not cascade').toBeDefined();

    // 4. Pick Strength → the leaf IncreaseAbilityScore resolves.
    const r3 = engine.plan.resolveChoice(campaign.state, {
      characterId: pc.id,
      choiceId: pickId!,
      selectedOptionIds: ['str'],
    });
    campaign = commit(campaign, r3.events);

    // The increase projects through the resolved-choice effect-stack.
    const character = campaign.state.characters[pc.id]!;
    const effects = buildEffectStack({
      character,
      content: CONTENT,
      itemInstances: campaign.state.itemInstances,
      pendingChoices: campaign.state.pendingChoices,
    });
    expect(effects.effectiveAbilityScoreIncrease('STR')).toEqual({ amount: 2, max: 20 });

    // STR 16 (+3) → 18 (+4): the STR save rises by exactly 1. Isolate the
    // ASI by comparing with vs without the resolved choices applied.
    const withAsi = computeSavingThrow({
      character,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'STR',
      pendingChoices: campaign.state.pendingChoices,
    });
    const without = computeSavingThrow({
      character,
      itemInstances: campaign.state.itemInstances,
      content: CONTENT,
      ability: 'STR',
    });
    expect(withAsi.total - without.total).toBe(1);
  });
});
