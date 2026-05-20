import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  ItemDestroyedEvent,
  ItemTimeBudgetConsumedEvent,
  ItemUsedEvent,
} from '../../schemas/events/inventory.js';
import type {
  ConditionAppliedEvent,
  ConditionRemovedEvent,
} from '../../schemas/events/combat.js';
import type { ItemChargeConsumedEvent } from '../../schemas/events/charges.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import { D20_SIDES } from '../../internal/constants.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { planCastSpell } from './cast-spell.js';
import { computeSavingThrow } from '../../derive/save.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import type { UseAction } from '../../schemas/content/item.js';
import type { ULID } from '../ids-utils.js';

// Slice 253. Per-action resolved charge cost + effective CastSpell
// slot level. For variable-cost CastSpell actions (slice 253), the
// consumer's `intent.chargesCost` dial is in [chargesCost,
// chargesCostMax] and the slot scales as `slotLevel + (dial -
// chargesCost)`. For fixed-cost actions, intent.chargesCost must
// either be omitted or equal the action's baseCost (mirrors slice
// 243's actionId-must-match-or-throw discipline; silent-ignore
// would let a UI think it's varying the cost when it's not).
interface ResolvedAction {
  readonly action: UseAction;
  readonly chargesCost: number;
  readonly slotLevel?: number;
}

const resolveActionCharge = (
  action: UseAction,
  intent: UseItemIntent,
  itemDefId: string,
): ResolvedAction => {
  const baseCost = action.chargesCost ?? 1;

  if (action.kind === 'CastSpell' && action.chargesCostMax !== undefined) {
    if (intent.chargesCost === undefined) {
      throw new Error(
        `Item ${itemDefId}: action '${action.actionId ?? action.kind}' has variable chargesCost ` +
          `(range ${baseCost}-${action.chargesCostMax}); UseItemIntent.chargesCost is required`,
      );
    }
    if (intent.chargesCost < baseCost || intent.chargesCost > action.chargesCostMax) {
      throw new Error(
        `Item ${itemDefId}: chargesCost ${intent.chargesCost} must be in [${baseCost}, ${action.chargesCostMax}]`,
      );
    }
    return {
      action,
      chargesCost: intent.chargesCost,
      slotLevel: action.slotLevel + (intent.chargesCost - baseCost),
    };
  }

  if (intent.chargesCost !== undefined && intent.chargesCost !== baseCost) {
    throw new Error(
      `Item ${itemDefId}: action '${action.actionId ?? action.kind}' has fixed chargesCost ${baseCost}; UseItemIntent.chargesCost ${intent.chargesCost} does not match`,
    );
  }
  return {
    action,
    chargesCost: baseCost,
    slotLevel: action.kind === 'CastSpell' ? action.slotLevel : undefined,
  };
};

// Slice 243. Resolve which actions to fire on this use. Single-action
// items keep the slice-240 back-compat (fire the only entry); multi-
// action items REQUIRE the consumer to pass `actionId` so the planner
// fires exactly one. Throws on actionId mismatch or on a multi-action
// item with no actionId on the intent.
const selectFiredActions = (
  onUse: ReadonlyArray<UseAction>,
  actionId: string | undefined,
  itemDefId: string,
): ReadonlyArray<UseAction> => {
  if (onUse.length === 0) return [];
  if (onUse.length === 1) {
    const only = onUse[0]!;
    if (actionId !== undefined && only.actionId !== undefined && only.actionId !== actionId) {
      throw new Error(
        `Item ${itemDefId} has no action with id '${actionId}'; available: '${only.actionId}'`,
      );
    }
    return [only];
  }
  if (actionId === undefined) {
    const available = onUse
      .map((a) => a.actionId ?? '(unnamed)')
      .join(', ');
    throw new Error(
      `Item ${itemDefId} has multiple onUse actions; UseItemIntent.actionId is required (available: ${available})`,
    );
  }
  const match = onUse.find((a) => a.actionId === actionId);
  if (match === undefined) {
    const available = onUse
      .map((a) => a.actionId ?? '(unnamed)')
      .join(', ');
    throw new Error(
      `Item ${itemDefId} has no action with id '${actionId}'; available: ${available}`,
    );
  }
  return [match];
};

export interface UseItemIntent {
  readonly type: 'UseItem';
  readonly characterId: string;
  readonly instanceId: string;
  // Defaults to characterId when omitted: activating the item on
  // yourself (the common case for boots, cloaks, rings). When set to
  // another character, models "use the item on an adjacent ally"
  // (rare; not all items support it, but the planner stays
  // shape-agnostic about RAW range).
  readonly targetId?: string;
  // Slice 241. Used by `CastSpell` UseActions (spell-grant items
  // like Hat of Disguise / Boots of Levitation) to supply the spell's
  // targets. When omitted on a CastSpell action, defaults to
  // [characterId] (useful for self-buff spell-grant items, which is
  // the typical RAW shape — Boots of Levitation casts Levitate on
  // the wearer, Hat of Disguise casts Disguise Self on the wearer).
  readonly castTargetIds?: ReadonlyArray<string>;
  // Slice 243. Selector for multi-action items (Staff of Healing's
  // three spell arms, Gem of Brightness's three actions, etc.).
  // When the item's `onUse` has > 1 entry, this field is required
  // and must match exactly one action's `actionId`; the planner
  // fires only that action. When `onUse` has exactly 1 entry, this
  // field is optional (back-compat with slice 240).
  readonly actionId?: string;
  // Slice 253. Variable-cost dial for CastSpell actions with
  // `chargesCostMax` set (Wand of Magic Missiles: 1-3 charges → L1-L3
  // Magic Missile; Wand of Fireballs: 1-7 → L3-L9; Staff of Healing's
  // Cure Wounds arm: 1-4 → L1-L4). Required for variable actions;
  // must be omitted (or equal the fixed cost) for fixed actions. The
  // CastSpell's effective slot level scales linearly with the dial:
  // `slotLevel + (chargesCost - action.chargesCost)`. The total
  // charge debit is `chargesCost`, replacing the default of 1 per
  // fired action.
  readonly chargesCost?: number;
  // Slice 286. Target list for the `Save` UseAction variant (Pipes
  // of Haunting and similar item-fixed-DC save actions). RAW: "each
  // creature of your choice within 30 feet" — the engine doesn't
  // model positions, so the 30-foot scope is consumer territory.
  // Required (non-empty) when the fired action is a Save; ignored
  // for other action kinds.
  readonly saveTargetIds?: ReadonlyArray<string>;
  // Slice 293. Cumulative activation time the consumer is reporting
  // on this use, drawn against the item definition's
  // `timeBudget.maxMinutesPerLongRest` pool. Boots of Speed
  // (10 min/LR) is the canonical user: the consumer reports
  // `minutesElapsed` on the toggle-off intent, the planner emits
  // ItemTimeBudgetConsumed, and the reducer increments the
  // instance's `minutesUsed` field. On toggle-on, the planner
  // validates `minutesUsed < max` and throws when the budget is
  // exhausted (RAW: "the magic ceases to function until you finish
  // a Long Rest"). Ignored for items without `timeBudget` and for
  // action kinds other than Toggle.
  readonly minutesElapsed?: number;
  readonly at?: string;
}

/**
 * Slice 240. Activates a magic item: validates the instance, decrements
 * charges (if the definition carries the `charges` shape), walks the
 * item's `onUse` action list emitting the corresponding effect events
 * (ConditionApplied for ApplyCondition variants; SpellCastDeclared +
 * the spell's chain for slice-241's CastSpell variants), then emits an
 * ItemUsed event as a journal marker.
 *
 * Unlike planConsumeItem, the instance persists after activation.
 *
 * Canonical users:
 * - Slice 240: Wings of Flying (rare wondrous, attunement; 1/dawn
 *   charges; onUse applies the `flying-active` condition).
 * - Slice 241: Boots of Levitation + Hat of Disguise (rare /
 *   uncommon, at-will, no charges; CastSpell variant delegates to
 *   planCastSpell with noSlotCost + ignorePreparation).
 *
 * Validation:
 * - Instance exists in state.itemInstances and in the character's
 *   inventory.
 * - Instance's definition is itemKind = 'magic'.
 * - If the definition has `charges`, the instance has at least 1
 *   charge remaining.
 *
 * RAW deviations to be tightened later: no action-economy cost (RAW
 * varies — bonus action for Wings of Flying, action for some others);
 * no attunement gate (the engine has attunement state but consumers
 * can use unattuned items freely through this planner); no range
 * check when targetId !== characterId (engine doesn't model
 * position); item-fixed spell DC not used (the engine uses the
 * consumer's stats, not the RAW per-item DC).
 */
export const planUseItem = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: UseItemIntent,
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
  if (def.itemKind !== 'magic') {
    throw new Error(`Item ${def.id} is not a magic item (itemKind: ${def.itemKind})`);
  }

  const at = intent.at ?? nowIso();
  const targetId = intent.targetId ?? intent.characterId;
  const events: Event[] = [];

  // Slice 243. Action-selector for multi-action items. When the item
  // has > 1 onUse entry, the consumer must pass `actionId` and the
  // planner fires only the matching action. When the item has
  // exactly 1 entry, the planner fires that single action (whether
  // or not the consumer passes actionId — back-compat with slices
  // 240-242). If actionId is set but doesn't match any onUse entry,
  // throw.
  const firedActions = selectFiredActions(def.onUse, intent.actionId, def.id);
  // Slice 253. Per-action resolution: fold the variable-cost dial
  // (intent.chargesCost) into each fired action up front so the charge
  // gate sees the right total and CastSpell sees the right effective
  // slot. Validation throws (variable action without a dial, dial out
  // of range, dial-on-fixed-mismatch) happen here, not later.
  const resolvedActions = firedActions.map((a) => resolveActionCharge(a, intent, def.id));

  // Charge gate: when the definition carries `charges`, sum the
  // resolved chargesCost across fired actions. Validate the item has
  // at least that many charges and emit a single ItemChargeConsumed
  // for the total. When the definition has no `charges` shape, fired
  // actions still resolve but no charge decrement happens (and a
  // non-zero chargesCost is silently ignored, since the item carries
  // no charge pool to draw from).
  //
  // Slice 256: track whether this use spent the item's final charge,
  // so the post-action degradation-roll block (below) can fire when
  // the def carries a `destructionRoll` with `trigger:
  // 'lastChargeExpended'`. RAW: "If you expend the last charge, roll
  // 1d20. On a 1, the wand crumbles into ashes."
  let lastChargeExpended = false;
  if (def.charges !== undefined) {
    const totalChargesCost = resolvedActions.reduce((sum, r) => sum + r.chargesCost, 0);
    const remaining = instance.chargesRemaining ?? 0;
    if (remaining < totalChargesCost) {
      throw new Error(
        `Item ${def.id} has ${remaining} charges remaining, needs ${totalChargesCost}`,
      );
    }
    if (totalChargesCost > 0) {
      const charge: ItemChargeConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ItemChargeConsumed',
        itemInstanceId: intent.instanceId as ULID,
        amount: totalChargesCost,
        byCharacterId: intent.characterId as ULID,
        forEffect: `use:${def.id}`,
      };
      events.push(charge);
      lastChargeExpended = remaining === totalChargesCost;
    }
  }

  for (const { action, slotLevel } of resolvedActions) {
    if (action.kind === 'ApplyCondition') {
      // Mirror of slice 236's ConsumeAction ApplyCondition: stamp
      // `sourceCharacterId` to the user so the condition can be
      // traced back. No `expiresOnRound` — minute / hour durations
      // are consumer-managed.
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
    } else if (action.kind === 'Toggle') {
      // Slice 242. Click-on / click-off shape. Inspect the target's
      // current applied conditions; if `conditionId` is present, emit
      // ConditionRemoved (toggle off). Otherwise emit ConditionApplied
      // (toggle on). The target defaults to the user, matching the
      // typical self-buff toggle (Boots of Speed wearer clicks heels
      // → speed-doubled or normal). Distinct from ApplyCondition,
      // which always applies (the engine's reducer dedupes by id but
      // the per-use intent stays "always activate"): Toggle is the
      // explicit two-state semantic.
      const target = state.characters[targetId];
      const alreadyApplied =
        target?.appliedConditions.some((c) => c.conditionId === action.conditionId) ?? false;
      // Slice 293. Time-budget gate. When the def carries a
      // `timeBudget`, toggle-on is blocked once cumulative
      // `minutesUsed` reaches the cap (Boots of Speed: 10 min/LR).
      // On toggle-off, the consumer-reported `minutesElapsed`
      // emits ItemTimeBudgetConsumed which increments the
      // counter; the reducer applies the increment and the next
      // toggle-on rechecks the gate. Long Rest resets the counter
      // for all participants' inventory.
      if (def.timeBudget !== undefined) {
        const used = instance.minutesUsed ?? 0;
        const max = def.timeBudget.maxMinutesPerLongRest;
        if (!alreadyApplied && used >= max) {
          throw new Error(
            `Item ${def.id} has exhausted its ${max}-minute-per-long-rest budget (used ${used}); finish a Long Rest to reset`,
          );
        }
      }
      if (alreadyApplied) {
        const removed: ConditionRemovedEvent = {
          id: newEventId() as ULID,
          at,
          type: 'ConditionRemoved',
          targetId: targetId as ULID,
          conditionId: action.conditionId,
        };
        events.push(removed);
        if (
          def.timeBudget !== undefined &&
          intent.minutesElapsed !== undefined &&
          intent.minutesElapsed > 0
        ) {
          const tb: ItemTimeBudgetConsumedEvent = {
            id: newEventId() as ULID,
            at,
            type: 'ItemTimeBudgetConsumed',
            instanceId: intent.instanceId as ULID,
            amountMinutes: intent.minutesElapsed,
            byCharacterId: intent.characterId as ULID,
          };
          events.push(tb);
        }
      } else {
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
      }
    } else if (action.kind === 'Save') {
      // Slice 286. Item-fixed-DC save action (Pipes of Haunting).
      // The consumer specifies targets via intent.saveTargetIds
      // (engine doesn't model positions, so the 30-ft scope is
      // consumer territory). For each target the planner rolls
      // a save, emits SaveRolled, and on failure emits
      // ConditionApplied for action.conditionOnFail with
      // sourceCharacterId = the item's user. The 1-minute / 24-
      // hour-immunity duration is consumer-managed.
      const targetIds = intent.saveTargetIds;
      if (targetIds === undefined || targetIds.length === 0) {
        throw new Error(
          `Item ${def.id}: Save action requires UseItemIntent.saveTargetIds (>= 1 target)`,
        );
      }
      const sourceIsMagical = action.sourceIsMagical ?? true;
      for (const saveTargetId of targetIds) {
        const target = state.characters[saveTargetId];
        if (!target) continue;
        const saveDerivation = computeSavingThrow({
          character: target,
          itemInstances: state.itemInstances,
          content,
          ability: action.saveAbility,
          characters: state.characters,
          sourceIsMagical,
        });
        const rolls: number[] = [rollDie(D20_SIDES, rng)];
        if (saveDerivation.hasAdvantage || saveDerivation.hasDisadvantage) {
          rolls.push(rollDie(D20_SIDES, rng));
        }
        const used = saveDerivation.hasAdvantage
          ? 'advantage'
          : saveDerivation.hasDisadvantage
            ? 'disadvantage'
            : 'none';
        const usedD20 = saveDerivation.hasAdvantage
          ? Math.max(...rolls)
          : saveDerivation.hasDisadvantage
            ? Math.min(...rolls)
            : rolls[0]!;
        const total = usedD20 + saveDerivation.total;
        const success = total >= action.saveDC;
        const saveEvent: SaveRolledEvent = {
          id: newEventId() as ULID,
          at,
          type: 'SaveRolled',
          targetId: saveTargetId as ULID,
          ability: action.saveAbility,
          dc: action.saveDC,
          d20: rolls,
          used,
          bonus: saveDerivation.total,
          total,
          success,
          breakdown: [...saveDerivation.breakdown],
        };
        events.push(saveEvent);
        if (!success) {
          const condApplied: ConditionAppliedEvent = {
            id: newEventId() as ULID,
            at,
            type: 'ConditionApplied',
            targetId: saveTargetId as ULID,
            conditionId: action.conditionOnFail,
            appliedConditionId: newAppliedConditionId(),
            sourceCharacterId: intent.characterId as ULID,
          };
          events.push(condApplied);
        }
      }
    } else if (action.kind === 'CastSpell') {
      // Slice 241. Mirror of slice 237's ConsumeAction CastSpell:
      // delegate to planCastSpell with slice-219's `noSlotCost` and
      // slice-220's `ignorePreparation` (the item supplies the
      // slot; the item itself is the spell-knowledge proxy).
      // `castingClassId` from the action lets non-casters wear the
      // item — same shape as scrolls. Targets default to [user] so
      // that the typical RAW self-buff spell-grant items (Hat of
      // Disguise, Boots of Levitation) Just Work without
      // consumer-side target selection.
      const castTargetIds = intent.castTargetIds ?? [intent.characterId];
      // Slice 253: `slotLevel` comes from the resolved action so the
      // variable-cost dial scales the cast (e.g. Wand of Magic
      // Missiles fired with chargesCost=3 casts at slot 3). For
      // fixed-cost CastSpell, `slotLevel` is the action's static
      // `slotLevel`, unchanged from slice 241.
      const castEvents = planCastSpell(state, content, rng, {
        type: 'CastSpell',
        characterId: intent.characterId,
        spellId: action.spellId,
        slotLevel: slotLevel ?? action.slotLevel,
        targetIds: castTargetIds,
        castingClassId: action.castingClassId,
        noSlotCost: true,
        ignorePreparation: true,
        at,
      });
      events.push(...castEvents);
    }
  }

  const used: ItemUsedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ItemUsed',
    characterId: intent.characterId as ULID,
    instanceId: intent.instanceId as ULID,
    definitionId: instance.definitionId,
    targetId: targetId as ULID,
  };
  events.push(used);

  // Slice 256. Degradation roll. Fires only when (a) the def carries
  // a `destructionRoll` with `trigger: 'lastChargeExpended'`, (b) the
  // charge block above marked `lastChargeExpended = true` (final
  // charge spent on this use), and (c) the rolled die result is in
  // the def's `destroyOn` set. The roll is consumed here in the
  // planner (the only place RNG flows) and the result is baked on
  // the emitted ItemDestroyed so apply() stays RNG-free and replay
  // reproduces the same destruction outcome.
  if (lastChargeExpended && def.destructionRoll?.trigger === 'lastChargeExpended') {
    const rollResult = rollDie(def.destructionRoll.die, rng);
    if (def.destructionRoll.destroyOn.includes(rollResult)) {
      const destroyed: ItemDestroyedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ItemDestroyed',
        characterId: intent.characterId as ULID,
        instanceId: intent.instanceId as ULID,
        definitionId: instance.definitionId,
        reason: 'degradation-roll',
        rollDie: def.destructionRoll.die,
        rollResult,
      };
      events.push(destroyed);
    }
  }

  return events;
};
