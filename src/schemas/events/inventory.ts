import { z } from 'zod';
import { ItemInstanceSchema } from '../runtime/item-instance.js';
import { AbilityScoreSchema, DamageTypeSchema, ULIDSchema } from '../primitives.js';
import { EventEnvelopeSchema } from './envelope.js';

export const ItemAcquiredEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemAcquired'),
  instance: ItemInstanceSchema,
  // Slice 499: when set, the reducer also pushes the new instance id
  // onto this character's `inventory` (so it's reachable by
  // `engine.plan.consumeItem` / `useItem`). Omitted for the historical
  // "register the instance in the world, ownership tracked elsewhere"
  // flow (weapons referenced by id in attacks, loot pools, etc.).
  // Canonical user: Goodberry's `create-item` mechanic, which mints the
  // berries straight into the caster's inventory.
  characterId: ULIDSchema.optional(),
});
export type ItemAcquiredEvent = z.infer<typeof ItemAcquiredEventSchema>;

export const EQUIP_SLOTS = ['mainHand', 'offHand', 'armor', 'shield'] as const;
export const EquipSlotSchema = z.enum(EQUIP_SLOTS);
export type EquipSlot = z.infer<typeof EquipSlotSchema>;

export const ItemEquippedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemEquipped'),
  characterId: ULIDSchema,
  instanceId: ULIDSchema,
  slot: EquipSlotSchema,
});
export type ItemEquippedEvent = z.infer<typeof ItemEquippedEventSchema>;

export const ItemUnequippedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemUnequipped'),
  characterId: ULIDSchema,
  slot: EquipSlotSchema,
});
export type ItemUnequippedEvent = z.infer<typeof ItemUnequippedEventSchema>;

export const ItemAttunedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemAttuned'),
  characterId: ULIDSchema,
  instanceId: ULIDSchema,
});
export type ItemAttunedEvent = z.infer<typeof ItemAttunedEventSchema>;

export const ItemUnattunedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemUnattuned'),
  characterId: ULIDSchema,
  instanceId: ULIDSchema,
});
export type ItemUnattunedEvent = z.infer<typeof ItemUnattunedEventSchema>;

export const ItemBuffAppliedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemBuffApplied'),
  instanceId: ULIDSchema,
  attackBonus: z.number().int().default(0),
  damageBonus: z.number().int().default(0),
  extraDamageDice: z.string().optional(),
  extraDamageType: DamageTypeSchema.optional(),
  // Slice 501: Shillelagh-style weapon transformation (see ItemTemporaryBuff).
  abilityOverride: AbilityScoreSchema.optional(),
  damageDieOverride: z.string().optional(),
  damageTypeOverride: DamageTypeSchema.optional(),
  // Slice 501: optional — non-concentration buffs (Shillelagh) omit it.
  sourceEffectInstanceId: ULIDSchema.optional(),
  source: z.string().optional(),
});
export type ItemBuffAppliedEvent = z.infer<typeof ItemBuffAppliedEventSchema>;

export const ItemBuffRemovedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemBuffRemoved'),
  instanceId: ULIDSchema,
});
export type ItemBuffRemovedEvent = z.infer<typeof ItemBuffRemovedEventSchema>;

// Slice 235: a consumable item is consumed by a character. The
// reducer removes the instance from the character's inventory and
// from state.itemInstances. The planner emits the item's
// onConsume effects (Healed events, etc.) before this event in the
// chain. `targetId` is the recipient of those effects (defaults to
// the consumer when the consumer drinks the potion themselves; can
// be a different character when one character feeds a potion to
// another, as RAW permits).
export const ItemConsumedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemConsumed'),
  characterId: ULIDSchema,
  instanceId: ULIDSchema,
  definitionId: z.string(),
  targetId: ULIDSchema,
});
export type ItemConsumedEvent = z.infer<typeof ItemConsumedEventSchema>;

// Slice 891: Ammunition expended on a ranged attack (`delta: -1`) or recovered
// after a fight (`delta: +floor(spent/2)`, RAW "recover half the ammunition you
// used"). The reducer adds `delta` to the named stack's `quantity`; the stack
// retires (instance removed) when its quantity reaches 0. Unlike ItemConsumed
// (which retires the whole instance), this decrements a stack — you fire one
// arrow from a quiver of 20, leaving 19.
export const AmmunitionQuantityChangedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('AmmunitionQuantityChanged'),
  characterId: ULIDSchema,
  instanceId: ULIDSchema,
  definitionId: z.string(),
  delta: z.number().int(),
});
export type AmmunitionQuantityChangedEvent = z.infer<typeof AmmunitionQuantityChangedEventSchema>;

// Slice 240: a magic item is used by a character (activate-as-action
// shape). Unlike ItemConsumed, the instance persists after use; this
// event is a journal marker for the use, after the planner has
// already emitted the charge decrement (ItemChargeConsumed) and the
// onUse action effects (ConditionApplied for ApplyCondition variants,
// etc.). The reducer is a sanity check rather than a state mutator.
// `targetId` is the recipient of the onUse effects (defaults to the
// user when the user activates an item on themselves; can be a
// different character when one character activates an item on
// another).
export const ItemUsedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemUsed'),
  characterId: ULIDSchema,
  instanceId: ULIDSchema,
  definitionId: z.string(),
  targetId: ULIDSchema,
});
export type ItemUsedEvent = z.infer<typeof ItemUsedEventSchema>;

// Slice 256. A magic item is destroyed by a degradation roll fired
// from the planner (canonical RAW shape: "expend the last charge,
// roll 1d20; on a 1 the wand crumbles to ashes" / "the staff
// vanishes in a flash of light"). The reducer retires the instance
// (removes from the character's inventory and from
// state.itemInstances), mirroring ItemConsumed's retirement path.
// `rollResult` and `rollDie` are baked at plan time so apply() stays
// RNG-free and replay reproduces the same destruction outcome. The
// roll itself is not surfaced as a separate event because no other
// listener cares; bundling it on ItemDestroyed keeps the journal
// readable.
export const ItemDestroyedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemDestroyed'),
  characterId: ULIDSchema,
  instanceId: ULIDSchema,
  definitionId: z.string(),
  reason: z.literal('degradation-roll'),
  rollDie: z.number().int().positive(),
  rollResult: z.number().int().positive(),
});
export type ItemDestroyedEvent = z.infer<typeof ItemDestroyedEventSchema>;

// Slice 293. Records consumer-reported minutes of activation time
// drawn against an item's `timeBudget.maxMinutesPerLongRest` pool.
// Emitted by `planUseItem`'s Toggle branch when the consumer
// reports `minutesElapsed` on the toggle-off intent. The reducer
// increments the instance's `minutesUsed` field. Canonical user:
// Boots of Speed (RAW: 10-min-per-long-rest cumulative budget;
// "the magic ceases to function until you finish a Long Rest"
// once the budget is exhausted).
export const ItemTimeBudgetConsumedEventSchema = EventEnvelopeSchema.extend({
  type: z.literal('ItemTimeBudgetConsumed'),
  instanceId: ULIDSchema,
  amountMinutes: z.number().int().min(1),
  byCharacterId: ULIDSchema,
});
export type ItemTimeBudgetConsumedEvent = z.infer<typeof ItemTimeBudgetConsumedEventSchema>;
