import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  ChoiceRequiredEvent,
  ChoiceResolvedEvent,
  LevelUpResolvedEvent,
} from '../../schemas/events/level-up.js';
import { invariant } from '../../internal/invariants.js';

export const applyLevelUpResolved = (
  state: Draft<CampaignState>,
  event: LevelUpResolvedEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  const enrollment = character.classes.find((c) => c.classId === event.classId);
  invariant(
    enrollment !== undefined,
    `Character ${event.characterId} has no enrollment in class ${event.classId}`,
  );
  invariant(
    enrollment.level + 1 === event.newClassLevel,
    `Level-up must advance by 1: current ${enrollment.level}, requested ${event.newClassLevel}`,
  );
  enrollment.level = event.newClassLevel;
  enrollment.hitDiceRemaining += 1;
  character.hp.max += event.hpGained;
  character.hp.current += event.hpGained;
};

export const applyChoiceRequired = (
  state: Draft<CampaignState>,
  event: ChoiceRequiredEvent,
): void => {
  const character = state.characters[event.characterId];
  invariant(character !== undefined, `Character ${event.characterId} not found`);
  invariant(
    state.pendingChoices[event.choiceId] === undefined,
    `Choice ${event.choiceId} already exists`,
  );
  state.pendingChoices[event.choiceId] = {
    id: event.choiceId,
    prompt: event.prompt,
    options: [...event.options],
    oneOf: event.oneOf,
    forCharacterId: event.characterId,
    triggerEventId: event.id,
    // Slice 618: persist the content-side choiceId so the
    // planOfferCharacterChoices planner can dedupe across repeated
    // calls without relying on prompt-text matching.
    promptKey: event.promptKey,
  };
  character.pendingChoiceIds.push(event.choiceId);
};

export const applyChoiceResolved = (
  state: Draft<CampaignState>,
  event: ChoiceResolvedEvent,
): void => {
  const choice = state.pendingChoices[event.choiceId];
  invariant(choice !== undefined, `Choice ${event.choiceId} not found`);
  invariant(choice.resolution === undefined, `Choice ${event.choiceId} already resolved`);
  invariant(
    choice.forCharacterId === event.characterId,
    `Choice ${event.choiceId} belongs to a different character`,
  );
  invariant(
    event.selectedOptionIds.length === choice.oneOf,
    `Expected exactly ${choice.oneOf} selection(s), got ${event.selectedOptionIds.length}`,
  );
  for (const id of event.selectedOptionIds) {
    invariant(
      choice.options.some((o) => o.id === id),
      `Option ${id} not in choice ${event.choiceId}`,
    );
  }
  choice.resolution = {
    selectedOptionIds: [...event.selectedOptionIds],
    atEventId: event.id,
  };
};
