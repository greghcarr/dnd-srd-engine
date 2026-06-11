import { z } from 'zod';
import { EffectSchema } from '../effects.js';
import { AbilityScoreSchema, DamageTypeSchema, DiceExpressionSchema } from '../primitives.js';

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
    // of turn; 'turnEnd' at the end; 'longRest' on a 24-hour cadence
    // outside of combat (Death Dog disease "repeats the save every 24
    // hours that elapse"). Engine doesn't track turn moments or hours
    // directly — this field is metadata that the consumer reads to know
    // when to fire the tick.
    trigger: z.enum(['turnStart', 'turnEnd', 'longRest']).default('turnStart'),
    // What happens on a failed save:
    //   'consumeAction'        = ActionEconomyConsumed (action) for the bearer
    //                            (only emitted when the bearer is a combatant
    //                            in the active encounter).
    //   'dodge'                = forced to take the Dodge action: consumes
    //                            the action AND applies the `dodged`
    //                            condition (so the bearer also gains
    //                            Dodge's defensive benefit), the SRD 5.2.1
    //                            Bestow Curse inactive-turn arm.
    //                            Active-encounter-gated like 'consumeAction'.
    //   'escalateToCondition'  = (slice 488) removes THIS condition and
    //                            applies `escalateToConditionId` instead.
    //                            Canonical user: Cockatrice's Petrifying
    //                            Bite (Restrained on the first failed save,
    //                            escalates to Petrified on the second).
    //                            `escalateToConditionId` is required when
    //                            this variant is set (enforced by the
    //                            refine() below).
    onFail: z.enum(['consumeAction', 'dodge', 'escalateToCondition']).optional(),
    escalateToConditionId: z.string().optional(),
    // What happens on a successful save:
    //   'removeCondition' = ConditionRemoved for this condition on the
    //                       bearer (the spell ends on the target).
    onSuccess: z.enum(['removeCondition']).optional(),
    // Slice 488: fixed DC for the recurring save (no caster spell-DC
    // resolution). Canonical user: Cockatrice's CON DC 11. When set, the
    // planner uses this DC and skips the caster / spellcasting-class
    // resolution entirely; the source caster need not have a spellcasting
    // class. When unset, the planner falls back to the source caster's
    // spell DC (Hold Person, etc.).
    fixedDC: z.number().int().min(1).optional(),
  })
  .refine(
    (rs) => rs.onFail !== undefined || rs.onSuccess !== undefined,
    { message: 'recurringSave requires at least one of onFail / onSuccess' },
  )
  .refine(
    (rs) => rs.onFail !== 'escalateToCondition' || rs.escalateToConditionId !== undefined,
    { message: "recurringSave.onFail 'escalateToCondition' requires escalateToConditionId" },
  );
export type RecurringSave = z.infer<typeof RecurringSaveSchema>;

// Slice 825: recurring damage at the bearer's turn boundary (no save). The
// consumer calls `engine.plan.tickRecurringDamage` at the indicated trigger
// for any condition that declares `recurringDamage`. RAW user: the Bearded
// Devil's infernal wound ("the target loses 5 (1d10) Hit Points at the start
// of each of its turns"). Like `recurringSave`, the engine doesn't track turn
// moments — this is metadata the consumer reads to drive the tick; the
// condition's `autoExpiry` bounds the duration (the wound closes after 1
// minute). The damage is sourced to the condition's `sourceCharacterId` and
// runs the normal mitigation / fatal-intercept / concentration-on-damage
// pipeline. (RAW the loss is untyped Hit Point loss; `damageType` is the
// closest typed approximation — `necrotic` for the infernal wound.)
export const RecurringDamageSchema = z.object({
  dice: DiceExpressionSchema,
  damageType: DamageTypeSchema,
  trigger: z.enum(['turnStart', 'turnEnd']).default('turnStart'),
});
export type RecurringDamage = z.infer<typeof RecurringDamageSchema>;

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
// Slice 623: `expirySourceFromBearer` decouples "whose turn-boundary
// fires the auto-expiry" from `applied.sourceCharacterId`. By default
// the encounter sweep keys on sourceCharacterId (so a condition with
// source = caster expires on the caster's turn-end). Some conditions
// need both source-keyed scoping (for `consumeOnAttack` filters like
// Vex's "advantage on attacks against THIS specific target") AND
// bearer-keyed expiry ("until the end of YOUR next turn"). Set this
// flag true and the sweep ignores sourceCharacterId and instead lifts
// the condition on the BEARER's matching turn boundary. Canonical user
// (slice 623): Vex's vexing-active.
export const AutoExpirySchema = z.object({
  afterRounds: z.number().int().min(0),
  trigger: z.enum(['turnStart', 'turnEnd']),
  expirySourceFromBearer: z.boolean().optional(),
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
  // Slice 811: dev-only engineering annotation (not player-facing); see
  // the note in item.ts ItemBaseSchema. `description` carries clean
  // SRD-style rules text; implementation notes live here.
  engineNotes: z.string().optional(),
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
  recurringDamage: RecurringDamageSchema.optional(),
  autoExpiry: AutoExpirySchema.optional(),
  category: ConditionCategorySchema.optional(),
  // "Next attack roll" one-shot conditions (weapon-mastery Sap / Vex):
  // the attack resolver removes the condition from its bearer after the
  // bearer makes an attack roll, so the advantage/disadvantage applies to
  // exactly one attack. A source-keyed condition (carries
  // `sourceCharacterId`, e.g. Vex's `vexing-active`) is consumed only when
  // the bearer attacks that source; an unkeyed one (Sap's `sapped`) is
  // consumed on any attack. `autoExpiry` still bounds the "if no attack"
  // case (RAW: before the start/end of your next turn).
  consumeOnAttack: z.boolean().optional(),
  // Mirror of `consumeOnAttack`, but for the inverse direction (slice 484):
  // when the BEARER is the TARGET of an attack roll, the attack resolver
  // removes the condition from the bearer after the attack, so any rider
  // (typically `GrantAdvantageToAttackers`) applies to exactly one
  // incoming attack. RAW user: Worg's Bite ("the next attack roll made
  // against the target before the start of the worg's next turn has
  // Advantage"). `autoExpiry` still bounds the "if no attack happens"
  // case (the worg's next turn-start lifts the unused condition).
  // Source-keyed wires are not currently used (any attacker consumes it);
  // can be added later if a future RAW shape needs it.
  consumeOnIncomingAttack: z.boolean().optional(),
  // Slice 577: "Next ability check" one-shot conditions. Mirror of
  // consumeOnAttack at the AbilityCheckRolled site. RAW users: Help
  // (Ability Check mode) — `helped-on-check-active` confers Advantage
  // on the next ability check and lifts; Bardic Inspiration (one of
  // the three consume sites alongside attack + save).
  consumeOnCheck: z.boolean().optional(),
  // Slice 577: "Next saving throw" one-shot conditions. Mirror of
  // consumeOnAttack at the SaveRolled site. RAW users: Bardic
  // Inspiration (one of the three consume sites alongside attack +
  // check).
  consumeOnSave: z.boolean().optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;
