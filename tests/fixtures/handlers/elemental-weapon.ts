// Reference plugin handler: Elemental Weapon (XGE/TCE, non-SRD).
//
// Slice 407 moved this spell's behavior out of the engine
// (planElementalWeapon was a built-in engine.plan method) and into a
// consumer-supplied ActionHandler invoked via engine.plan.custom. This is
// the "code file beside the JSON" model: a non-SRD content pack ships its
// behavior as a handler instead of the engine hardcoding it. It is a
// faithful port of the old planner, written against the public
// HandlerContext surface, and doubles as the worked example for authoring
// cast-shaped handlers (see docs/plugin-api-design.md). Mechanics-only.
import type { ActionHandler, HandlerContext } from '../../../src/handlers/index.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { DamageType } from '../../../src/schemas/primitives.js';
import type { SpellCastDeclaredEvent, SpellSlotConsumedEvent } from '../../../src/schemas/events/spellcasting.js';
import type { ConcentrationStartedEvent, ConcentrationBrokenEvent } from '../../../src/schemas/events/concentration.js';
import type { ItemBuffAppliedEvent } from '../../../src/schemas/events/inventory.js';
import type { ULID } from '../../../src/engine/ids-utils.js';

const SPELL_ID = 'elemental-weapon';
const SPELL_DURATION_MINUTES = 60;
const ALLOWED_DAMAGE_TYPES: readonly DamageType[] = ['acid', 'cold', 'fire', 'lightning', 'thunder'];

// +1 at slot 3-4, +2 at 5-6, +3 at 7+; extra damage is bonus x 1d4.
const enhancementForSlotLevel = (slotLevel: number): number =>
  slotLevel >= 7 ? 3 : slotLevel >= 5 ? 2 : 1;

interface ElementalWeaponParams {
  readonly casterId: string;
  readonly weaponInstanceId: string;
  readonly slotLevel: number;
  readonly damageType: DamageType;
}

export const elementalWeaponHandler: ActionHandler = {
  plan(ctx: HandlerContext, rawParams: unknown): ReadonlyArray<Event> {
    const params = rawParams as ElementalWeaponParams;
    const caster = ctx.state.characters[params.casterId];
    if (!caster) throw new Error(`Unknown caster ${params.casterId}`);
    ctx.assertActorCanAct(caster, 'cast Elemental Weapon');

    const spell = ctx.content.spells.get(SPELL_ID);
    if (!spell) throw new Error('elemental-weapon spell not in content');
    if (params.slotLevel < spell.level) {
      throw new Error(`Slot level ${params.slotLevel} insufficient for spell level ${spell.level}`);
    }
    if (ctx.spellSlotsRemaining(caster, params.slotLevel) <= 0) {
      throw new Error(`No spell slots of level ${params.slotLevel} available`);
    }
    if (!ALLOWED_DAMAGE_TYPES.includes(params.damageType)) {
      throw new Error(
        `Elemental Weapon damage type '${params.damageType}' not in allowed list [${ALLOWED_DAMAGE_TYPES.join(', ')}]`,
      );
    }
    const weapon = ctx.state.itemInstances[params.weaponInstanceId];
    if (!weapon) throw new Error(`Unknown weapon instance ${params.weaponInstanceId}`);
    const weaponDef = ctx.content.items.get(weapon.definitionId);
    if (!weaponDef || weaponDef.itemKind !== 'weapon') {
      throw new Error(`Item instance ${params.weaponInstanceId} is not a weapon (definition ${weapon.definitionId})`);
    }

    const at = ctx.at;
    const bonus = enhancementForSlotLevel(params.slotLevel);
    const events: Event[] = [];

    const declared: SpellCastDeclaredEvent = {
      id: ctx.newEventId(), at, type: 'SpellCastDeclared',
      characterId: params.casterId as ULID, spellId: SPELL_ID, slotLevel: params.slotLevel,
      slotSource: 'standard', targetIds: [params.weaponInstanceId as ULID], castAsRitual: false,
    };
    events.push(declared);

    events.push({
      id: ctx.newEventId(), at, type: 'SpellSlotConsumed',
      characterId: params.casterId as ULID, slotLevel: params.slotLevel, causedByEventId: declared.id,
    } satisfies SpellSlotConsumedEvent);

    if (caster.concentrationEffectId !== undefined) {
      events.push({
        id: ctx.newEventId(), at, type: 'ConcentrationBroken',
        effectInstanceId: caster.concentrationEffectId, casterId: params.casterId as ULID,
        reason: 'newConcentrationSpell', causedByEventId: declared.id,
      } satisfies ConcentrationBrokenEvent);
    }

    const effectInstanceId = ctx.newEffectInstanceId();
    events.push({
      id: ctx.newEventId(), at, type: 'ItemBuffApplied',
      instanceId: params.weaponInstanceId as ULID, attackBonus: bonus, damageBonus: 0,
      extraDamageDice: `${bonus}d4`, extraDamageType: params.damageType,
      sourceEffectInstanceId: effectInstanceId as unknown as ULID, source: SPELL_ID, causedByEventId: declared.id,
    } satisfies ItemBuffAppliedEvent);

    events.push({
      id: ctx.newEventId(), at, type: 'ConcentrationStarted',
      effectInstanceId: effectInstanceId as unknown as ULID, casterId: params.casterId as ULID,
      spellId: SPELL_ID, targetIds: [], conditionsApplied: [], durationMinutes: SPELL_DURATION_MINUTES,
      slotLevel: params.slotLevel, causedByEventId: declared.id,
    } satisfies ConcentrationStartedEvent);

    return events;
  },
};
