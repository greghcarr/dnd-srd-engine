import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckFromFlag, applyHalflingLuckForCharacter } from './_halfling-luck.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { computeAbilityCheck } from '../../derive/ability-check.js';
import type { ULID } from '../ids-utils.js';
import type {
  ActionEconomyConsumedEvent,
} from '../../schemas/events/action-economy.js';
import type {
  ConditionAppliedEvent,
} from '../../schemas/events/combat.js';
import type { SaveRolledEvent, AbilityCheckRolledEvent } from '../../schemas/events/checks.js';
import type { CombatantMovedEvent } from '../../schemas/events/movement.js';

const UNARMED_DC_BASE = 8;
const HIDE_DEFAULT_DC = 15;
const SHOVE_PUSH_FEET = 5;

const unarmedSaveDC = (character: { abilityScores: { STR: number }; classes: Array<{ level: number }> }): number => {
  const str = abilityModifier(character.abilityScores.STR);
  const prof = proficiencyBonus(computeTotalLevel(character as never));
  return UNARMED_DC_BASE + str + prof;
};

const consumeActionIfEncountered = (
  state: CampaignState,
  attackerId: string,
  at: string,
): ActionEconomyConsumedEvent | undefined => {
  if (state.activeEncounterId === undefined) return undefined;
  const encounter = state.encounters[state.activeEncounterId];
  if (encounter === undefined) return undefined;
  if (!encounter.combatants.some((c) => c.combatantId === attackerId)) return undefined;
  return {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: encounter.id,
    combatantId: attackerId,
    kind: 'action',
  };
};

export interface GrappleIntent {
  readonly type: 'Grapple';
  readonly attackerId: string;
  readonly targetId: string;
  readonly targetAbility?: 'STR' | 'DEX';
  readonly at?: string;
}

export const planGrapple = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: GrappleIntent,
): ReadonlyArray<Event> => {
  const attacker = state.characters[intent.attackerId];
  invariant(attacker !== undefined, `Attacker ${intent.attackerId} not found`);
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);
  const at = intent.at ?? nowIso();
  const ability = intent.targetAbility ?? 'STR';
  const dc = unarmedSaveDC(attacker);
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on contested target save.
  const d20 = applyHalflingLuckForCharacter(rolls[0]!, intent.targetId, state, content, rolls, rng);
  const bonus = abilityModifier(target.abilityScores[ability]);
  const total = d20 + bonus;
  const success = total >= dc;
  const events: Event[] = [];
  const consume = consumeActionIfEncountered(state, intent.attackerId, at);
  if (consume !== undefined) events.push(consume);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.targetId,
    ability,
    dc,
    d20: [d20],
    used: 'none',
    bonus,
    total,
    success,
  } satisfies SaveRolledEvent);
  if (!success) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: intent.targetId,
      conditionId: 'grappled',
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent);
  }
  return events;
};

export interface ShoveIntent {
  readonly type: 'Shove';
  readonly attackerId: string;
  readonly targetId: string;
  readonly mode: 'prone' | 'push';
  readonly at?: string;
}

export const planShove = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ShoveIntent,
): ReadonlyArray<Event> => {
  const attacker = state.characters[intent.attackerId];
  invariant(attacker !== undefined, `Attacker ${intent.attackerId} not found`);
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);
  const at = intent.at ?? nowIso();
  const dc = unarmedSaveDC(attacker);
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on contested target STR save.
  const d20 = applyHalflingLuckForCharacter(rolls[0]!, intent.targetId, state, content, rolls, rng);
  const bonus = abilityModifier(target.abilityScores.STR);
  const total = d20 + bonus;
  const success = total >= dc;
  const events: Event[] = [];
  const consume = consumeActionIfEncountered(state, intent.attackerId, at);
  if (consume !== undefined) events.push(consume);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.targetId,
    ability: 'STR',
    dc,
    d20: [d20],
    used: 'none',
    bonus,
    total,
    success,
  } satisfies SaveRolledEvent);
  if (!success) {
    if (intent.mode === 'prone') {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: intent.targetId,
        conditionId: 'prone',
        appliedConditionId: newAppliedConditionId(),
      } satisfies ConditionAppliedEvent);
    } else {
      const encounter = state.activeEncounterId !== undefined
        ? state.encounters[state.activeEncounterId]
        : undefined;
      const combatant = encounter?.combatants.find((c) => c.combatantId === intent.targetId);
      if (combatant?.position !== undefined) {
        const attackerCombatant = encounter?.combatants.find((c) => c.combatantId === intent.attackerId);
        const attackerPos = attackerCombatant?.position;
        const dx = attackerPos !== undefined
          ? Math.sign(combatant.position.x - attackerPos.x) || 1
          : 1;
        const dy = attackerPos !== undefined
          ? Math.sign(combatant.position.y - attackerPos.y) || 0
          : 0;
        const cellSize = 5;
        const targetCells = SHOVE_PUSH_FEET / cellSize;
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'CombatantMoved',
          encounterId: encounter!.id,
          combatantId: intent.targetId,
          fromPosition: { x: combatant.position.x, y: combatant.position.y },
          toPosition: {
            x: combatant.position.x + dx * targetCells,
            y: combatant.position.y + dy * targetCells,
          },
          feetTraveled: SHOVE_PUSH_FEET,
        } satisfies CombatantMovedEvent);
      }
    }
  }
  return events;
};

export interface HideIntent {
  readonly type: 'Hide';
  readonly characterId: string;
  readonly dc?: number;
  readonly at?: string;
}

export const planHide = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: HideIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  invariant(character !== undefined, `Character ${intent.characterId} not found`);
  const at = intent.at ?? nowIso();
  const dc = intent.dc ?? HIDE_DEFAULT_DC;
  const derivation = computeAbilityCheck({
    character,
    itemInstances: state.itemInstances,
    content,
    ability: 'DEX',
    skill: 'stealth',
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on Hide DEX (Stealth) check.
  const d20 = applyHalflingLuckFromFlag(rolls[0]!, derivation.hasHalflingLuck, rolls, rng);
  const total = d20 + derivation.total;
  const success = total >= dc;
  const events: Event[] = [];
  const consume = consumeActionIfEncountered(state, intent.characterId, at);
  if (consume !== undefined) events.push(consume);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'AbilityCheckRolled',
    characterId: intent.characterId,
    ability: 'DEX',
    skill: 'stealth',
    dc,
    success,
    d20: [d20],
    used: 'none',
    bonus: derivation.total,
    total,
  } satisfies AbilityCheckRolledEvent);
  if (success) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionApplied',
      targetId: intent.characterId,
      conditionId: 'invisible',
      appliedConditionId: newAppliedConditionId(),
    } satisfies ConditionAppliedEvent);
  }
  return events;
};
