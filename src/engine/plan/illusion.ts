import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type {
  IllusionCreatedEvent,
  IllusionInvestigatedEvent,
  IllusionDismissedEvent,
  IllusionDismissalReason,
} from '../../schemas/events/illusions.js';
import type { IllusionKind } from '../../schemas/runtime/illusion.js';
import type {
  ConcentrationBrokenEvent,
  ConcentrationStartedEvent,
} from '../../schemas/events/concentration.js';
import type {
  SpellCastDeclaredEvent,
  SpellSlotConsumedEvent,
} from '../../schemas/events/spellcasting.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { computeAbilityCheck } from '../../derive/ability-check.js';
import { rollDie } from '../../rng/dice.js';
import { applyHalflingLuckFromFlag } from './_halfling-luck.js';
import { D20_SIDES } from '../../internal/constants.js';
import { newEventId, newIllusionId, newEffectInstanceId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { invariant } from '../../internal/invariants.js';
import type { ULID } from '../ids-utils.js';

// Slice 137: dedicated planners for the illusion-interaction
// primitive. Silent Image and Major Image are the canonical users.
//
// RAW 2024 illusions: the caster places an illusion at cast time;
// concentration sustains it for the duration. A creature can use
// the Study action to make an Investigation check against the
// caster's spell save DC; on success the creature recognizes the
// illusion as false. The engine tracks who has disbelieved via
// the illusion's `disbelievedBy` list; consumers gate narrative
// on that set ("creatures who disbelieve see through it").

const SILENT_IMAGE_MIN_SLOT = 1;
const MAJOR_IMAGE_MIN_SLOT = 3;
const ILLUSION_DURATION_MINUTES = 10;

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

const findPrimaryCastingClass = (
  caster: { readonly classes: ReadonlyArray<{ readonly classId: string }> },
  content: ResolvedContent,
): string => {
  for (const enrollment of caster.classes) {
    const cls = content.classes.get(enrollment.classId);
    if (cls?.spellcasting !== undefined) return enrollment.classId;
  }
  return caster.classes[0]?.classId ?? 'wizard';
};

interface PlanIllusionCastInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly casterId: string;
  readonly spellId: 'silent-image' | 'major-image';
  readonly label: string;
  readonly location: string;
  readonly kind: IllusionKind;
  readonly slotLevel: number;
  readonly minSlot: number;
  readonly at?: string;
}

// Shared core for Silent Image / Major Image. Both spells follow the
// same shape: action + slot + concentration + IllusionCreated. The
// caller supplies the spell id, illusion kind (visual vs
// audiovisual), and minimum slot level.
const planIllusionCast = (input: PlanIllusionCastInput): ReadonlyArray<Event> => {
  const { state, content, casterId, spellId, label, location, kind, slotLevel, minSlot } = input;
  const caster = state.characters[casterId];
  invariant(caster !== undefined, `Caster ${casterId} not found`);
  invariant(
    slotLevel >= minSlot,
    `${spellId} requires a ${minSlot}${minSlot === 1 ? 'st' : minSlot === 3 ? 'rd' : 'th'}-level or higher slot`,
  );
  invariant(
    caster.knownSpells.includes(spellId) || caster.preparedSpells.includes(spellId),
    `Caster ${casterId} does not know ${spellId}`,
  );

  const at = input.at ?? nowIso();
  const events: Event[] = [];
  const action = economyConsumedIfEncountered(state, casterId, at, 'action');
  if (action !== undefined) events.push(action);

  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: casterId,
    spellId,
    slotLevel,
    slotSource: 'standard',
    targetIds: [casterId],
    castAsRitual: false,
  };
  events.push(declared);

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: casterId,
    slotLevel,
  } satisfies SpellSlotConsumedEvent);

  if (caster.concentrationEffectId !== undefined) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: caster.concentrationEffectId,
      casterId: casterId as ULID,
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
    casterId: casterId as ULID,
    spellId,
    targetIds: [casterId as ULID],
    conditionsApplied: [],
    durationMinutes: ILLUSION_DURATION_MINUTES,
    slotLevel,
    causedByEventId: declared.id,
  } satisfies ConcentrationStartedEvent);

  const castingClassId = findPrimaryCastingClass(caster, content);
  const dcResult = computeSpellSaveDC({
    character: caster,
    itemInstances: state.itemInstances,
    content,
    classId: castingClassId,
    characters: state.characters,
  });

  const illusionId = newIllusionId();
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'IllusionCreated',
    illusionId: illusionId as ULID,
    label,
    location,
    kind,
    casterId: casterId as ULID,
    sourceSpellId: spellId,
    sourceEffectInstanceId: effectInstanceId as ULID,
    investigationDC: dcResult.total,
    causedByEventId: declared.id,
  } satisfies IllusionCreatedEvent);

  return events;
};

export interface SilentImageIntent {
  readonly type: 'SilentImage';
  readonly casterId: string;
  // Free-text label / description of the illusion ("Looming Orc",
  // "Wall of Spikes"). Consumer display.
  readonly label: string;
  // Free-text location of the illusion (the engine doesn't model
  // position outside encounters).
  readonly location: string;
  readonly slotLevel?: number;
  readonly at?: string;
}

/**
 * RAW 2024 Silent Image: 1st-level illusion, Action, range 60 ft,
 * Concentration up to 10 minutes. Creates the visual image of an
 * object / creature / phenomenon up to a 15-ft cube; no sound,
 * smell, or temperature (visual-only). A creature can use the
 * Study action to make an Investigation check against the caster's
 * spell save DC; on success the creature recognizes the illusion
 * as false. The caster can move the image as a bonus action on
 * subsequent turns (consumer territory: re-emit IllusionCreated
 * with an updated location, or extend the schema later).
 */
export const planSilentImage = (
  state: CampaignState,
  content: ResolvedContent,
  _rng: RNG,
  intent: SilentImageIntent,
): ReadonlyArray<Event> =>
  planIllusionCast({
    state,
    content,
    casterId: intent.casterId,
    spellId: 'silent-image',
    label: intent.label,
    location: intent.location,
    kind: 'visual',
    slotLevel: intent.slotLevel ?? SILENT_IMAGE_MIN_SLOT,
    minSlot: SILENT_IMAGE_MIN_SLOT,
    ...(intent.at !== undefined ? { at: intent.at } : {}),
  });

export interface MajorImageIntent {
  readonly type: 'MajorImage';
  readonly casterId: string;
  readonly label: string;
  readonly location: string;
  readonly slotLevel?: number;
  readonly at?: string;
}

/**
 * RAW 2024 Major Image: 3rd-level illusion, Action, range 120 ft,
 * Concentration up to 10 minutes. Same Silent Image shape but adds
 * sound, smell, temperature (audiovisual). The caster can change
 * the image on their action; at 6th-level slot the spell becomes
 * permanent without concentration (not modeled here — out of scope
 * for this slice).
 */
export const planMajorImage = (
  state: CampaignState,
  content: ResolvedContent,
  _rng: RNG,
  intent: MajorImageIntent,
): ReadonlyArray<Event> =>
  planIllusionCast({
    state,
    content,
    casterId: intent.casterId,
    spellId: 'major-image',
    label: intent.label,
    location: intent.location,
    kind: 'audiovisual',
    slotLevel: intent.slotLevel ?? MAJOR_IMAGE_MIN_SLOT,
    minSlot: MAJOR_IMAGE_MIN_SLOT,
    ...(intent.at !== undefined ? { at: intent.at } : {}),
  });

export interface InvestigateIllusionIntent {
  readonly type: 'InvestigateIllusion';
  readonly investigatorId: string;
  readonly illusionId: string;
  readonly at?: string;
}

/**
 * A creature uses the Study action to inspect the illusion. Rolls
 * an Investigation check (INT + Investigation proficiency where
 * applicable) against the illusion's baked DC. On success the
 * investigator is added to the illusion's `disbelievedBy` list
 * (the reducer handles the state mutation).
 *
 * Consumes the investigator's action (in encounter). The check
 * honors any existing advantage / disadvantage from the
 * investigator's effect stack.
 */
export const planInvestigateIllusion = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: InvestigateIllusionIntent,
): ReadonlyArray<Event> => {
  const investigator = state.characters[intent.investigatorId];
  invariant(investigator !== undefined, `Investigator ${intent.investigatorId} not found`);
  const illusion = state.illusions[intent.illusionId];
  invariant(illusion !== undefined, `Illusion ${intent.illusionId} not found`);

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const action = economyConsumedIfEncountered(state, intent.investigatorId, at, 'action');
  if (action !== undefined) events.push(action);

  const check = computeAbilityCheck({
    character: investigator,
    itemInstances: state.itemInstances,
    content,
    ability: 'INT',
    skill: 'investigation',
    characters: state.characters,
  });
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  if (check.hasAdvantage || check.hasDisadvantage) {
    rolls.push(rollDie(D20_SIDES, rng));
  }
  const used = check.hasAdvantage
    ? 'advantage'
    : check.hasDisadvantage
      ? 'disadvantage'
      : 'none';
  let usedD20 = check.hasAdvantage
    ? Math.max(...rolls)
    : check.hasDisadvantage
      ? Math.min(...rolls)
      : rolls[0]!;
  // Slice 543: Halfling Luck on Investigation check.
  usedD20 = applyHalflingLuckFromFlag(usedD20, check.hasHalflingLuck, rolls, rng);
  const total = usedD20 + check.total;
  const success = total >= illusion.investigationDC;
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'IllusionInvestigated',
    illusionId: intent.illusionId as ULID,
    investigatorId: intent.investigatorId as ULID,
    d20: rolls,
    used,
    bonus: check.total,
    dc: illusion.investigationDC,
    total,
    success,
  } satisfies IllusionInvestigatedEvent);

  return events;
};

export interface DismissIllusionIntent {
  readonly type: 'DismissIllusion';
  readonly illusionId: string;
  readonly reason?: IllusionDismissalReason;
  readonly at?: string;
}

/**
 * Caster-initiated illusion dismissal (voluntary spell end). The
 * concentration-drop path emits its own IllusionDismissed via
 * clearConcentrationEffect; this planner is for the explicit
 * "end the spell now" surface.
 */
export const planDismissIllusion = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: DismissIllusionIntent,
): ReadonlyArray<Event> => {
  const illusion = state.illusions[intent.illusionId];
  invariant(illusion !== undefined, `Illusion ${intent.illusionId} not found`);
  const at = intent.at ?? nowIso();
  const dismissed: IllusionDismissedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'IllusionDismissed',
    illusionId: intent.illusionId as ULID,
    reason: intent.reason ?? 'casterAction',
  };
  return [dismissed];
};
