import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type {
  ItemAcquiredEvent,
  ItemBuffAppliedEvent,
  ItemEquippedEvent,
} from '../../schemas/events/inventory.js';
import type { DamageType } from '../../schemas/primitives.js';
import { newEventId, newItemInstanceId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import type { ULID } from '../ids-utils.js';

// Slice 518: Pact of the Blade conjure planner.
//
// RAW: "As a Bonus Action, you can conjure a pact weapon in your hand —
// a Simple or Martial Melee weapon of your choice with which you bond...
// Whenever you attack with the bonded weapon, you can use your Charisma
// modifier for the attack and damage rolls instead of using Strength or
// Dexterity; and you can cause the weapon to deal Necrotic, Psychic, or
// Radiant damage or its normal damage type."
//
// Engine surface: validates the caster has `GrantPactBlade` on their
// effect stack and the chosen weapon is a Simple or Martial Melee
// weapon; consumes the Bonus Action when the caster is the active
// combatant in an active encounter; emits an `ItemAcquired` (new
// weapon instance) + `ItemEquipped` to mainHand + `ItemBuffApplied`
// stamping the slice-501 `temporaryBuff` overrides (`abilityOverride:
// 'CHA'` + optional `damageTypeOverride`). The attack resolver reads
// the buff at next attack time.
//
// Documented RAW deviations (consumer-managed):
//   - The "weapon-deals-X-or-normal-damage-type" RAW per-hit choice is
//     collapsed to a single conjure-time choice (mirror of slice 501's
//     Shillelagh approach). The caster picks one of Necrotic / Psychic /
//     Radiant at conjure, or omits the choice for the weapon's printed
//     type.
//   - Bonded-weapon proficiency arm (RAW grants proficiency with the
//     bonded weapon regardless of class). Not modeled yet — a warlock
//     conjuring a martial weapon they're not class-proficient with
//     attacks without proficiency bonus on its mastery.
//   - Spellcasting-focus arm: consumer-managed (engine doesn't model
//     focus-vs-component requirements at cast time).
//   - "Bond ends if you use this feature's Bonus Action again, if the
//     weapon is more than 5 feet away for 1 minute or more, or if you
//     die": consumer-managed. Each conjure call creates a new instance
//     without cleaning up the prior bond (the prior instance and its
//     buff persist until the consumer destroys / unequips it).

const PACT_BLADE_SOURCE = 'pact-blade';

export interface ConjurePactWeaponIntent {
  readonly type: 'ConjurePactWeapon';
  readonly characterId: string;
  // The weapon-definition id to conjure (must be a Simple or Martial
  // Melee weapon in the content pack).
  readonly weaponDefinitionId: string;
  // Optional damage-type override: Necrotic, Psychic, or Radiant. Omit
  // to keep the weapon's printed damage type.
  readonly damageTypeOverride?: DamageType;
  readonly at?: string;
}

const ALLOWED_DAMAGE_TYPES: ReadonlySet<DamageType> = new Set<DamageType>([
  'necrotic',
  'psychic',
  'radiant',
]);

export const planConjurePactWeapon = (
  state: CampaignState,
  content: ResolvedContent,
  intent: ConjurePactWeaponIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);

  const effects = buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  });
  if (!effects.hasPactBlade()) {
    throw new Error(`${character.name} does not have the Pact of the Blade invocation`);
  }

  const weaponDef = content.items.get(intent.weaponDefinitionId);
  if (weaponDef === undefined || weaponDef.itemKind !== 'weapon') {
    throw new Error(`Pact weapon '${intent.weaponDefinitionId}' is not a weapon`);
  }
  if (weaponDef.attackKind !== 'melee') {
    throw new Error(`Pact of the Blade requires a Melee weapon (got '${weaponDef.id}', attackKind ${weaponDef.attackKind})`);
  }
  if (weaponDef.category !== 'simple' && weaponDef.category !== 'martial') {
    throw new Error(`Pact of the Blade requires a Simple or Martial weapon (got '${weaponDef.id}', category ${weaponDef.category})`);
  }

  if (intent.damageTypeOverride !== undefined && !ALLOWED_DAMAGE_TYPES.has(intent.damageTypeOverride)) {
    throw new Error(`Pact of the Blade damage-type override must be Necrotic, Psychic, or Radiant (got '${intent.damageTypeOverride}')`);
  }

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  // Consume the Bonus Action when the caster is the active combatant in
  // an active encounter; outside encounter (e.g. between fights) this is
  // a free action with no economy cost — mirrors planSacredWeapon.
  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const active = encounter?.combatants[encounter.activeIndex];
    if (active && active.combatantId === intent.characterId) {
      if (active.turnUsage.bonusActionUsed) {
        throw new Error(`${character.name} has already used their bonus action this turn`);
      }
      const bonusActionConsumed: ActionEconomyConsumedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.characterId,
        kind: 'bonusAction',
      };
      events.push(bonusActionConsumed);
    }
  }

  const newInstanceId = newItemInstanceId();
  const acquired: ItemAcquiredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ItemAcquired',
    instance: {
      id: newInstanceId,
      definitionId: intent.weaponDefinitionId,
      quantity: 1,
      attuned: false,
      identifiedByCharacterIds: [],
    },
    characterId: intent.characterId as ULID,
  };
  events.push(acquired);

  const equipped: ItemEquippedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ItemEquipped',
    characterId: intent.characterId as ULID,
    instanceId: newInstanceId,
    slot: 'mainHand',
  };
  events.push(equipped);

  const buff: ItemBuffAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ItemBuffApplied',
    instanceId: newInstanceId,
    attackBonus: 0,
    damageBonus: 0,
    abilityOverride: 'CHA',
    ...(intent.damageTypeOverride !== undefined ? { damageTypeOverride: intent.damageTypeOverride } : {}),
    source: PACT_BLADE_SOURCE,
  };
  events.push(buff);

  return events;
};
