import { z } from 'zod';
import { ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

export const ACTION_ECONOMY_KINDS = ['action', 'bonusAction', 'reaction', 'attack'] as const;
export const ActionEconomyKindSchema = z.enum(ACTION_ECONOMY_KINDS);
export type ActionEconomyKind = z.infer<typeof ActionEconomyKindSchema>;

export const ActionEconomyConsumedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ActionEconomyConsumed'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  kind: ActionEconomyKindSchema,
});
export type ActionEconomyConsumedEvent = z.infer<typeof ActionEconomyConsumedEventSchema>;

// Barbarian Reckless Attack toggle. Set on the combatant's turnUsage
// before their first attack. Persists until their next TurnStarted.
export const RecklessAttackActivatedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('RecklessAttackActivated'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
});
export type RecklessAttackActivatedEvent = z.infer<typeof RecklessAttackActivatedEventSchema>;

// Slice 646: Rogue L3 Steady Aim. Sets two turnUsage flags on the
// combatant: `steadyAimActive` (next attack roll this turn gets
// advantage; cleared by attack resolution) and
// `speedZeroUntilEndOfTurn` (move planner rejects until TurnStarted
// clears it). RAW: "As a Bonus Action, you give yourself Advantage
// on your next attack roll on the current turn ... after you use it,
// your Speed is 0 until the end of the current turn."
export const SteadyAimActivatedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SteadyAimActivated'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
});
export type SteadyAimActivatedEvent = z.infer<typeof SteadyAimActivatedEventSchema>;

// Slice 646: emitted by `planAttack` (or any future planner that
// consumes a Steady Aim advantage) after the attack roll resolves
// against a target. The reducer clears the combatant's
// `steadyAimActive` flag so subsequent attacks this turn don't also
// gain advantage. RAW: only the NEXT attack benefits — this event
// enforces that.
export const SteadyAimConsumedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SteadyAimConsumed'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
});
export type SteadyAimConsumedEvent = z.infer<typeof SteadyAimConsumedEventSchema>;

// Slice 647: Rogue Thief subclass L3 Fast Hands. Bonus-action
// dispatch marker — the consumer pairs this with a follow-up
// sub-planner (planAbilityCheck for sleight-of-hand picks,
// planUtilize for object interaction, planUseItem for magic-item
// activation). The event records that the BA was specifically Fast
// Hands and which mode was chosen, making transcripts readable.
// No reducer state mutation — the BA-used flag (set by the paired
// ActionEconomyConsumed event) is the only persistent effect.
export const FastHandsActivatedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('FastHandsActivated'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  mode: z.enum(['sleightOfHand', 'utilize', 'useMagicItem']),
});
export type FastHandsActivatedEvent = z.infer<typeof FastHandsActivatedEventSchema>;

// Slice 648: Monk L3 Deflect Attacks. Reaction marker emitted when
// the monk reduces an incoming attack's B/P/S damage. Records the
// rolled reduction amount, the incoming damage before reduction,
// and the remaining damage after reduction. The consumer subtracts
// the reduction from the pending DamageApplied (the engine's
// damage pipeline doesn't yet auto-integrate reaction reductions;
// damage-pipeline integration is a deferred follow-up).
export const DeflectAttacksUsedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('DeflectAttacksUsed'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  triggeringAttackEventId: ULIDSchema,
  reduction: z.number().int().min(0),
  incomingDamage: z.number().int().min(0),
  remainingDamage: z.number().int().min(0),
});
export type DeflectAttacksUsedEvent = z.infer<typeof DeflectAttacksUsedEventSchema>;

// Monk Stunning Strike attempt marker. Records the monk used their
// once-per-turn Stunning Strike; the reducer sets the corresponding
// turnUsage flag. The actual save + condition application are emitted
// as separate SaveRolled + ConditionApplied events.
export const StunningStrikeAttemptedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('StunningStrikeAttempted'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  targetId: ULIDSchema,
});
export type StunningStrikeAttemptedEvent = z.infer<typeof StunningStrikeAttemptedEventSchema>;

// Slice 467: Savage Attacker (Origin Feat) marker. Records the
// attacker used their once-per-turn weapon-damage-dice reroll; the
// reducer sets the turnUsage.savageAttackerUsedThisTurn flag. Emitted
// only when the reroll actually fired (the attack hit and the
// alternate set was rolled), so a missed swing with useSavageAttacker
// true does NOT consume the per-turn use. `discardedRolls` carries
// the rejected set for transcript visibility; the kept set lives on
// the sibling DamageRolled event.
export const SavageAttackerUsedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('SavageAttackerUsed'),
  attackerId: ULIDSchema,
  targetId: ULIDSchema,
  weaponInstanceId: ULIDSchema,
  encounterId: ULIDSchema.optional(),
  combatantId: ULIDSchema.optional(),
  discardedRolls: z.array(z.number().int().min(1)),
  causedByEventId: ULIDSchema.optional(),
});
export type SavageAttackerUsedEvent = z.infer<typeof SavageAttackerUsedEventSchema>;

// Slice 572: RAW PHB 2024 Ready action. Records that the combatant
// took the Ready action on their turn, consuming their Action and
// pending a Reaction that will fire when the named trigger happens.
// The reducer marks `turnUsage.readiedAction = { trigger }` (and
// `actionUsed: true` via the sibling ActionEconomyConsumed event the
// planner emits). The trigger description is a consumer-supplied
// free-form string ("when the goblin enters the room") that the
// engine doesn't itself interpret; the consumer determines when the
// trigger fires and invokes the readied planner (a follow-up engine
// surface; for now the readied action is a state marker only).
export const ActionReadiedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ActionReadied'),
  encounterId: ULIDSchema,
  combatantId: ULIDSchema,
  trigger: z.string(),
});
export type ActionReadiedEvent = z.infer<typeof ActionReadiedEventSchema>;
