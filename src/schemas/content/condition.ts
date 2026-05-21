import { z } from 'zod';
import { EffectSchema } from '../effects.js';
import { AbilityScoreSchema } from '../primitives.js';

// Recurring saving-throw metadata. When set, the consumer calls
// `engine.plan.tickRecurringSave` at the indicated trigger moment on
// the bearer's turn; the planner rolls a save against the source
// caster's spell DC, emits a SaveRolled, and applies the configured
// success / failure consequence. Two callers today:
//   1. Bestow Curse "Inactive Turn": onFail consumes the bearer's
//      action; success has no effect (the curse persists).
//   2. Hold Person / Hold Monster / Hideous Laughter / Confusion:
//      onSuccess lifts the spell-bound condition off the bearer (the
//      RAW "the spell ends on the target" pattern); failure has no
//      extra effect (the condition persists into the next turn).
// Source caster + casting class are read from the AppliedCondition's
// `sourceCharacterId` (set by spell planners since slice 88) and the
// caster's primary spellcasting class, with consumer overrides on
// the intent. At least one of `onFail` / `onSuccess` must be set.
export const RecurringSaveSchema = z
  .object({
    ability: AbilityScoreSchema,
    // 'turnStart' fires when the consumer ticks at the bearer's start
    // of turn; 'turnEnd' at the end. Engine doesn't track turn moments
    // directly — this field is metadata that the consumer reads to know
    // when to fire the tick.
    trigger: z.enum(['turnStart', 'turnEnd']).default('turnStart'),
    // What happens on a failed save:
    //   'consumeAction' = ActionEconomyConsumed (action) for the bearer
    //                     (only emitted when the bearer is a combatant
    //                     in the active encounter).
    //   'dodge'         = forced to take the Dodge action: consumes the
    //                     action AND applies the `dodged` condition (so
    //                     the bearer also gains Dodge's defensive
    //                     benefit), the SRD 5.2.1 Bestow Curse
    //                     inactive-turn arm. Active-encounter-gated like
    //                     'consumeAction'.
    onFail: z.enum(['consumeAction', 'dodge']).optional(),
    // What happens on a successful save:
    //   'removeCondition' = ConditionRemoved for this condition on the
    //                       bearer (the spell ends on the target).
    onSuccess: z.enum(['removeCondition']).optional(),
  })
  .refine(
    (rs) => rs.onFail !== undefined || rs.onSuccess !== undefined,
    { message: 'recurringSave requires at least one of onFail / onSuccess' },
  );
export type RecurringSave = z.infer<typeof RecurringSaveSchema>;

// Declarative auto-expiry metadata. When a planner that applies this
// condition runs inside an active encounter, it stamps `expiresOnRound`
// (= currentRound + afterRounds) and `expiryTrigger` on the emitted
// ConditionApplied. `planAdvanceTurn` then auto-lifts the condition at
// the matching moment — `'turnStart'` at the start of the source's
// next turn in the target round (Spirit Shroud's heal-block via the
// `durationRounds` field on the trigger action), `'turnEnd'` at the
// end of the source's turn in the target round (Blade Ward's "1 round"
// self-buff). For self-cast buffs, source == bearer, so turn-end
// expiry fires at the end of the bearer's own next turn per RAW.
// Outside an active encounter the planner doesn't stamp anything and
// the consumer manages expiry.
export const AutoExpirySchema = z.object({
  afterRounds: z.number().int().min(0),
  trigger: z.enum(['turnStart', 'turnEnd']),
});
export type AutoExpiry = z.infer<typeof AutoExpirySchema>;

// Slice 134: removal-category taxonomy. Conditions can mark
// themselves as curse / disease / poison so dedicated removal
// planners (Remove Curse, Lesser Restoration, Greater Restoration,
// etc.) can strip them in bulk. Optional; conditions without a
// category aren't reachable by any of those removers and must be
// stripped through other paths (recurring save, concentration drop,
// dispel magic, etc.). This is intentionally a small fixed enum
// matching the 2024 PHB's named removal interactions; broader
// tagging (e.g. fey-effect, divine-effect) is out of scope.
export const ConditionCategorySchema = z.enum(['curse', 'disease', 'poison']);
export type ConditionCategory = z.infer<typeof ConditionCategorySchema>;

export const ConditionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  effects: z.array(EffectSchema).default([]),
  stackable: z.boolean().default(false),
  endsOn: z
    .array(
      z.union([
        z.object({ kind: z.literal('shortRest') }),
        z.object({ kind: z.literal('longRest') }),
        z.object({ kind: z.literal('turnEnd'), ownerId: z.string().optional() }),
        z.object({ kind: z.literal('saveSuccess'), ability: z.string(), dc: z.number().int() }),
        z.object({ kind: z.literal('damageTaken') }),
      ]),
    )
    .default([]),
  recurringSave: RecurringSaveSchema.optional(),
  autoExpiry: AutoExpirySchema.optional(),
  category: ConditionCategorySchema.optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;
