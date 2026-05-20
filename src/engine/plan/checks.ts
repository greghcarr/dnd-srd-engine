import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  AbilityCheckRolledEvent,
  CheckAdvantage,
  SaveRolledEvent,
} from '../../schemas/events/checks.js';
import type { AbilityScore, Skill } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { computeAbilityCheck } from '../../derive/ability-check.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const rollWithAdvantage = (
  rng: RNG,
  advantage: CheckAdvantage,
): { rolls: number[]; used: number } => {
  const first = rollDie(D20_SIDES, rng);
  if (advantage === 'none') return { rolls: [first], used: first };
  const second = rollDie(D20_SIDES, rng);
  const used = advantage === 'advantage' ? Math.max(first, second) : Math.min(first, second);
  return { rolls: [first, second], used };
};

const resolveAdvantage = (
  requested: CheckAdvantage | undefined,
  derivedAdv: boolean,
  derivedDis: boolean,
): CheckAdvantage => {
  if (requested !== undefined && requested !== 'none') return requested;
  if (derivedAdv && !derivedDis) return 'advantage';
  if (derivedDis && !derivedAdv) return 'disadvantage';
  return 'none';
};

export interface SaveIntent {
  readonly type: 'Save';
  readonly characterId: string;
  readonly ability: AbilityScore;
  readonly dc: number;
  readonly advantage?: CheckAdvantage;
  readonly at?: string;
}

export const planSave = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: SaveIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const derivation = computeSavingThrow({
    character,
    itemInstances: state.itemInstances,
    content,
    ability: intent.ability,
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const used = resolveAdvantage(
    intent.advantage,
    derivation.hasAdvantage,
    derivation.hasDisadvantage,
  );
  const { rolls, used: d20 } = rollWithAdvantage(rng, used);
  const saveBonus = rollSaveBonusDice(derivation.bonusDice, rng);
  const bonus = derivation.total + saveBonus.total;
  const total = d20 + bonus;
  const event: SaveRolledEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'SaveRolled',
    targetId: intent.characterId,
    ability: intent.ability,
    dc: intent.dc,
    d20: rolls,
    used,
    bonus,
    total,
    success: total >= intent.dc,
    breakdown: [...derivation.breakdown, ...saveBonus.breakdown],
  };
  return [event];
};

export interface AbilityCheckIntent {
  readonly type: 'AbilityCheck';
  readonly characterId: string;
  readonly ability: AbilityScore;
  readonly skill?: Skill;
  readonly dc?: number;
  readonly advantage?: CheckAdvantage;
  readonly at?: string;
}

export const planAbilityCheck = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: AbilityCheckIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const derivation = computeAbilityCheck({
    character,
    itemInstances: state.itemInstances,
    content,
    ability: intent.ability,
    ...(intent.skill !== undefined ? { skill: intent.skill } : {}),
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const used = resolveAdvantage(
    intent.advantage,
    derivation.hasAdvantage,
    derivation.hasDisadvantage,
  );
  const { rolls, used: d20 } = rollWithAdvantage(rng, used);
  const total = d20 + derivation.total;
  const event: AbilityCheckRolledEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'AbilityCheckRolled',
    characterId: intent.characterId,
    ability: intent.ability,
    ...(intent.skill !== undefined ? { skill: intent.skill } : {}),
    ...(intent.dc !== undefined ? { dc: intent.dc, success: total >= intent.dc } : {}),
    d20: rolls,
    used,
    bonus: derivation.total,
    total,
    breakdown: [...derivation.breakdown],
  };
  return [event];
};
