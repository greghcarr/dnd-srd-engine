// Reference plugin handler: Absorb Elements (XGE/TCE, non-SRD).
//
// Slice 408 moved this spell's behavior out of the engine
// (planAbsorbElements was a built-in engine.plan method) into a
// consumer-supplied ActionHandler invoked via engine.plan.custom. A
// faithful port of the old planner, written against the public
// HandlerContext surface; the worked example for reaction-shaped handlers.
//
// RAW: a reaction triggered when you take acid/cold/fire/lightning/thunder
// damage; the damage is halved and your next melee hit deals +1d6 (1d6 per
// slot level above 1st) of that type. Event-sourcing: the triggering
// DamageApplied has already committed, so the handler emits a compensating
// Healed for the absorbed half and applies the charged rider condition.
import type { ActionHandler, HandlerContext } from '../../../src/handlers/index.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { DamageType } from '../../../src/schemas/primitives.js';
import type { SpellSlotConsumedEvent } from '../../../src/schemas/events/spellcasting.js';
import type { HealedEvent, ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { AbsorbElementsCastEvent } from '../../../src/schemas/events/reactive-spells.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const SPELL_ID = 'absorb-elements';
const MIN_SLOT_LEVEL = 1;
const TYPES: readonly DamageType[] = ['acid', 'cold', 'fire', 'lightning', 'thunder'];
const chargedConditionId = (damageType: DamageType): string => `absorb-elements-charged-${damageType}-active`;

interface AbsorbElementsParams {
  readonly casterId: string;
  readonly triggeringDamageEventId: string;
  readonly damageType: DamageType;
  readonly damageAmount: number;
  readonly slotLevel?: number;
}

export const absorbElementsHandler: ActionHandler = {
  plan(ctx: HandlerContext, rawParams: unknown): ReadonlyArray<Event> {
    const params = rawParams as AbsorbElementsParams;
    const caster = ctx.state.characters[params.casterId];
    if (!caster) throw new Error(`Caster ${params.casterId} not found`);

    if (!TYPES.includes(params.damageType)) {
      throw new Error(
        `Absorb Elements damage type '${params.damageType}' not in allowed list [${TYPES.join(', ')}]`,
      );
    }
    if (params.damageAmount < 0) throw new Error('Absorb Elements damageAmount must be non-negative');
    const slotLevel = params.slotLevel ?? MIN_SLOT_LEVEL;
    if (slotLevel < MIN_SLOT_LEVEL) throw new Error('Absorb Elements is a 1st-level spell');
    if (!ctx.content.spells.get(SPELL_ID)) throw new Error('absorb-elements spell not in content');

    ctx.assertReactionAvailable(caster, 'cast Absorb Elements');

    const at = ctx.at;
    const halvedAmount = Math.floor(params.damageAmount / 2);
    const events: Event[] = [];

    const reaction = ctx.consumeActionEconomy(caster, 'reaction');
    if (reaction !== undefined) events.push(reaction);

    events.push({
      id: ctx.newEventId(), at, type: 'SpellSlotConsumed',
      characterId: params.casterId as ULID, slotLevel,
    } satisfies SpellSlotConsumedEvent);

    if (halvedAmount > 0) {
      events.push({
        id: ctx.newEventId(), at, type: 'Healed',
        targetId: params.casterId as ULID, amount: halvedAmount, source: SPELL_ID,
      } satisfies HealedEvent);
    }

    events.push({
      id: ctx.newEventId(), at, type: 'ConditionApplied',
      targetId: params.casterId as ULID, conditionId: chargedConditionId(params.damageType),
      appliedConditionId: ctx.newAppliedConditionId(),
      // RAW upcast: Nd6 next-hit rider at slot level N, baked as a
      // per-instance override of the condition's 1d6 (only when upcast).
      ...(slotLevel > MIN_SLOT_LEVEL ? { riderDamageDice: `${slotLevel}d6` } : {}),
    } satisfies ConditionAppliedEvent);

    events.push({
      id: ctx.newEventId(), at, type: 'AbsorbElementsCast',
      casterId: params.casterId as ULID, triggeringDamageEventId: params.triggeringDamageEventId as ULID,
      damageType: params.damageType, halvedAmount,
    } satisfies AbsorbElementsCastEvent);

    return events;
  },
};
