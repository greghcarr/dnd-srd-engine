import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckFromFlag } from './_halfling-luck.js';
import { newEventId, newAppliedConditionId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import type { Character } from '../../schemas/runtime/character.js';
import { computeAbilityCheck } from '../../derive/ability-check.js';
import { creatureSize } from '../../derive/creature-size.js';
import { SIZES } from '../../schemas/primitives.js';
import { assertActorCanAct } from './_actor-state.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import type { ULID } from '../ids-utils.js';
import type {
  ActionEconomyConsumedEvent,
} from '../../schemas/events/action-economy.js';
import type {
  ConditionAppliedEvent,
} from '../../schemas/events/combat.js';
import type { AbilityCheckRolledEvent } from '../../schemas/events/checks.js';
import type { CombatantMovedEvent } from '../../schemas/events/movement.js';

const UNARMED_DC_BASE = 8;
const HIDE_DEFAULT_DC = 15;
const SHOVE_PUSH_FEET = 5;

const unarmedSaveDC = (character: { abilityScores: { STR: number }; classes: Array<{ level: number }> }): number => {
  const str = abilityModifier(character.abilityScores.STR);
  const prof = proficiencyBonus(computeTotalLevel(character as never));
  return UNARMED_DC_BASE + str + prof;
};

// RAW (rules-glossary.md "Unarmed Strike"): a Grapple / Shove "is
// possible only if the target is no more than one size larger than you".
const MAX_GRAPPLE_SIZE_DIFF = 1;
const assertTargetNotTooLarge = (
  content: ResolvedContent,
  attacker: Character,
  target: Character,
  verb: string,
): void => {
  const diff = SIZES.indexOf(creatureSize(target, content)) - SIZES.indexOf(creatureSize(attacker, content));
  if (diff > MAX_GRAPPLE_SIZE_DIFF) {
    throw new Error(`${attacker.name} can't ${verb} ${target.name}: it is more than one size larger`);
  }
};

// RAW Grapple: "you have a hand free to grab it." A two-handed weapon in
// the main hand occupies both hands; otherwise a hand is free unless the
// main hand AND (an off-hand item or a shield) are both occupied. (Shove
// has no free-hand requirement.) Monsters with empty equip slots — or a
// single natural weapon — keep a free appendage.
const attackerHasFreeHand = (
  state: CampaignState,
  content: ResolvedContent,
  attacker: Character,
): boolean => {
  const { mainHand, offHand, shield } = attacker.equipped;
  if (mainHand !== undefined) {
    const def = content.items.get(state.itemInstances[mainHand]?.definitionId ?? '');
    if (def?.itemKind === 'weapon' && def.properties.includes('two-handed')) return false;
  }
  const handsUsed = (mainHand !== undefined ? 1 : 0) + (offHand !== undefined ? 1 : 0) + (shield !== undefined ? 1 : 0);
  return handsUsed < 2;
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
  // Slice 803: RAW gates the planner skipped — the grappler must be able
  // to act, the target must be no more than one size larger, and the
  // grappler must have a hand free to grab.
  assertActorCanAct(attacker, 'grapple');
  assertTargetNotTooLarge(content, attacker, target, 'grapple');
  if (!attackerHasFreeHand(state, content, attacker)) {
    throw new Error(`${attacker.name} needs a free hand to grapple`);
  }
  const at = intent.at ?? nowIso();
  const ability = intent.targetAbility ?? 'STR';
  const dc = unarmedSaveDC(attacker);
  // Slice 855: route the target's save through the shared rollSaveAgainstDC
  // primitive so it honors save proficiency, Bless/Bane and other bonus dice,
  // advantage/disadvantage, Magic Resistance, and the auto-fail — the same fix
  // slice 853 (Topple) / 854 (Open Hand) made. The old raw `abilityModifier`
  // roll skipped all of them. sourceIsMagical is false: an Unarmed Strike
  // grapple is a nonmagical effect. (Halfling Luck folds into the primitive.)
  const saveResult = rollSaveAgainstDC({
    state,
    content,
    targetId: intent.targetId,
    ability,
    dc,
    sourceIsMagical: false,
    rng,
    at,
  });
  invariant(saveResult !== undefined, `Grapple target ${intent.targetId} not found`);
  const events: Event[] = [];
  const consume = consumeActionIfEncountered(state, intent.attackerId, at);
  if (consume !== undefined) events.push(consume);
  events.push(saveResult.event);
  if (!saveResult.success) {
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
  // Slice 803: RAW gates — the shover must be able to act and the target
  // must be no more than one size larger. (Shove, unlike Grapple, has no
  // free-hand requirement.)
  assertActorCanAct(attacker, 'shove');
  assertTargetNotTooLarge(content, attacker, target, 'shove');
  const at = intent.at ?? nowIso();
  const dc = unarmedSaveDC(attacker);
  // Slice 855: route the target's STR save through the shared rollSaveAgainstDC
  // primitive (see planGrapple) — proficiency, Bless/Bane, advantage, Magic
  // Resistance, auto-fail, Halfling Luck. sourceIsMagical false (nonmagical).
  const saveResult = rollSaveAgainstDC({
    state,
    content,
    targetId: intent.targetId,
    ability: 'STR',
    dc,
    sourceIsMagical: false,
    rng,
    at,
  });
  invariant(saveResult !== undefined, `Shove target ${intent.targetId} not found`);
  const events: Event[] = [];
  const consume = consumeActionIfEncountered(state, intent.attackerId, at);
  if (consume !== undefined) events.push(consume);
  events.push(saveResult.event);
  if (!saveResult.success) {
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
