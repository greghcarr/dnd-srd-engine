// Slice 801: a multi-select choice requires DISTINCT picks (Area 5
// divergence `asi-distinctness`). The ASI "+1 to two ability scores"
// menu (`asi-plus1-abilities`, oneOf:2) accepted ['str','str'] and
// applied +1+1 = +2 to one ability — the illegal back-door to a +2 that
// the separate `asi-plus2-ability` (oneOf:1) choice exists for. The fix
// lives in the generic choice gate (planResolveChoice + applyChoice
// Resolved), so it also stops duplicate picks on Skilled / Magic
// Initiate / any oneOf:N menu; the +2-to-one path (oneOf:1) is unaffected.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
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
    id: newCharacterId(), name: 'Improver', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
  });

// Drive the level-up cascade to the `asi-plus1-abilities` (+1 to two,
// oneOf:2) leaf choice; return the campaign + that choice's id.
const toPlus1TwoChoice = (seed: number): { engine: ReturnType<typeof createEngine>; campaign: Campaign; pc: Character; choiceId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
  const pc = buildL3Fighter();
  let campaign: Campaign = engine.createCampaign({ name: 'asi-distinct' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
  ]);
  const lu = engine.plan.levelUp(campaign.state, { characterId: pc.id, classId: 'fighter', hpStrategy: 'average' });
  campaign = commit(campaign, lu.events);
  const r1 = engine.plan.resolveChoice(campaign.state, {
    characterId: pc.id, choiceId: choiceIdByPrompt(lu.events, 'ability-score-improvement-4')!, selectedOptionIds: ['ability-score-improvement'],
  });
  campaign = commit(campaign, r1.events);
  const r2 = engine.plan.resolveChoice(campaign.state, {
    characterId: pc.id, choiceId: choiceIdByPrompt(r1.events, 'ability-score-improvement')!, selectedOptionIds: ['plus-1-two'],
  });
  campaign = commit(campaign, r2.events);
  const choiceId = choiceIdByPrompt(r2.events, 'asi-plus1-abilities')!;
  expect(choiceId, 'did not reach the +1-to-two ability picker').toBeDefined();
  return { engine, campaign, pc, choiceId };
};

describe('ASI distinctness — +1 to two ability scores (slice 801)', () => {
  it('rejects the same ability twice (["str","str"]) — the illegal +2-to-one back-door', () => {
    const { engine, campaign, pc, choiceId } = toPlus1TwoChoice(1);
    expect(() =>
      engine.plan.resolveChoice(campaign.state, { characterId: pc.id, choiceId, selectedOptionIds: ['str', 'str'] }),
    ).toThrow(/distinct/i);
  });

  it('accepts two DIFFERENT abilities (["str","dex"]) → +1 to each', () => {
    const { engine, campaign, pc, choiceId } = toPlus1TwoChoice(2);
    const r = engine.plan.resolveChoice(campaign.state, { characterId: pc.id, choiceId, selectedOptionIds: ['str', 'dex'] });
    const after = commit(campaign, r.events);
    const character = after.state.characters[pc.id]!;
    const effects = buildEffectStack({
      character, content: CONTENT, itemInstances: after.state.itemInstances, pendingChoices: after.state.pendingChoices,
    });
    expect(effects.effectiveAbilityScoreIncrease('STR')).toEqual({ amount: 1, max: 20 });
    expect(effects.effectiveAbilityScoreIncrease('DEX')).toEqual({ amount: 1, max: 20 });
  });

  it('the +2-to-one path (oneOf:1) is unaffected by the distinctness gate', () => {
    // Re-run the cascade but pick plus-2-one → str; a single-pick choice
    // can't trip distinctness and still applies +2.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
    const pc = buildL3Fighter();
    let campaign: Campaign = engine.createCampaign({ name: 'asi-plus2' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
    ]);
    const lu = engine.plan.levelUp(campaign.state, { characterId: pc.id, classId: 'fighter', hpStrategy: 'average' });
    campaign = commit(campaign, lu.events);
    const r1 = engine.plan.resolveChoice(campaign.state, {
      characterId: pc.id, choiceId: choiceIdByPrompt(lu.events, 'ability-score-improvement-4')!, selectedOptionIds: ['ability-score-improvement'],
    });
    campaign = commit(campaign, r1.events);
    const r2 = engine.plan.resolveChoice(campaign.state, {
      characterId: pc.id, choiceId: choiceIdByPrompt(r1.events, 'ability-score-improvement')!, selectedOptionIds: ['plus-2-one'],
    });
    campaign = commit(campaign, r2.events);
    const r3 = engine.plan.resolveChoice(campaign.state, {
      characterId: pc.id, choiceId: choiceIdByPrompt(r2.events, 'asi-plus2-ability')!, selectedOptionIds: ['str'],
    });
    campaign = commit(campaign, r3.events);
    const character = campaign.state.characters[pc.id]!;
    const effects = buildEffectStack({
      character, content: CONTENT, itemInstances: campaign.state.itemInstances, pendingChoices: campaign.state.pendingChoices,
    });
    expect(effects.effectiveAbilityScoreIncrease('STR')).toEqual({ amount: 2, max: 20 });
  });
});
