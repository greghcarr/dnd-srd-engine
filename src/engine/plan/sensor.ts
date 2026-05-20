import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type {
  RemoteSensorPlacedEvent,
  RemoteSensorModeChangedEvent,
  RemoteSensorRemovedEvent,
  RemoteSensorMovedEvent,
  SensorRemovalReason,
} from '../../schemas/events/sensors.js';
import type { SensorMode } from '../../schemas/runtime/sensor.js';
import type {
  ConcentrationBrokenEvent,
  ConcentrationStartedEvent,
} from '../../schemas/events/concentration.js';
import type {
  SpellCastDeclaredEvent,
  SpellSlotConsumedEvent,
} from '../../schemas/events/spellcasting.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { rollDie } from '../../rng/dice.js';
import { D20_SIDES } from '../../internal/constants.js';
import { newEventId, newSensorId, newEffectInstanceId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

// Slice 135: dedicated planners for placing, switching, and removing
// remote sensors. RAW 2024 Clairvoyance is the canonical user; Scrying
// will piggyback once its "target makes a WIS save against being
// scryed" arm is wired (separate slice).

const CLAIRVOYANCE_MIN_SLOT_LEVEL = 3;
const CLAIRVOYANCE_DURATION_MINUTES = 10;

const economyConsumedIfEncountered = (
  state: CampaignState,
  characterId: string,
  at: string,
  kind: 'action' | 'bonusAction' | 'reaction',
): ActionEconomyConsumedEvent | undefined => {
  if (state.activeEncounterId === undefined) return undefined;
  const encounter = state.encounters[state.activeEncounterId];
  if (encounter === undefined) return undefined;
  if (!encounter.combatants.some((c) => c.combatantId === characterId)) return undefined;
  return {
    id: newEventId() as ULID,
    at,
    type: 'ActionEconomyConsumed',
    encounterId: state.activeEncounterId,
    combatantId: characterId,
    kind,
  };
};

export interface ClairvoyanceIntent {
  readonly type: 'Clairvoyance';
  readonly casterId: string;
  // Free-text description of the location where the sensor is placed.
  // The engine doesn't reason about it; consumers / DMs display it
  // and describe what's seen / heard.
  readonly location: string;
  // Optional human-readable label for the sensor (defaults to
  // "Clairvoyant Sensor"). Consumer-facing.
  readonly label?: string;
  // Initial sense mode. RAW: caster chooses seeing or hearing at cast
  // time, can switch with an action thereafter via planSwitchSensorMode.
  readonly mode: SensorMode;
  readonly slotLevel?: number;
  readonly at?: string;
}

/**
 * RAW 2024 Clairvoyance: 3rd-level divination, 10-minute cast,
 * Concentration up to 10 minutes, range 1 mile. The caster places an
 * invisible sensor in a location known or in an obvious location
 * within range. The caster perceives through the sensor in one of two
 * modes (seeing or hearing) chosen at cast time; the planSwitchSensor
 * Mode planner toggles modes thereafter.
 *
 * The 10-minute cast time means in-encounter use is unusual; the
 * planner still consumes an action when cast inside an encounter (a
 * caster who chooses to cast a 10-minute spell mid-fight commits to
 * the action that turn; out-of-encounter casts just emit the cast
 * declared / slot / concentration / sensor events).
 *
 * Event sequence (in order):
 *   - ActionEconomyConsumed (in encounter only)
 *   - SpellCastDeclared
 *   - SpellSlotConsumed
 *   - ConcentrationBroken (if a prior concentration was active)
 *   - ConcentrationStarted
 *   - RemoteSensorPlaced (linked to the concentration effect)
 */
export const planClairvoyance = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: ClairvoyanceIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const slotLevel = intent.slotLevel ?? CLAIRVOYANCE_MIN_SLOT_LEVEL;
  invariant(
    slotLevel >= CLAIRVOYANCE_MIN_SLOT_LEVEL,
    'Clairvoyance requires a 3rd-level or higher slot',
  );
  const knowsSpell =
    caster.knownSpells.includes('clairvoyance') || caster.preparedSpells.includes('clairvoyance');
  invariant(knowsSpell, `Caster ${intent.casterId} does not know Clairvoyance`);

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const action = economyConsumedIfEncountered(state, intent.casterId, at, 'action');
  if (action !== undefined) events.push(action);

  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'clairvoyance',
    slotLevel,
    slotSource: 'standard',
    targetIds: [intent.casterId],
    castAsRitual: false,
  };
  events.push(declared);

  const slotConsumed: SpellSlotConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.casterId,
    slotLevel,
  };
  events.push(slotConsumed);

  // If the caster is already concentrating, the old effect breaks
  // when the new one starts. Mirrors cast-spell's concentration path.
  if (caster.concentrationEffectId !== undefined) {
    const priorBroken: ConcentrationBrokenEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: caster.concentrationEffectId,
      casterId: intent.casterId as ULID,
      reason: 'newConcentrationSpell',
      causedByEventId: declared.id,
    };
    events.push(priorBroken);
  }

  const effectInstanceId = newEffectInstanceId();
  const started: ConcentrationStartedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConcentrationStarted',
    effectInstanceId: effectInstanceId as ULID,
    casterId: intent.casterId as ULID,
    spellId: 'clairvoyance',
    targetIds: [intent.casterId as ULID],
    conditionsApplied: [],
    durationMinutes: CLAIRVOYANCE_DURATION_MINUTES,
    slotLevel,
    causedByEventId: declared.id,
  };
  events.push(started);

  const sensorId = newSensorId();
  const placed: RemoteSensorPlacedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'RemoteSensorPlaced',
    sensorId: sensorId as ULID,
    label: intent.label ?? 'Clairvoyant Sensor',
    location: intent.location,
    casterId: intent.casterId as ULID,
    sourceSpellId: 'clairvoyance',
    sourceEffectInstanceId: effectInstanceId as ULID,
    mode: intent.mode,
    mobile: false,
    causedByEventId: declared.id,
  };
  events.push(placed);

  return events;
};

export interface SwitchSensorModeIntent {
  readonly type: 'SwitchSensorMode';
  readonly casterId: string;
  readonly sensorId: string;
  readonly mode: SensorMode;
  readonly at?: string;
}

/**
 * RAW 2024 Clairvoyance: "As your action, you can switch between
 * seeing and hearing." Consumes the caster's action (in encounter)
 * and emits a RemoteSensorModeChanged event.
 */
export const planSwitchSensorMode = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: SwitchSensorModeIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const sensor = state.sensors[intent.sensorId];
  invariant(sensor !== undefined, `Sensor ${intent.sensorId} not found`);
  invariant(
    sensor.casterId === intent.casterId,
    `Sensor ${intent.sensorId} is not owned by caster ${intent.casterId}`,
  );
  if (sensor.mode === intent.mode) {
    throw new Error(
      `Sensor ${intent.sensorId} is already in ${intent.mode} mode`,
    );
  }
  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  const action = economyConsumedIfEncountered(state, intent.casterId, at, 'action');
  if (action !== undefined) events.push(action);
  const changed: RemoteSensorModeChangedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'RemoteSensorModeChanged',
    sensorId: intent.sensorId as ULID,
    mode: intent.mode,
  };
  events.push(changed);
  return events;
};

export interface RemoveSensorIntent {
  readonly type: 'RemoveSensor';
  readonly sensorId: string;
  // Optional reason; defaults to 'casterAction' (the caster
  // voluntarily ends the spell). Concentration-drop cleanup is
  // handled inside clearConcentrationEffect, not this planner.
  readonly reason?: SensorRemovalReason;
  readonly at?: string;
}

/**
 * Caster-initiated sensor removal (voluntary spell end). The
 * concentration-drop path emits its own RemoteSensorRemoved during
 * clearConcentrationEffect; this planner is for the "I'm done
 * scrying, end the spell" surface without needing to break
 * concentration on something else.
 */
export const planRemoveSensor = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: RemoveSensorIntent,
): ReadonlyArray<Event> => {
  const sensor = state.sensors[intent.sensorId];
  invariant(sensor !== undefined, `Sensor ${intent.sensorId} not found`);
  const at = intent.at ?? nowIso();
  const removed: RemoteSensorRemovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'RemoteSensorRemoved',
    sensorId: intent.sensorId as ULID,
    reason: intent.reason ?? 'casterAction',
  };
  return [removed];
};

const SCRYING_MIN_SLOT_LEVEL = 5;
const SCRYING_DURATION_MINUTES = 10;

export interface ScryingIntent {
  readonly type: 'Scrying';
  readonly casterId: string;
  // The creature the caster is trying to scry. The engine resolves
  // the target by id (the consumer / DM has named or described it);
  // the WIS-save modifier table from RAW (intimately known, has
  // hair / blood, etc.) is consumer territory and pre-applied via
  // `dcAdjustment`.
  readonly targetId: string;
  // Optional DC adjustment from the familiarity table. RAW: -10 to
  // +5 in five tiers (intimately known +5 to secondhand -10). The
  // consumer rolls up the tier and supplies the delta; the planner
  // applies it to the caster's spell save DC.
  readonly dcAdjustment?: number;
  // Optional sensor mode at cast time. RAW: "you can see and hear
  // the target through the sensor"; the engine uses one mode at a
  // time and consumers toggle via planSwitchSensorMode. Defaults to
  // 'sight'.
  readonly mode?: SensorMode;
  // Optional sensor label override (defaults to "Scrying Sensor on
  // [targetId]"). Free-text consumer display.
  readonly label?: string;
  readonly slotLevel?: number;
  readonly at?: string;
}

export interface ScryingOutcome {
  readonly events: ReadonlyArray<Event>;
  // True when the target's WIS save defeats the spell. Slot still
  // spent (the caster cast the spell; the target's saving throw is
  // the only thing that stopped the sensor placement).
  readonly resisted: boolean;
}

/**
 * RAW 2024 Scrying: 5th-level divination, 10-minute cast, Self /
 * Concentration up to 10 minutes. The caster names or describes a
 * creature; that creature makes a WIS save against the caster's
 * spell save DC (adjusted by the familiarity table). On a failed
 * save, a sensor appears near the target and follows it for the
 * duration. On a successful save, the spell fails; slot is still
 * consumed.
 *
 * The engine doesn't model "sensor follows target"; the sensor's
 * `location` is free-text consumer territory (the DM / VTT updates
 * it as the target moves).
 *
 * Event sequence on cast:
 *   - ActionEconomyConsumed (in encounter only)
 *   - SpellCastDeclared
 *   - SpellSlotConsumed
 *   - SaveRolled (target WIS, with sourceIsMagical: true)
 *   - (on save fail) ConcentrationBroken (if prior concentration)
 *   - (on save fail) ConcentrationStarted
 *   - (on save fail) RemoteSensorPlaced
 */
export const planScrying = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ScryingIntent,
): ScryingOutcome => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);
  const slotLevel = intent.slotLevel ?? SCRYING_MIN_SLOT_LEVEL;
  invariant(
    slotLevel >= SCRYING_MIN_SLOT_LEVEL,
    'Scrying requires a 5th-level or higher slot',
  );
  invariant(
    caster.knownSpells.includes('scrying') || caster.preparedSpells.includes('scrying'),
    `Caster ${intent.casterId} does not know Scrying`,
  );

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const action = economyConsumedIfEncountered(state, intent.casterId, at, 'action');
  if (action !== undefined) events.push(action);

  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'scrying',
    slotLevel,
    slotSource: 'standard',
    targetIds: [intent.targetId],
    castAsRitual: false,
  };
  events.push(declared);

  const slotConsumed: SpellSlotConsumedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.casterId,
    slotLevel,
  };
  events.push(slotConsumed);

  // Target's WIS save. DC = caster's spell save DC + dcAdjustment
  // (from RAW familiarity table; consumer-supplied).
  const castingClassId =
    caster.classes.find((c) => content.classes.get(c.classId)?.spellcasting !== undefined)
      ?.classId ?? caster.classes[0]?.classId ?? 'wizard';
  const dcResult = computeSpellSaveDC({
    character: caster,
    itemInstances: state.itemInstances,
    content,
    classId: castingClassId,
    characters: state.characters,
  });
  const dc = dcResult.total + (intent.dcAdjustment ?? 0);
  const saveDerivation = computeSavingThrow({
    character: target,
    itemInstances: state.itemInstances,
    content,
    ability: 'WIS',
    characters: state.characters,
    sourceIsMagical: true,
  });
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  if (saveDerivation.hasAdvantage || saveDerivation.hasDisadvantage) {
    rolls.push(rollDie(D20_SIDES, rng));
  }
  const used = saveDerivation.hasAdvantage
    ? 'advantage'
    : saveDerivation.hasDisadvantage
      ? 'disadvantage'
      : 'none';
  const usedD20 = saveDerivation.hasAdvantage
    ? Math.max(...rolls)
    : saveDerivation.hasDisadvantage
      ? Math.min(...rolls)
      : rolls[0]!;
  const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
  const bonus = saveDerivation.total + saveBonus.total;
  const total = usedD20 + bonus;
  const success = total >= dc;
  const save: SaveRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.targetId as ULID,
    ability: 'WIS',
    dc,
    d20: rolls,
    used,
    bonus,
    total,
    success,
    causedByEventId: declared.id,
    breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
  };
  events.push(save);

  if (success) {
    // RAW: "if the target succeeds on the saving throw, the spell
    // doesn't take effect, and you can't use it again on that
    // target for 24 hours." Slot stays spent; engine doesn't track
    // the 24-hour-per-target cooldown (consumer territory).
    return { events, resisted: true };
  }

  if (caster.concentrationEffectId !== undefined) {
    const priorBroken: ConcentrationBrokenEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: caster.concentrationEffectId,
      casterId: intent.casterId as ULID,
      reason: 'newConcentrationSpell',
      causedByEventId: declared.id,
    };
    events.push(priorBroken);
  }

  const effectInstanceId = newEffectInstanceId();
  const started: ConcentrationStartedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConcentrationStarted',
    effectInstanceId: effectInstanceId as ULID,
    casterId: intent.casterId as ULID,
    spellId: 'scrying',
    targetIds: [intent.targetId as ULID],
    conditionsApplied: [],
    durationMinutes: SCRYING_DURATION_MINUTES,
    slotLevel,
    causedByEventId: declared.id,
  };
  events.push(started);

  const sensorId = newSensorId();
  const placed: RemoteSensorPlacedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'RemoteSensorPlaced',
    sensorId: sensorId as ULID,
    label: intent.label ?? `Scrying Sensor on ${target.name}`,
    // The engine doesn't track the target's actual position; the
    // location is free-text and the consumer updates it as the
    // target moves.
    location: `near ${target.name}`,
    casterId: intent.casterId as ULID,
    sourceSpellId: 'scrying',
    sourceEffectInstanceId: effectInstanceId as ULID,
    mode: intent.mode ?? 'sight',
    mobile: false,
    causedByEventId: declared.id,
  };
  events.push(placed);

  return { events, resisted: false };
};

const ARCANE_EYE_MIN_SLOT_LEVEL = 4;
const ARCANE_EYE_DURATION_MINUTES = 60;
const ARCANE_EYE_DARKVISION_FEET = 30;

export interface ArcaneEyeIntent {
  readonly type: 'ArcaneEye';
  readonly casterId: string;
  // Free-text initial location of the eye. RAW: created within 30 ft
  // of the caster. Engine doesn't reason about it; consumer supplies.
  readonly location: string;
  // Optional display label (defaults to "Arcane Eye").
  readonly label?: string;
  // Initial sense mode (default 'sight'; RAW: the eye sees, doesn't
  // hear separately, but we reuse the slice-135 mode field for
  // consistency).
  readonly mode?: SensorMode;
  readonly slotLevel?: number;
  readonly at?: string;
}

/**
 * RAW 2024 Arcane Eye: 4th-level divination, Action, Self,
 * Concentration up to 1 hour. Creates an invisible, magical eye
 * sensor that hovers within 30 ft of the caster. The eye has
 * darkvision 30 ft; the caster perceives through it. The caster
 * can use a bonus action to fly the eye up to 30 ft in any
 * direction via `planMoveSensor`.
 *
 * Event sequence:
 *   - ActionEconomyConsumed (in encounter only)
 *   - SpellCastDeclared
 *   - SpellSlotConsumed
 *   - ConcentrationBroken (if a prior concentration was active)
 *   - ConcentrationStarted
 *   - RemoteSensorPlaced (mobile: true, darkvisionRange: 30)
 */
export const planArcaneEye = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: ArcaneEyeIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const slotLevel = intent.slotLevel ?? ARCANE_EYE_MIN_SLOT_LEVEL;
  invariant(
    slotLevel >= ARCANE_EYE_MIN_SLOT_LEVEL,
    'Arcane Eye requires a 4th-level or higher slot',
  );
  invariant(
    caster.knownSpells.includes('arcane-eye') || caster.preparedSpells.includes('arcane-eye'),
    `Caster ${intent.casterId} does not know Arcane Eye`,
  );

  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  const action = economyConsumedIfEncountered(state, intent.casterId, at, 'action');
  if (action !== undefined) events.push(action);

  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'arcane-eye',
    slotLevel,
    slotSource: 'standard',
    targetIds: [intent.casterId],
    castAsRitual: false,
  };
  events.push(declared);

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.casterId,
    slotLevel,
  } satisfies SpellSlotConsumedEvent);

  if (caster.concentrationEffectId !== undefined) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: caster.concentrationEffectId,
      casterId: intent.casterId as ULID,
      reason: 'newConcentrationSpell',
      causedByEventId: declared.id,
    } satisfies ConcentrationBrokenEvent);
  }

  const effectInstanceId = newEffectInstanceId();
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConcentrationStarted',
    effectInstanceId: effectInstanceId as ULID,
    casterId: intent.casterId as ULID,
    spellId: 'arcane-eye',
    targetIds: [intent.casterId as ULID],
    conditionsApplied: [],
    durationMinutes: ARCANE_EYE_DURATION_MINUTES,
    slotLevel,
    causedByEventId: declared.id,
  } satisfies ConcentrationStartedEvent);

  const sensorId = newSensorId();
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'RemoteSensorPlaced',
    sensorId: sensorId as ULID,
    label: intent.label ?? 'Arcane Eye',
    location: intent.location,
    casterId: intent.casterId as ULID,
    sourceSpellId: 'arcane-eye',
    sourceEffectInstanceId: effectInstanceId as ULID,
    mode: intent.mode ?? 'sight',
    mobile: true,
    darkvisionRange: ARCANE_EYE_DARKVISION_FEET,
    causedByEventId: declared.id,
  } satisfies RemoteSensorPlacedEvent);

  return events;
};

export interface MoveSensorIntent {
  readonly type: 'MoveSensor';
  readonly casterId: string;
  readonly sensorId: string;
  // Free-text new location. RAW Arcane Eye caps the move at 30 ft
  // per bonus action; the engine doesn't reason about distance, so
  // the limit is consumer-enforced.
  readonly toLocation: string;
  readonly at?: string;
}

/**
 * Moves a mobile sensor (Arcane Eye) on the caster's bonus action.
 * Updates the sensor's `location` and emits RemoteSensorMoved.
 * Rejects:
 *   - non-mobile sensors (Clairvoyance / Scrying)
 *   - moves by a character other than the original caster
 *   - moves where fromLocation === toLocation (no-op rejection)
 */
export const planMoveSensor = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: MoveSensorIntent,
): ReadonlyArray<Event> => {
  const sensor = state.sensors[intent.sensorId];
  invariant(sensor !== undefined, `Sensor ${intent.sensorId} not found`);
  invariant(
    sensor.casterId === intent.casterId,
    `Sensor ${intent.sensorId} is not owned by caster ${intent.casterId}`,
  );
  if (!sensor.mobile) {
    throw new Error(`Sensor ${intent.sensorId} is not mobile`);
  }
  if (sensor.location === intent.toLocation) {
    throw new Error(`Sensor ${intent.sensorId} is already at ${intent.toLocation}`);
  }
  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  const bonus = economyConsumedIfEncountered(state, intent.casterId, at, 'bonusAction');
  if (bonus !== undefined) events.push(bonus);
  const moved: RemoteSensorMovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'RemoteSensorMoved',
    sensorId: intent.sensorId as ULID,
    fromLocation: sensor.location,
    toLocation: intent.toLocation,
  };
  events.push(moved);
  return events;
};
