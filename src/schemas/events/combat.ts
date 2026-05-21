import { z } from 'zod';
import { ULIDSchema, DamageTypeSchema, AbilityScoreSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

export const DAMAGE_MITIGATION_KINDS = ['resisted', 'immune', 'vulnerable'] as const;
export const DamageMitigationKindSchema = z.enum(DAMAGE_MITIGATION_KINDS);
export type DamageMitigationKind = z.infer<typeof DamageMitigationKindSchema>;

export const DamageComponentSchema = z.object({
  amount: z.number().int().min(0),
  type: DamageTypeSchema,
  rawAmount: z.number().int().min(0).optional(),
  mitigation: DamageMitigationKindSchema.optional(),
});
export type DamageComponent = z.infer<typeof DamageComponentSchema>;

export const DamageAppliedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('DamageApplied'),
  targetId: ULIDSchema,
  components: z.array(DamageComponentSchema).min(1),
  sourceCharacterId: ULIDSchema.optional(),
  source: z.string().optional(),
});
export type DamageAppliedEvent = z.infer<typeof DamageAppliedEventSchema>;

export const HealedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('Healed'),
  targetId: ULIDSchema,
  amount: z.number().int().min(0),
  source: z.string().optional(),
});
export type HealedEvent = z.infer<typeof HealedEventSchema>;

export const TempHPGrantedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('TempHPGranted'),
  targetId: ULIDSchema,
  amount: z.number().int().min(0),
  source: z.string().optional(),
});
export type TempHPGrantedEvent = z.infer<typeof TempHPGrantedEventSchema>;

export const ConditionAppliedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ConditionApplied'),
  targetId: ULIDSchema,
  conditionId: z.string(),
  level: z.number().int().min(1).optional(),
  expiresOnRound: z.number().int().optional(),
  // Companion to `expiresOnRound`. Slice 109; see AppliedCondition
  // for full semantics.
  expiryTrigger: z.enum(['turnStart', 'turnEnd']).optional(),
  appliedConditionId: ULIDSchema.optional(),
  // For sourced conditions (Frightened, Charmed, etc.), the creature
  // that is the source. Stored on the applied-condition entry so
  // planners can enforce "can't move toward source" / "can't attack
  // charmer" rules. Leave undefined for unsourced conditions.
  sourceCharacterId: ULIDSchema.optional(),
  // Pre-computed sum of this condition's `AddModifier { target: 'hpMax' }`
  // effects (Aid's `aid-buffed` carries +5). The planner sets it at cast
  // time using the content pack; the reducer stamps it on the applied-
  // condition entry and bumps `hp.maxBonus`. Removal reverses the same
  // delta without re-running content lookups.
  hpMaxBonusDelta: z.number().int().optional(),
  // Slice 110: parent concentration effect for rider-applied conditions.
  // See AppliedCondition.sourceEffectInstanceId for the full semantics.
  sourceEffectInstanceId: ULIDSchema.optional(),
  // Per-instance fixed-DC recurring save (slice 388). When both are set,
  // `planTickRecurringSave` re-rolls this ability save against `recurringSaveDC`
  // at the end of each of the bearer's turns and removes the condition on a
  // success, WITHOUT requiring the source to be a spellcaster (the existing
  // recurringSave path computes a spell DC). The DC is baked at apply time
  // (Cunning Strike Poison / Knock Out: 8 + the rogue's DEX mod + PB).
  recurringSaveDC: z.number().int().optional(),
  recurringSaveAbility: AbilityScoreSchema.optional(),
});
export type ConditionAppliedEvent = z.infer<typeof ConditionAppliedEventSchema>;

export const ConditionRemovedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ConditionRemoved'),
  targetId: ULIDSchema,
  conditionId: z.string(),
});
export type ConditionRemovedEvent = z.infer<typeof ConditionRemovedEventSchema>;

// Forced movement: the named source attempted to push a creature
// `distanceFeet` away from the source's position. The engine
// doesn't model positions, so this event is purely informational
// (like TriggerFired) — consumers (dndbnb, VTTs) read it and apply
// the position change themselves. RAW examples: Gust of Wind
// pushes 15 ft on a failed STR save; some monster shoves pushed
// directions vary.
export const CreaturePushedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('CreaturePushed'),
  targetId: ULIDSchema,
  distanceFeet: z.number().int().min(0),
  sourceCharacterId: ULIDSchema.optional(),
  source: z.string().optional(),
});
export type CreaturePushedEvent = z.infer<typeof CreaturePushedEventSchema>;

export const ExhaustionChangedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ExhaustionChanged'),
  targetId: ULIDSchema,
  fromLevel: z.number().int().min(0).max(6),
  toLevel: z.number().int().min(0).max(6),
});
export type ExhaustionChangedEvent = z.infer<typeof ExhaustionChangedEventSchema>;

export const DeathSaveRolledEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('DeathSaveRolled'),
  targetId: ULIDSchema,
  d20: z.number().int().min(1).max(20),
  success: z.boolean(),
  critical: z.boolean().default(false),
});
export type DeathSaveRolledEvent = z.infer<typeof DeathSaveRolledEventSchema>;

export const StabilizedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('Stabilized'),
  targetId: ULIDSchema,
});
export type StabilizedEvent = z.infer<typeof StabilizedEventSchema>;

// Slice 323: instant-death outcome that bypasses the death-save
// sequence. Models RAW "destroyed" / "dies instantly" effects (Mace of
// Disruption's destroy-on-failed-save against a low-HP Fiend/Undead, and
// future crit-gated decapitation like the Vorpal Sword). The reducer
// sets hp.current to 0 and death-save failures to the kill threshold, so
// anything reading "dead" via death saves sees a dead creature with no
// intervening death-save rolls. Distinct from DamageApplied: no damage
// is dealt or mitigated; the creature simply dies.
export const CreatureDestroyedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('CreatureDestroyed'),
  targetId: ULIDSchema,
  sourceCharacterId: ULIDSchema.optional(),
  source: z.string().optional(),
});
export type CreatureDestroyedEvent = z.infer<typeof CreatureDestroyedEventSchema>;

export const HPMaxBonusChangedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('HPMaxBonusChanged'),
  targetId: ULIDSchema,
  // Signed delta applied to `Character.hp.maxBonus`. Positive when a
  // buff (Aid, Aspect of the Beast, etc.) goes up; negative when the
  // buff ends. The planner that emits it is responsible for keeping
  // delta-applied / delta-reversed paired across the buff's lifetime.
  delta: z.number().int(),
});
export type HPMaxBonusChangedEvent = z.infer<typeof HPMaxBonusChangedEventSchema>;
