import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
  HPStrategy,
  LevelUpResolvedEvent,
  SubclassChosenEvent,
} from '../../schemas/events/level-up.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newChoiceId, newEventId } from '../../ids.js';
import { abilityModifier, effectiveAbilityScore } from '../../derive/ability.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import type { Effect } from '../../schemas/effects.js';
import { expandGrantFeatEffects, buildEffectStack } from '../../derive/effect-stack.js';

const HP_AVERAGE_BY_DIE: Record<number, number> = { 6: 4, 8: 5, 10: 6, 12: 7 };

export interface LevelUpIntent {
  readonly type: 'LevelUp';
  readonly characterId: string;
  readonly classId: string;
  readonly hpStrategy: HPStrategy;
  readonly at?: string;
}

export const planLevelUp = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: LevelUpIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (character.pendingChoiceIds.some((id) => state.pendingChoices[id]?.resolution === undefined)) {
    throw new Error('Character has unresolved choices from a previous level-up');
  }
  const enrollment = character.classes.find((c) => c.classId === intent.classId);
  if (!enrollment) throw new Error(`Character has no enrollment in ${intent.classId}`);
  if (enrollment.level >= 20) throw new Error('Already at max level');
  const cls = content.classes.get(intent.classId);
  if (!cls) throw new Error(`Unknown class ${intent.classId}`);

  const newClassLevel = enrollment.level + 1;
  const die = cls.hitDie;
  const conMod = abilityModifier(character.abilityScores.CON);

  let hpRoll: number | undefined;
  let baseGain: number;
  if (intent.hpStrategy === 'roll') {
    hpRoll = rollDie(die, rng);
    baseGain = hpRoll;
  } else {
    const avg = HP_AVERAGE_BY_DIE[die];
    if (avg === undefined) throw new Error(`No HP average for d${die}`);
    baseGain = avg;
  }
  const hpGained = Math.max(1, baseGain + conMod);
  const at = intent.at ?? nowIso();

  const levelUp: LevelUpResolvedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'LevelUpResolved',
    characterId: intent.characterId,
    classId: intent.classId,
    newClassLevel,
    hpStrategy: intent.hpStrategy,
    ...(hpRoll !== undefined ? { hpRoll } : {}),
    hpGained,
  };

  const events: Event[] = [levelUp];

  const newLevelEntry = cls.levelTable[String(newClassLevel)];
  if (newLevelEntry !== undefined) {
    // Slice 809: feat-menu eligibility. RAW: the L4+ improvement offers
    // "an Ability Score Improvement or a feat for which you qualify." An
    // option whose GrantFeat references a feat with an unmet ability
    // prerequisite (Grappler: STR or DEX 13, on the EFFECTIVE score) is
    // dropped. The level prereq is satisfied by reaching this choice;
    // options without a GrantFeat (the ASI option) are always kept.
    const prereqEffects = buildEffectStack({
      character, content, itemInstances: state.itemInstances, pendingChoices: state.pendingChoices,
    });
    const meetsAbilityPrereq = (featId: string): boolean => {
      const prereq = content.feats.get(featId)?.abilityPrerequisite;
      if (prereq === undefined) return true;
      return prereq.abilities.some(
        (a) =>
          effectiveAbilityScore(
            character.abilityScores[a],
            prereqEffects.effectiveAbilityScoreFloor(a)?.value,
            prereqEffects.effectiveAbilityScoreIncrease(a),
          ) >= prereq.min,
      );
    };
    const optionEligible = (o: { effects: ReadonlyArray<Effect> }): boolean => {
      const grant = o.effects.find((e) => e.kind === 'GrantFeat');
      return grant === undefined || meetsAbilityPrereq((grant as Extract<Effect, { kind: 'GrantFeat' }>).featId);
    };
    for (const feature of newLevelEntry.features) {
      for (const effect of feature.effects) {
        if (effect.kind === 'OfferChoice' && effect.when !== 'onLongRest') {
          const choice: ChoiceRequiredEvent = {
            id: newEventId() as ULID,
            at,
            type: 'ChoiceRequired',
            choiceId: newChoiceId(),
            characterId: intent.characterId,
            promptKey: effect.choiceId,
            prompt: effect.prompt,
            options: effect.options.filter(optionEligible).map((o) => ({
              id: o.id,
              label: o.label,
              effects: o.effects as Effect[],
            })),
            oneOf: effect.oneOf,
            causedByEventId: levelUp.id,
          };
          events.push(choice);
        }
      }
    }
  }

  // Slice 654: subclass-selection cascade. At the class's
  // `subclassLevel`, emit a ChoiceRequired listing the available
  // subclasses (content.subclasses filtered by parentClassId). The
  // `subclassChoiceForClassId` marker tells planResolveChoice to
  // emit a SubclassChosen event alongside ChoiceResolved.
  if (cls.subclassLevel === newClassLevel && enrollment.subclassId === undefined) {
    const availableSubclasses = [...content.subclasses.values()].filter(
      (s) => s.parentClassId === intent.classId,
    );
    if (availableSubclasses.length > 0) {
      const subclassChoice: ChoiceRequiredEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ChoiceRequired',
        choiceId: newChoiceId(),
        characterId: intent.characterId,
        promptKey: `subclass-${intent.classId}`,
        prompt: `Choose a ${cls.name ?? intent.classId} subclass.`,
        options: availableSubclasses.map((s) => ({
          id: s.id,
          label: s.name ?? s.id,
          // Subclass effects come online via the effect-stack derive
          // once the enrollment's subclassId is set by SubclassChosen.
          // No per-option effects to apply at choice-resolution time
          // (the consumer re-invokes offerCharacterChoices to surface
          // nested OfferChoices like Druid Circle Cantrip).
          effects: [],
        })),
        oneOf: 1,
        causedByEventId: levelUp.id,
        subclassChoiceForClassId: intent.classId,
      };
      events.push(subclassChoice);
    }
  }

  return events;
};

export interface ResolveChoiceIntent {
  readonly type: 'ResolveChoice';
  readonly choiceId: string;
  readonly characterId: string;
  readonly selectedOptionIds: ReadonlyArray<string>;
  readonly at?: string;
}

export const planResolveChoice = (
  state: CampaignState,
  content: ResolvedContent,
  intent: ResolveChoiceIntent,
): ReadonlyArray<Event> => {
  const choice = state.pendingChoices[intent.choiceId];
  if (!choice) throw new Error(`Unknown choice ${intent.choiceId}`);
  if (choice.resolution !== undefined) {
    throw new Error(`Choice ${intent.choiceId} already resolved`);
  }
  if (choice.forCharacterId !== intent.characterId) {
    throw new Error(`Choice ${intent.choiceId} belongs to a different character`);
  }
  if (intent.selectedOptionIds.length !== choice.oneOf) {
    throw new Error(
      `Expected exactly ${choice.oneOf} selection(s), got ${intent.selectedOptionIds.length}`,
    );
  }
  for (const id of intent.selectedOptionIds) {
    if (!choice.options.some((o) => o.id === id)) {
      throw new Error(`Option ${id} not in choice ${intent.choiceId}`);
    }
  }
  // Slice 801: a multi-select choice picks DISTINCT options. Without
  // this, the ASI "+1 to two ability scores" path (the `asi-plus1-
  // abilities` oneOf:2 menu) accepted ['str','str'] and applied +1+1 =
  // +2 to one ability — the illegal back-door to a +2 the separate
  // `asi-plus2-ability` choice is for. Also closes duplicate picks on
  // Skilled (3 skills), Magic Initiate, and every other oneOf:N menu;
  // the +2-to-one path is oneOf:1 and so is unaffected.
  if (new Set(intent.selectedOptionIds).size !== intent.selectedOptionIds.length) {
    throw new Error(
      `Choice ${intent.choiceId} requires distinct selections (duplicate in [${intent.selectedOptionIds.join(', ')}])`,
    );
  }
  const event: ChoiceResolvedEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'ChoiceResolved',
    choiceId: intent.choiceId,
    characterId: intent.characterId,
    selectedOptionIds: [...intent.selectedOptionIds],
  };
  // Slice 654: subclass-selection cascade. If the choice was a
  // subclass selection (per the slice-654 `subclassChoiceForClassId`
  // marker on the original ChoiceRequired, copied onto the
  // PendingChoice by the reducer), emit a SubclassChosen event so
  // the reducer assigns the enrollment's subclassId. The chosen
  // option's id IS the subclassId (planLevelUp constructs each
  // option's id from the subclass id).
  const subclassChosen: SubclassChosenEvent[] = [];
  const subclassClassId = (choice as { subclassChoiceForClassId?: string })
    .subclassChoiceForClassId;
  if (subclassClassId !== undefined && intent.selectedOptionIds.length === 1) {
    subclassChosen.push({
      id: newEventId() as ULID,
      at: intent.at ?? nowIso(),
      type: 'SubclassChosen',
      characterId: intent.characterId,
      classId: subclassClassId,
      subclassId: intent.selectedOptionIds[0]!,
    });
  }
  // Slice 517: cascade ChoiceRequired events for nested OfferChoice
  // effects in the resolved option(s). Canonical user: Warlock Pact of
  // the Tome — picking it via the L1 invocation OfferChoice triggers
  // two nested OfferChoices (3 cantrips + 2 L1 ritual spells from any
  // class). Without cascade, the nested choices never install as
  // PendingChoices (level-up.ts only walks new class features, not
  // resolved-option effects).
  //
  // The cascade:
  //   1. For each chosen option's effects, expand GrantFeat references
  //      (slice 511) so granted feats' nested OfferChoices also fire.
  //   2. For each OfferChoice in the resulting flat effects (with
  //      `when !== 'onLongRest'`, same filter as planLevelUp), emit a
  //      ChoiceRequired event.
  const events: Event[] = [event, ...subclassChosen];
  const at = intent.at ?? nowIso();
  for (const optionId of intent.selectedOptionIds) {
    const option = choice.options.find((o) => o.id === optionId);
    if (option === undefined) continue;
    const expandedEffects = expandGrantFeatEffects(option.effects as Effect[], content);
    for (const effect of expandedEffects) {
      if (effect.kind !== 'OfferChoice' || effect.when === 'onLongRest') continue;
      const cascaded: ChoiceRequiredEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ChoiceRequired',
        choiceId: newChoiceId(),
        characterId: intent.characterId,
        promptKey: effect.choiceId,
        prompt: effect.prompt,
        options: effect.options.map((o) => ({
          id: o.id,
          label: o.label,
          effects: o.effects as Effect[],
        })),
        oneOf: effect.oneOf,
        causedByEventId: event.id,
      };
      events.push(cascaded);
    }
  }
  return events;
};
