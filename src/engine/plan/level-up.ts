import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
  HPStrategy,
  LevelUpResolvedEvent,
} from '../../schemas/events/level-up.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newChoiceId, newEventId } from '../../ids.js';
import { abilityModifier } from '../../derive/ability.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import type { Effect } from '../../schemas/effects.js';
import { expandGrantFeatEffects } from '../../derive/effect-stack.js';

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
            options: effect.options.map((o) => ({
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
  const event: ChoiceResolvedEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'ChoiceResolved',
    choiceId: intent.choiceId,
    characterId: intent.characterId,
    selectedOptionIds: [...intent.selectedOptionIds],
  };
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
  const events: Event[] = [event];
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
