// Slice 703: the Ability Score Improvement feat (the L4 core).
//
// RAW (SRD 5.2.1, "Ability Score Improvement", General Feat,
// Prerequisite: Level 4+, Repeatable): "Increase one ability score of
// your choice by 2, or increase two ability scores of your choice by 1.
// This feat can't increase an ability score above 20."
//
// Engine wiring (RAW feat-based model — ASI is a feat; the L4 class
// rows grant it via GrantFeat, landing in slice 704): the feat ships a
// two-tier OfferChoice. The top "allocate" choice (oneOf 1) forks into
// "+2 to one ability" and "+1 to two abilities"; each fork nests an
// ability-picker OfferChoice whose options carry IncreaseAbilityScore
// effects (the slice-308 primitive, capped at 20). Resolving the leaf
// projects through the standard resolved-choice effect-stack path
// (source: 'choice'), so the increase surfaces in the derived sheet.
//
// This slice adds ONLY the feat. The L4 class rows + the full
// level-up→resolve→derive cascade are slices 704/705.

import { describe, expect, it } from 'vitest';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId, newChoiceId } from '../../../src/ids.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ChoiceRequiredEvent, ChoiceResolvedEvent } from '../../../src/schemas/events/level-up.js';
import type { Effect } from '../../../src/schemas/effects.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

interface OfferChoiceShape {
  readonly kind: string;
  readonly choiceId: string;
  readonly oneOf: number;
  readonly when?: string;
  readonly options: ReadonlyArray<{ id: string; label: string; effects: ReadonlyArray<Effect> }>;
}

const ASI_FEAT = PACK.feats.find((f) => f.id === 'ability-score-improvement');
const allocateChoice = (): OfferChoiceShape => ASI_FEAT!.effects[0] as unknown as OfferChoiceShape;
const fork = (id: 'plus-2-one' | 'plus-1-two'): { effects: ReadonlyArray<Effect> } =>
  allocateChoice().options.find((o) => o.id === id)!;
const nestedPicker = (id: 'plus-2-one' | 'plus-1-two'): OfferChoiceShape =>
  fork(id).effects[0] as unknown as OfferChoiceShape;

const buildHero = (overrides: Partial<Character> = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 4, hitDiceRemaining: 4 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 36, max: 36, temp: 0 },
    ...overrides,
  });

describe('slice 703: Ability Score Improvement feat', () => {
  describe('structure (RAW shape)', () => {
    it('is a repeatable General feat with the Level 4+ prerequisite', () => {
      expect(ASI_FEAT, 'ability-score-improvement feat missing from pack').toBeDefined();
      expect(ASI_FEAT!.category).toBe('general');
      expect(ASI_FEAT!.repeatable).toBe(true);
      expect(ASI_FEAT!.prerequisites).toContain('Level 4+');
    });

    it('forks into +2-one / +1-two via a single onAcquire OfferChoice', () => {
      const oc = allocateChoice();
      expect(oc.kind).toBe('OfferChoice');
      expect(oc.when).toBe('onAcquire');
      expect(oc.oneOf).toBe(1);
      expect(oc.options.map((o) => o.id)).toEqual(['plus-2-one', 'plus-1-two']);
    });

    it('+2-one nests a oneOf:1 ability picker, every ability +2 capped at 20', () => {
      const picker = nestedPicker('plus-2-one');
      expect(picker.kind).toBe('OfferChoice');
      expect(picker.oneOf).toBe(1);
      expect(picker.options.map((o) => o.id)).toEqual(['str', 'dex', 'con', 'int', 'wis', 'cha']);
      for (const opt of picker.options) {
        const inc = opt.effects[0] as Extract<Effect, { kind: 'IncreaseAbilityScore' }>;
        expect(inc.kind).toBe('IncreaseAbilityScore');
        expect(inc.amount).toBe(2);
        expect(inc.max).toBe(20);
      }
      // Each ability appears exactly once.
      const abilities = picker.options.map(
        (o) => (o.effects[0] as Extract<Effect, { kind: 'IncreaseAbilityScore' }>).ability,
      );
      expect([...abilities].sort()).toEqual([...ABILITIES].sort());
    });

    it('+1-two nests a oneOf:2 ability picker, every ability +1 capped at 20', () => {
      const picker = nestedPicker('plus-1-two');
      expect(picker.kind).toBe('OfferChoice');
      expect(picker.oneOf).toBe(2);
      expect(picker.options).toHaveLength(6);
      for (const opt of picker.options) {
        const inc = opt.effects[0] as Extract<Effect, { kind: 'IncreaseAbilityScore' }>;
        expect(inc.amount).toBe(1);
        expect(inc.max).toBe(20);
      }
    });
  });

  describe('cascade (real content drives planResolveChoice)', () => {
    // Install the feat's top "allocate" OfferChoice as a PendingChoice,
    // then resolve a fork and assert the nested ability picker cascades
    // (slice-517 nested-OfferChoice cascade), using the real authored
    // content for the option effects.
    const seedAllocate = (characterId: string): { choiceId: string; events: [ChoiceRequiredEvent] } => {
      const choiceId = newChoiceId();
      const oc = allocateChoice();
      return {
        choiceId,
        events: [
          {
            id: eventId(),
            at: isoTimestamp(),
            type: 'ChoiceRequired',
            choiceId,
            characterId,
            promptKey: oc.choiceId,
            prompt: 'Allocate the ASI.',
            options: oc.options.map((o) => ({ id: o.id, label: o.label, effects: o.effects as Effect[] })),
            oneOf: 1,
          },
        ],
      };
    };

    it('resolving "+2 to one" cascades the asi-plus2-ability picker (6 options)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(703) });
      const pc = buildHero({ featsTaken: ['ability-score-improvement'] });
      let campaign: Campaign = engine.createCampaign({ name: 'asi-cascade-2' });
      const { choiceId, events } = seedAllocate(pc.id);
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
        ...events,
      ]);
      const { events: out } = engine.plan.resolveChoice(campaign.state, {
        characterId: pc.id,
        choiceId,
        selectedOptionIds: ['plus-2-one'],
      });
      const cascaded = out.find(
        (e): e is ChoiceRequiredEvent =>
          (e as { type?: string }).type === 'ChoiceRequired' &&
          (e as { promptKey?: string }).promptKey === 'asi-plus2-ability',
      );
      expect(cascaded, 'asi-plus2-ability did not cascade').toBeDefined();
      expect(cascaded!.options).toHaveLength(6);
      expect(cascaded!.oneOf).toBe(1);
    });

    it('resolving "+1 to two" cascades the asi-plus1-abilities picker (oneOf 2)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(704) });
      const pc = buildHero({ featsTaken: ['ability-score-improvement'] });
      let campaign: Campaign = engine.createCampaign({ name: 'asi-cascade-1' });
      const { choiceId, events } = seedAllocate(pc.id);
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
        ...events,
      ]);
      const { events: out } = engine.plan.resolveChoice(campaign.state, {
        characterId: pc.id,
        choiceId,
        selectedOptionIds: ['plus-1-two'],
      });
      const cascaded = out.find(
        (e): e is ChoiceRequiredEvent =>
          (e as { type?: string }).type === 'ChoiceRequired' &&
          (e as { promptKey?: string }).promptKey === 'asi-plus1-abilities',
      );
      expect(cascaded, 'asi-plus1-abilities did not cascade').toBeDefined();
      expect(cascaded!.oneOf).toBe(2);
    });
  });

  describe('projection (leaf resolution moves the derived sheet)', () => {
    // Seed a resolved leaf ability-picker (the real "str" +2 option from
    // the feat content) and assert the increase projects through the
    // resolved-choice effect-stack path and surfaces in a STR save.
    const seedResolvedLeaf = (
      characterId: string,
      pickerId: 'asi-plus2-ability',
      optionId: string,
    ): [ChoiceRequiredEvent, ChoiceResolvedEvent] => {
      const choiceId = newChoiceId();
      const picker = nestedPicker('plus-2-one');
      return [
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ChoiceRequired',
          choiceId,
          characterId,
          promptKey: pickerId,
          prompt: 'Pick the ability.',
          options: picker.options.map((o) => ({ id: o.id, label: o.label, effects: o.effects as Effect[] })),
          oneOf: 1,
        },
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ChoiceResolved',
          choiceId,
          characterId,
          selectedOptionIds: [optionId],
        },
      ];
    };

    it('a resolved +2 STR pick raises effectiveAbilityScoreIncrease and the STR save', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(705) });
      const pc = buildHero({ featsTaken: ['ability-score-improvement'] });
      let campaign: Campaign = engine.createCampaign({ name: 'asi-project' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: pc } satisfies CharacterCreatedEvent,
        ...seedResolvedLeaf(pc.id, 'asi-plus2-ability', 'str'),
      ]);
      const effects = buildEffectStack({
        character: campaign.state.characters[pc.id]!,
        content: CONTENT,
        itemInstances: campaign.state.itemInstances,
        pendingChoices: campaign.state.pendingChoices,
      });
      expect(effects.effectiveAbilityScoreIncrease('STR')).toEqual({ amount: 2, max: 20 });
      const withAsi = computeSavingThrow({
        character: campaign.state.characters[pc.id]!,
        itemInstances: campaign.state.itemInstances,
        content: CONTENT,
        ability: 'STR',
        pendingChoices: campaign.state.pendingChoices,
      });
      const without = computeSavingThrow({
        character: buildHero(),
        itemInstances: {},
        content: CONTENT,
        ability: 'STR',
      });
      // STR 16 (+3) → 18 (+4): the save bonus rises by exactly 1.
      expect(withAsi.total - without.total).toBe(1);
    });
  });
});
