import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { DamageAppliedEvent, HealedEvent } from '../../schemas/events/combat.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { rollDie } from '../../rng/dice.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { planConcentrationBreakOnDrop } from './concentration.js';
import { applyAll } from '../apply.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const DRUID_CLASS_ID = 'druid';
const CIRCLE_OF_THE_LAND_SUBCLASS_ID = 'circle-of-the-land';
const LANDS_AID_LEVEL = 3;
const WILD_SHAPE_RESOURCE_ID = 'wild-shape';
const LANDS_AID_DAMAGE_TYPE = 'necrotic';
const LANDS_AID_DIE = 6;
// 2d6 at level 3, +1d6 at druid levels 10 and 14 (RAW: 3d6 / 4d6).
const LANDS_AID_BASE_DICE = 2;
const LANDS_AID_SCALE_LEVEL_FIRST = 10;
const LANDS_AID_SCALE_LEVEL_SECOND = 14;

export const landsAidDiceCount = (druidLevel: number): number =>
  LANDS_AID_BASE_DICE +
  (druidLevel >= LANDS_AID_SCALE_LEVEL_FIRST ? 1 : 0) +
  (druidLevel >= LANDS_AID_SCALE_LEVEL_SECOND ? 1 : 0);

const rollPool = (count: number, rng: RNG): number => {
  let total = 0;
  for (let i = 0; i < count; i++) total += rollDie(LANDS_AID_DIE, rng);
  return total;
};

export interface LandsAidIntent {
  readonly type: 'LandsAid';
  readonly druidId: string;
  // Creatures of the druid's choice in the 10-ft Sphere that must make the
  // Constitution save. The engine doesn't model positions, so the consumer
  // supplies the in-area targets.
  readonly damageTargetIds: ReadonlyArray<string>;
  // The one creature of the druid's choice in the area that regains HP
  // (RAW: "One creature of your choice in that area regains 2d6 Hit
  // Points"). Optional: the druid may use only the damage arm.
  readonly healTargetId?: string;
  readonly at?: string;
}

// Circle of the Land L3 Land's Aid. As a Magic action, expend a use of
// Wild Shape and create a 10-ft Sphere within 60 ft: each chosen creature
// makes a Constitution save against the druid's spell save DC, taking 2d6
// Necrotic on a failure or half on a success, and one chosen creature
// regains 2d6 Hit Points. Damage and healing scale to 3d6 / 4d6 at druid
// levels 10 / 14.
//
// Spends the `wild-shape` resource (ResourceSpent) and reuses the shared
// `rollSaveAgainstDC` helper plus the standard damage-mitigation /
// fatal-damage-intercept pipeline so per-type resistance and the
// drop-to-0 concentration break are honored as for any spell save. The
// Necrotic damage is rolled once and applied full / half per target,
// matching the AoE save-mechanic convention. The healing is a separate
// pool roll.
//
// Action economy: a Magic action, consumed only when the druid is the
// active combatant (mirrors `planPreserveLife`); out of combat the effect
// is simply applied. Range (60 ft) and area membership are consumer-
// supplied.
export const planLandsAid = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: LandsAidIntent,
): ReadonlyArray<Event> => {
  const druid = state.characters[intent.druidId];
  if (!druid) throw new Error(`Unknown druid ${intent.druidId}`);
  const enrollment = druid.classes.find((c) => c.classId === DRUID_CLASS_ID);
  if (
    enrollment === undefined ||
    enrollment.level < LANDS_AID_LEVEL ||
    enrollment.subclassId !== CIRCLE_OF_THE_LAND_SUBCLASS_ID
  ) {
    throw new Error(
      `${druid.name} does not have Land's Aid (requires Circle of the Land, Druid level ${LANDS_AID_LEVEL})`,
    );
  }

  const wildShape = druid.resources.find((r) => r.resourceId === WILD_SHAPE_RESOURCE_ID);
  if (!wildShape || wildShape.current <= 0) {
    throw new Error(`${druid.name} has no Wild Shape uses to spend`);
  }

  const at = intent.at ?? nowIso();
  const dc = computeSpellSaveDC({
    character: druid,
    itemInstances: state.itemInstances,
    content,
    classId: DRUID_CLASS_ID,
    characters: state.characters,
  }).total;
  const diceCount = landsAidDiceCount(enrollment.level);

  const events: Event[] = [];

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId !== undefined) {
    const encounter = state.encounters[activeEncounterId];
    const druidCb = encounter?.combatants.find((c) => c.combatantId === intent.druidId);
    if (druidCb !== undefined) {
      const active = encounter?.combatants[encounter.activeIndex];
      if (!active || active.combatantId !== intent.druidId) {
        throw new Error(`${druid.name} is not the active combatant`);
      }
      if (active.turnUsage.actionUsed) {
        throw new Error(`${druid.name} has already used their action this turn`);
      }
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: activeEncounterId,
        combatantId: intent.druidId,
        kind: 'action',
      } satisfies ActionEconomyConsumedEvent);
    }
  }

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ResourceSpent',
    characterId: intent.druidId,
    resourceId: WILD_SHAPE_RESOURCE_ID,
    amount: 1,
  } satisfies ResourceSpentEvent);

  // One Necrotic damage roll shared across the area; full on a failed
  // save, half on a success.
  const rawDamage = rollPool(diceCount, rng);
  for (const targetId of intent.damageTargetIds) {
    const target = state.characters[targetId];
    if (!target) continue;
    const result = rollSaveAgainstDC({
      state,
      content,
      targetId,
      ability: 'CON',
      dc,
      sourceIsMagical: true,
      rng,
      at,
    });
    if (result === undefined) continue;
    events.push(result.event);
    const dealt = result.success ? Math.floor(rawDamage / 2) : rawDamage;
    if (dealt <= 0) continue;
    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents: [{ amount: dealt, type: LANDS_AID_DAMAGE_TYPE }],
      characters: state.characters,
      sourceIsMagical: true,
    });
    const intercept = interceptFatalDamage({
      state: applyAll(state, events),
      content,
      targetId,
      mitigatedComponents: mitigated,
      causedByEventId: result.event.id,
      at,
      rng,
    });
    const damageApplied: DamageAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageApplied',
      targetId: targetId as ULID,
      components: intercept.components,
      causedByEventId: result.event.id,
      sourceCharacterId: intent.druidId as ULID,
      source: 'lands-aid',
    };
    events.push(damageApplied);
    events.push(...intercept.extraEvents);
    events.push(...planConcentrationBreakOnDrop(target, intercept.components, damageApplied.id, at));
  }

  if (intent.healTargetId !== undefined && state.characters[intent.healTargetId] !== undefined) {
    const healing = rollPool(diceCount, rng);
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'Healed',
      targetId: intent.healTargetId as ULID,
      amount: healing,
      source: 'lands-aid',
    } satisfies HealedEvent);
  }

  return events;
};
