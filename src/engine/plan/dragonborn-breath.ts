import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { DamageType } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { rollExpression } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { abilityModifier, proficiencyBonus } from '../../derive/ability.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { applyAll } from '../apply.js';
import { planConcentrationOnDamage } from './concentration.js';
import type { ULID } from '../ids-utils.js';

const DRAGONBORN_SPECIES_ID = 'dragonborn';
const BREATH_WEAPON_RESOURCE = 'dragonborn-breath-weapon';
const BREATH_AREA_SHAPES = ['cone', 'line'] as const;
type BreathAreaShape = (typeof BREATH_AREA_SHAPES)[number];

const ALLOWED_BREATH_DAMAGE_TYPES: ReadonlySet<DamageType> = new Set<DamageType>([
  'acid',
  'cold',
  'fire',
  'lightning',
  'poison',
]);

export interface DragonbornBreathIntent {
  readonly type: 'DragonbornBreath';
  readonly dragonbornId: string;
  // Consumer-supplied: the damage type from the dragonborn's
  // Draconic Ancestry pick (slice 531 OfferChoice). RAW: must
  // match the ancestor. Engine validates membership in the
  // allowed-types set but doesn't cross-check the ancestry pick
  // (consumer responsibility).
  readonly damageType: DamageType;
  readonly areaShape: BreathAreaShape;
  // Consumer-supplied target list per the area shape (15-ft cone
  // or 30-ft line, 5 ft wide). The engine doesn't compute area
  // inclusion -- standard convention for area-of-effect.
  readonly targetIds: ReadonlyArray<string>;
  readonly at?: string;
}

const breathDamageDice = (level: number): string => {
  if (level >= 17) return '4d10';
  if (level >= 11) return '3d10';
  if (level >= 5) return '2d10';
  return '1d10';
};

// Dragonborn species trait (PHB 2024, SRD 5.2.1): "When you take
// the Attack action on your turn, you can replace one of your
// attacks with an exhalation of magical energy in either a 15-foot
// Cone or a 30-foot Line that is 5 feet wide (choose the shape
// each time). Each creature in that area must make a Dexterity
// saving throw (DC 8 plus your Constitution modifier and Proficiency
// Bonus). On a failed save, a creature takes 1d10 damage of the type
// determined by your Draconic Ancestry trait. On a successful save,
// a creature takes half as much damage. This damage increases by
// 1d10 when you reach character levels 5 (2d10), 11 (3d10), and 17
// (4d10). You can use this Breath Weapon a number of times equal to
// your Proficiency Bonus, and you regain all expended uses when you
// finish a Long Rest."
//
// Documented RAW deviation: ships as an Action consumption rather
// than "replace one of your attacks within Attack action." At L1
// the Dragonborn has only 1 attack on their Attack action so the
// engine-side cost (one Action) is equivalent. From L5+ (Extra
// Attack tier), modeling "replace one of N attacks" requires the
// multiattack-replacement primitive which doesn't exist; this
// deviation under-prices the breath at L5+ by giving up the whole
// Action instead of one attack. Documented; future slice tightens
// when the primitive lands.
//
// Damage type is consumer-supplied (from the Draconic Ancestry
// OfferChoice in slice 531); save DC is 8 + CON mod + PB; damage
// dice scale by character level (1d10 -> 2d10 at L5 -> 3d10 at L11
// -> 4d10 at L17); area shape is consumer-chosen each use (cone or
// line); target list is consumer-supplied per the area shape
// (engine doesn't compute area inclusion -- standard convention).
export const planDragonbornBreath = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: DragonbornBreathIntent,
): ReadonlyArray<Event> => {
  const dragonborn = state.characters[intent.dragonbornId];
  if (!dragonborn) throw new Error(`Unknown character ${intent.dragonbornId}`);
  if (dragonborn.speciesId !== DRAGONBORN_SPECIES_ID) {
    throw new Error(
      `${dragonborn.name} does not have the Dragonborn Breath Weapon (Dragonborn species only)`,
    );
  }
  if (!ALLOWED_BREATH_DAMAGE_TYPES.has(intent.damageType)) {
    throw new Error(
      `Breath Weapon damage type must be one of acid / cold / fire / lightning / poison; got ${intent.damageType}`,
    );
  }
  const resource = dragonborn.resources.find((r) => r.resourceId === BREATH_WEAPON_RESOURCE);
  if (resource === undefined || resource.current <= 0) {
    throw new Error(
      `${dragonborn.name} has no Breath Weapon uses remaining (regain on a Long Rest)`,
    );
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Dragonborn Breath Weapon can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.dragonbornId) {
    throw new Error(`${dragonborn.name} is not the active combatant`);
  }
  if (active.turnUsage.actionUsed) {
    throw new Error(`${dragonborn.name} has already used their action this turn`);
  }

  const at = intent.at ?? nowIso();
  const totalLevel = computeTotalLevel(dragonborn);
  const pb = proficiencyBonus(totalLevel);
  const conMod = abilityModifier(dragonborn.abilityScores.CON);
  const saveDC = 8 + conMod + pb;
  const damageDice = breathDamageDice(totalLevel);

  const events: Event[] = [
    {
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: activeEncounterId,
      combatantId: intent.dragonbornId,
      kind: 'action',
    } satisfies ActionEconomyConsumedEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'ResourceSpent',
      characterId: intent.dragonbornId as ULID,
      resourceId: BREATH_WEAPON_RESOURCE,
      amount: 1,
    } satisfies ResourceSpentEvent,
  ];

  // RAW: roll damage once for the breath weapon (area-of-effect
  // convention), apply per target halved on save.
  const rolled = rollExpression(damageDice, rng);
  const fullDamage = rolled.total;
  const halfDamage = Math.floor(fullDamage / 2);

  let stagedState = applyAll(state, events);
  for (const targetId of intent.targetIds) {
    if (state.characters[targetId] === undefined) continue;
    const eventsBeforeTarget = events.length;
    const saveResult = rollSaveAgainstDC({
      state: stagedState,
      content,
      targetId,
      ability: 'DEX',
      dc: saveDC,
      sourceIsMagical: true,
      rng,
      at,
    });
    if (saveResult === undefined) continue;
    events.push(saveResult.event);
    const dealt = saveResult.success ? halfDamage : fullDamage;
    if (dealt > 0) {
      const dmg: DamageAppliedEvent = {
        id: newEventId() as ULID,
        at,
        type: 'DamageApplied',
        targetId: targetId as ULID,
        components: [{ amount: dealt, type: intent.damageType }],
        sourceCharacterId: intent.dragonbornId as ULID,
        causedByEventId: saveResult.event.id,
      };
      events.push(dmg);
      // Slice 621: per-target concentration save on the breath damage.
      // RAW: every damage event triggers a CON save on a concentrating
      // target (PHB 2024 Concentration). Mirrors the slice 601/612/620
      // wiring on the main-damage paths.
      const targetCharForConc = stagedState.characters[targetId];
      if (targetCharForConc !== undefined) {
        const concEvents = planConcentrationOnDamage(
          applyAll(stagedState, events.slice(eventsBeforeTarget)),
          content,
          rng,
          targetCharForConc,
          dmg.components,
          dmg.id,
          at,
        );
        events.push(...concEvents);
      }
    }
    stagedState = applyAll(stagedState, events.slice(eventsBeforeTarget));
  }

  return events;
};
