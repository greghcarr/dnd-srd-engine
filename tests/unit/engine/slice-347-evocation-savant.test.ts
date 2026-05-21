// Slice 347 - Evoker Evocation Savant (L3). RAW 2024: "Choose two
// Wizard spells from the Evocation school, each no higher than level 2,
// and add them to your spellbook for free." Wired as an OfferChoice
// (oneOf: 2) over the evocation wizard spells in the pack; each option
// grants its spell with preparation 'known' (added to the spellbook).
//
// RAW-scope note: "add to your spellbook" means leveled spells, so the
// eligible set is L1-L2 evocation wizard spells (cantrips are not
// spellbook entries). The recurring "add one evocation spell whenever
// you gain a new spell-slot level" arm is deferred (needs an
// on-slot-level-gain trigger the engine doesn't expose).
import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { Effect } from '../../../src/schemas/effects.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const EXPECTED_OPTION_IDS = [
  'acid-arrow', 'burning-hands', 'chromatic-orb', 'continual-flame', 'darkness',
  'gust-of-wind', 'magic-missile', 'scorching-ray', 'shatter', 'thunderwave',
];

const savantOffer = (() => {
  const evoker = PACK.subclasses.find((s) => s.id === 'evoker')!;
  const feature = evoker.levelGrants['3']!.find((f) => f.id === 'evocation-savant')!;
  return feature.effects.find(
    (e): e is Extract<Effect, { kind: 'OfferChoice' }> => e.kind === 'OfferChoice',
  )!;
})();

const buildEvoker = (level: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Pyra',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level, hitDiceRemaining: level, subclassId: 'evoker' }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 10, CHA: 10 },
    hp: { current: 18, max: 18, temp: 0 },
  });

const grantedSpellIds = (character: Character, campaign: Campaign): string[] =>
  buildEffectStack({
    character,
    content: CONTENT,
    itemInstances: campaign.state.itemInstances,
    pendingChoices: campaign.state.pendingChoices,
  })
    .grantedSpells()
    .map((g) => g.spellId)
    .sort();

describe('slice 347: Evoker Evocation Savant', () => {
  it('offers two picks from the ten L1-2 evocation wizard spells, each a known grant', () => {
    expect(savantOffer.oneOf).toBe(2);
    expect(savantOffer.options.map((o) => o.id).sort()).toEqual(EXPECTED_OPTION_IDS);
    for (const o of savantOffer.options) {
      expect(o.effects).toEqual([{ kind: 'GrantSpell', spellId: o.id, preparation: 'known' }]);
    }
  });

  it('resolving the choice grants exactly the two picked spells', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(347) });
    const wiz = buildEvoker(3);
    const choiceId = newChoiceId();
    let campaign: Campaign = engine.createCampaign({ name: 'evocation-savant' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wiz } satisfies CharacterCreatedEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ChoiceRequired',
        choiceId,
        characterId: wiz.id,
        promptKey: 'evocation-savant',
        prompt: savantOffer.prompt,
        options: savantOffer.options,
        oneOf: 2,
      } satisfies ChoiceRequiredEvent,
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'ChoiceResolved',
        choiceId,
        characterId: wiz.id,
        selectedOptionIds: ['magic-missile', 'scorching-ray'],
      } satisfies ChoiceResolvedEvent,
    ]);
    const stored = campaign.state.characters[wiz.id]!;
    const granted = grantedSpellIds(stored, campaign);
    expect(granted).toContain('magic-missile');
    expect(granted).toContain('scorching-ray');
    expect(granted).not.toContain('shatter');
    expect(granted).toHaveLength(2);
  });
});
