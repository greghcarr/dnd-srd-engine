import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ItemConsumedEvent } from '../../schemas/events/inventory.js';
import type {
  ConditionAppliedEvent,
  ConditionRemovedEvent,
  ExhaustionChangedEvent,
  HealedEvent,
  TempHPGrantedEvent,
} from '../../schemas/events/combat.js';
import { newAppliedConditionId } from '../../ids.js';
import { planCastSpell } from './cast-spell.js';
import type { RNG } from '../../rng/index.js';
import { rollExpression } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

export interface ConsumeItemIntent {
  readonly type: 'ConsumeItem';
  readonly characterId: string;
  readonly instanceId: string;
  // Defaults to characterId when omitted: drinking your own potion.
  // When set to another character, models "feed a potion to an
  // adjacent ally" (Magic action per RAW).
  readonly targetId?: string;
  // Slice 237. Used by `CastSpell` ConsumeActions (spell scrolls)
  // to supply the spell's targets. When omitted on a CastSpell
  // action, defaults to [characterId] (useful for self-buff
  // scrolls like Greater Invisibility).
  readonly castTargetIds?: ReadonlyArray<string>;
  readonly at?: string;
}

/**
 * Slice 235. Consumes a `consumable` item from a character's
 * inventory: walks the item's `onConsume` action list, emits the
 * corresponding effect events (Healed for Heal actions; future
 * slices add ApplyCondition and CastSpell branches), then emits an
 * ItemConsumed event that the reducer uses to remove the instance
 * from inventory + state.itemInstances.
 *
 * Canonical user: Potions of Healing (Healing / Greater / Superior /
 * Supreme), wired with `{ kind: 'Heal', dice, flatAmount }` entries.
 *
 * Validation:
 * - Instance exists in state.itemInstances and in the character's
 *   inventory.
 * - Instance's definition is itemKind = 'consumable'.
 *
 * RAW deviations to be tightened later: no action-economy cost
 * (drinking a potion is a Magic action in combat); no range check
 * when targetId !== characterId (engine doesn't model position).
 */
export const planConsumeItem = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ConsumeItemIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (!character.inventory.includes(intent.instanceId)) {
    throw new Error(`Item ${intent.instanceId} not in ${character.name}'s inventory`);
  }
  const instance = state.itemInstances[intent.instanceId];
  if (!instance) throw new Error(`Unknown item instance ${intent.instanceId}`);
  const def = content.items.get(instance.definitionId);
  if (!def) throw new Error(`Unknown item definition ${instance.definitionId}`);
  if (def.itemKind !== 'consumable') {
    throw new Error(`Item ${def.id} is not a consumable (itemKind: ${def.itemKind})`);
  }

  const at = intent.at ?? nowIso();
  const targetId = intent.targetId ?? intent.characterId;
  const events: Event[] = [];

  for (const action of def.onConsume) {
    if (action.kind === 'Heal') {
      const diceTotal = action.dice !== undefined ? rollExpression(action.dice, rng).total : 0;
      const flat = action.flatAmount ?? 0;
      const amount = diceTotal + flat;
      const healed: HealedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'Healed',
        targetId: targetId as ULID,
        amount,
        source: `item:${def.id}`,
      };
      events.push(healed);
    } else if (action.kind === 'ApplyCondition') {
      // Slice 236: stamp `sourceCharacterId` to the consumer so the
      // condition can be traced back to who drank / fed the potion
      // (useful for "your potion's effects" auras + cleanup at long
      // rest). No `expiresOnRound` — minute/hour durations are
      // consumer-managed (see ConsumeActionSchema doc comment).
      const condApplied: ConditionAppliedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ConditionApplied',
        targetId: targetId as ULID,
        conditionId: action.conditionId,
        appliedConditionId: newAppliedConditionId(),
        sourceCharacterId: intent.characterId as ULID,
      };
      events.push(condApplied);
    } else if (action.kind === 'RemoveConditions') {
      // Slice 283: strip each applied-condition instance whose
      // conditionId is in the action's list. The reducer for
      // ConditionRemoved is no-op when the condition isn't present,
      // so ids the bearer doesn't carry produce zero events. Walk
      // the target's current appliedConditions to emit one event
      // per matched instance (handles multiply-sourced conditions
      // correctly).
      const target = state.characters[targetId];
      if (target) {
        const idSet = new Set(action.conditionIds);
        for (const applied of target.appliedConditions) {
          if (idSet.has(applied.conditionId)) {
            const removed: ConditionRemovedEvent = {
              id: newEventId() as ULID,
              at,
              type: 'ConditionRemoved',
              targetId: targetId as ULID,
              conditionId: applied.conditionId,
            };
            events.push(removed);
          }
        }
      }
    } else if (action.kind === 'RemoveExhaustion') {
      // Slice 283: zero out exhaustion. Emits one ExhaustionChanged
      // from current → 0 only when current > 0 (no-op event when
      // already zero would be misleading audit noise).
      const target = state.characters[targetId];
      if (target && target.exhaustion > 0) {
        const changed: ExhaustionChangedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'ExhaustionChanged',
          targetId: targetId as ULID,
          fromLevel: target.exhaustion,
          toLevel: 0,
        };
        events.push(changed);
      }
    } else if (action.kind === 'GrantTempHP') {
      // Slice 282: flat temp HP grant. The existing applyTempHPGranted
      // reducer (slice 75 origin) enforces RAW max-not-additive
      // semantics so a smaller subsequent grant doesn't override a
      // larger one, and the new value replaces only when strictly
      // greater. Source field tags the audit trail back to the item.
      const tempHPGranted: TempHPGrantedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'TempHPGranted',
        targetId: targetId as ULID,
        amount: action.amount,
        source: `item:${def.id}`,
      };
      events.push(tempHPGranted);
    } else if (action.kind === 'CastSpell') {
      // Slice 237: spell-scroll consumption. Delegate to planCastSpell
      // with noSlotCost (slice 219) and ignorePreparation (slice 220):
      // the scroll itself supplies the slot and the spell-knowledge.
      // castTargetIds on the intent supplies targets; defaults to
      // [consumer] for self-buff scrolls. `castingClassId` from the
      // action (typically 'wizard' for scrolls) lets non-casters read
      // the scroll — planCastSpell's `findCastingClass` would
      // otherwise throw on a Barbarian / Fighter consumer.
      const castTargetIds = intent.castTargetIds ?? [intent.characterId];
      const castEvents = planCastSpell(state, content, rng, {
        type: 'CastSpell',
        characterId: intent.characterId,
        spellId: action.spellId,
        slotLevel: action.slotLevel,
        targetIds: castTargetIds,
        castingClassId: action.castingClassId,
        noSlotCost: true,
        ignorePreparation: true,
        at,
      });
      events.push(...castEvents);
    }
  }

  const consumed: ItemConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ItemConsumed',
    characterId: intent.characterId as ULID,
    instanceId: intent.instanceId as ULID,
    definitionId: instance.definitionId,
    targetId: targetId as ULID,
  };
  events.push(consumed);
  return events;
};
