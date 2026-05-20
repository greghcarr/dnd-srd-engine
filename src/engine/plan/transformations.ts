import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { RNG } from '../../rng/index.js';
import type {
  PolymorphAppliedEvent,
  PolymorphForm,
  PolymorphKind,
  SimulacrumCreatedEvent,
  WishGrantedEvent,
} from '../../schemas/events/transformations.js';
import type {
  SpellCastDeclaredEvent,
  SpellSlotConsumedEvent,
} from '../../schemas/events/spellcasting.js';
import type {
  ConcentrationBrokenEvent,
  ConcentrationStartedEvent,
} from '../../schemas/events/concentration.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { ResourceSpentEvent } from '../../schemas/events/resources.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId, newEffectInstanceId, newCharacterId } from '../../ids.js';
import { invariant } from '../../internal/invariants.js';
import { nowIso } from '../../internal/clock.js';
import { computeTotalLevel } from '../../schemas/runtime/character.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { D20_SIDES } from '../../internal/constants.js';
import type { ULID } from '../ids-utils.js';

const POLYMORPH_MIN_SLOT = 4;
const POLYMORPH_DURATION_MINUTES = 60;

export interface PolymorphIntent {
  readonly type: 'Polymorph';
  readonly casterId: string;
  readonly targetId: string;
  readonly form: PolymorphForm;
  // The CR of the chosen Beast form. Validated against the target's
  // character level — RAW 2024: "the new form must be a Beast whose
  // Challenge Rating is no higher than the target's level (if a
  // character) or the target's Challenge Rating (if a creature)."
  // Form CR is data the consumer supplies because the engine doesn't
  // pre-load every PHB-2024 Beast statblock.
  readonly formCR: number;
  readonly slotLevel?: number;
  // Set true when the target resists. The planner rolls a WIS save and,
  // on success, stops short of PolymorphApplied (the slot is still
  // spent per RAW — the spell was cast, the save just defeated it).
  readonly unwilling?: boolean;
  readonly at?: string;
}

export interface PolymorphOutcome {
  readonly events: ReadonlyArray<Event>;
  // True when the unwilling target made the save and the polymorph did
  // not take effect. The slot was still spent.
  readonly resisted: boolean;
}

/**
 * RAW 2024 Polymorph: 4th level transmutation, action, V/S/M, range
 * 60 feet, concentration up to 1 hour. Transforms a creature you can
 * see into a Beast whose CR is at most the target's level. The new
 * form replaces physical stats (STR, DEX, CON, AC, HP, speed) while
 * mental stats stay. The target's original HP/wounds are preserved
 * for the revert. Polymorph ends on 0 HP in form (-> revert), on the
 * caster's concentration breaking, or voluntarily.
 *
 * Validates: caster knows Polymorph, has a 4th-level or higher slot,
 * isn't already concentrating on another spell (or breaks it), and the
 * chosen form's CR doesn't exceed the target's character level.
 */
export const planPolymorph = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: PolymorphIntent,
): PolymorphOutcome => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);

  const knowsSpell =
    caster.knownSpells.includes('polymorph') || caster.preparedSpells.includes('polymorph');
  invariant(knowsSpell, `Caster ${intent.casterId} does not know Polymorph`);

  const slotLevel = intent.slotLevel ?? POLYMORPH_MIN_SLOT;
  invariant(slotLevel >= POLYMORPH_MIN_SLOT, 'Polymorph is a 4th-level spell');

  // RAW: target's level caps the form's CR. For creatures we use total
  // level as a proxy — the engine doesn't track a separate CR field on
  // creature characters; consumers stat creatures with class levels that
  // approximate their CR.
  const targetCap = computeTotalLevel(target);
  if (intent.formCR > targetCap) {
    throw new Error(
      `Polymorph form CR ${intent.formCR} exceeds target's cap (${targetCap})`,
    );
  }

  invariant(target.polymorphedSnapshot === undefined, `${intent.targetId} is already polymorphed`);

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'polymorph',
    slotLevel,
    slotSource: 'standard',
    targetIds: [intent.targetId],
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

  // Unwilling targets: WIS save. The spell still spent the slot above.
  if (intent.unwilling === true) {
    const dcResult = computeSpellSaveDC({
      character: caster,
      itemInstances: state.itemInstances,
      content,
      classId: caster.classes[0]?.classId ?? 'wizard',
      characters: state.characters,
    });
    const saveDerivation = computeSavingThrow({
      character: target,
      itemInstances: state.itemInstances,
      content,
      ability: 'WIS',
      characters: state.characters,
    });
    const d20 = rollDie(D20_SIDES, rng);
    const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
    const bonus = saveDerivation.total + saveBonus.total;
    const total = d20 + bonus;
    const success = total >= dcResult.total;
    const save: SaveRolledEvent = {
      id: newEventId() as ULID,
      at,
      type: 'SaveRolled',
      targetId: intent.targetId as ULID,
      ability: 'WIS',
      dc: dcResult.total,
      d20: [d20],
      used: 'none',
      bonus,
      total,
      success,
      causedByEventId: declared.id,
      breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
    };
    events.push(save);
    if (success) {
      return { events, resisted: true };
    }
  }

  // Break the caster's prior concentration (if any) before starting the
  // new one. RAW: starting a new concentration spell ends the old.
  if (caster.concentrationEffectId !== undefined) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: caster.concentrationEffectId,
      casterId: intent.casterId as ULID,
      reason: 'newConcentrationSpell',
    } satisfies ConcentrationBrokenEvent);
  }

  const effectInstanceId = newEffectInstanceId();
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'ConcentrationStarted',
    effectInstanceId,
    casterId: intent.casterId,
    spellId: 'polymorph',
    targetIds: [intent.targetId],
    conditionsApplied: [],
    durationMinutes: POLYMORPH_DURATION_MINUTES,
    slotLevel,
    causedByEventId: declared.id,
  } satisfies ConcentrationStartedEvent);

  events.push({
    id: newEventId() as ULID,
    at,
    type: 'PolymorphApplied',
    targetId: intent.targetId,
    casterId: intent.casterId,
    kind: 'polymorph' as PolymorphKind,
    form: intent.form,
    causedByEventId: declared.id,
  } satisfies PolymorphAppliedEvent);

  return { events, resisted: false };
};

const WILD_SHAPE_RESOURCE_ID = 'wild-shape';
const WILD_SHAPE_DRUID_MIN_LEVEL = 2;
const WILD_SHAPE_DURATION_MINUTES = 60;
const WILD_SHAPE_CR_BY_LEVEL: ReadonlyArray<{ minLevel: number; maxCR: number }> = [
  { minLevel: 8, maxCR: 1 },
  { minLevel: 4, maxCR: 0.5 },
  { minLevel: 2, maxCR: 0.25 },
];

const wildShapeMaxCR = (druidLevel: number): number => {
  for (const tier of WILD_SHAPE_CR_BY_LEVEL) {
    if (druidLevel >= tier.minLevel) return tier.maxCR;
  }
  return 0;
};

export interface WildShapeIntent {
  readonly type: 'WildShape';
  readonly druidId: string;
  readonly form: PolymorphForm;
  readonly formCR: number;
  // The form's natural movement modes. Used to enforce the level-gated
  // restrictions: <L4 can't take forms with a flying speed; <L8 can't
  // either (per the level-gated tiers in PHB 2024). The consumer
  // declares these explicitly so the engine doesn't have to peek
  // inside the form's stat block for speeds.
  readonly formHasFlyingSpeed?: boolean;
  readonly at?: string;
}

/**
 * RAW 2024 Wild Shape: druid feature, bonus action, transforms the
 * druid into a Beast form. Uses one Wild Shape charge per use; PHB
 * 2024 grants 2 charges that recover on a short rest. CR cap scales
 * with druid level: 1/4 at L2, 1/2 at L4, 1 at L8. Flying-speed forms
 * are gated until L8.
 *
 * Validates: druid level ≥ 2, has a Wild Shape resource pool with at
 * least 1 remaining, the form's CR is within the level cap, and the
 * druid isn't already polymorphed.
 *
 * Emits: ActionEconomyConsumed(bonusAction) if in an active encounter,
 * ResourceSpent('wild-shape', 1), PolymorphApplied(kind='wild-shape').
 * Wild Shape doesn't consume concentration in 2024 RAW.
 */
export const planWildShape = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: WildShapeIntent,
): ReadonlyArray<Event> => {
  const druid = state.characters[intent.druidId];
  invariant(druid !== undefined, `Druid ${intent.druidId} not found`);
  const druidClass = druid.classes.find((c) => c.classId === 'druid');
  invariant(druidClass !== undefined, `${intent.druidId} is not a druid`);
  invariant(
    druidClass.level >= WILD_SHAPE_DRUID_MIN_LEVEL,
    `Wild Shape requires druid level ${WILD_SHAPE_DRUID_MIN_LEVEL}+`,
  );

  const maxCR = wildShapeMaxCR(druidClass.level);
  if (intent.formCR > maxCR) {
    throw new Error(`Form CR ${intent.formCR} exceeds Wild Shape cap at druid ${druidClass.level} (max ${maxCR})`);
  }
  if (intent.formHasFlyingSpeed === true && druidClass.level < 8) {
    throw new Error('Flying-speed forms require druid level 8+');
  }

  invariant(druid.polymorphedSnapshot === undefined, `${intent.druidId} is already polymorphed`);

  const pool = druid.resources.find((r) => r.resourceId === WILD_SHAPE_RESOURCE_ID);
  invariant(pool !== undefined, `${intent.druidId} has no Wild Shape resource pool`);
  invariant(pool.current >= 1, 'No Wild Shape uses remaining');

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  if (state.activeEncounterId !== undefined) {
    const encounter = state.encounters[state.activeEncounterId];
    if (encounter !== undefined && encounter.combatants.some((c) => c.combatantId === intent.druidId)) {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ActionEconomyConsumed',
        encounterId: encounter.id,
        combatantId: intent.druidId,
        kind: 'bonusAction',
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

  const polymorphed: PolymorphAppliedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'PolymorphApplied',
    targetId: intent.druidId,
    casterId: intent.druidId,
    kind: 'wild-shape' as PolymorphKind,
    form: intent.form,
  };
  events.push(polymorphed);

  return events;
};

// Re-export the duration constants so test code can reference them
// without re-deriving the values.
export { WILD_SHAPE_DURATION_MINUTES };

const SIMULACRUM_MIN_SLOT = 7;
const SIMULACRUM_HP_DIVISOR = 2;
const SIMULACRUM_RUBY_DUST_GP = 1500;

export interface SimulacrumIntent {
  readonly type: 'Simulacrum';
  readonly casterId: string;
  readonly targetId: string;
  readonly slotLevel?: number;
  // The consumer affirms that the 1500 gp of ruby dust has been
  // procured and consumed. The engine doesn't track this commodity
  // directly (it's not a standard inventory item); flagging it here
  // lets the planner refuse a cast that forgot the material cost.
  readonly materialsConsumed: boolean;
  // Pre-allocated ID for the new creature, so consumers can wire UI to
  // the result before commit. Optional — the planner mints one if
  // omitted.
  readonly simulacrumId?: string;
  readonly at?: string;
}

export interface SimulacrumOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly simulacrumId: string;
}

/**
 * RAW 2024 Simulacrum: 7th-level illusion (Wizard), 12-hour casting
 * time, range Touch, duration Until Dispelled. Creates a Beast or
 * Humanoid duplicate of a creature you can see and touch, with half
 * the original's hit point maximum. Consumes 1500 gp of ruby dust.
 *
 * Validates: caster knows Simulacrum, has a 7th+ level slot, the
 * materials were consumed, target is alive (HP max >= 2 so the
 * Simulacrum has at least 1 HP), and the caster doesn't already
 * have an active Simulacrum. The 12-hour cast time is a consumer
 * concern (advance the in-game clock 12h around the call); the
 * engine doesn't enforce it.
 */
export const planSimulacrum = (
  state: CampaignState,
  _content: ResolvedContent,
  _rng: RNG,
  intent: SimulacrumIntent,
): SimulacrumOutcome => {
  const caster = state.characters[intent.casterId];
  invariant(caster !== undefined, `Caster ${intent.casterId} not found`);
  const target = state.characters[intent.targetId];
  invariant(target !== undefined, `Target ${intent.targetId} not found`);

  const knowsSpell =
    caster.knownSpells.includes('simulacrum') || caster.preparedSpells.includes('simulacrum');
  invariant(knowsSpell, `Caster ${intent.casterId} does not know Simulacrum`);
  const slotLevel = intent.slotLevel ?? SIMULACRUM_MIN_SLOT;
  invariant(slotLevel >= SIMULACRUM_MIN_SLOT, 'Simulacrum is a 7th-level spell');
  invariant(
    intent.materialsConsumed === true,
    `Simulacrum requires ${SIMULACRUM_RUBY_DUST_GP} gp of ruby dust (consumed); pass materialsConsumed: true`,
  );
  invariant(target.hp.max >= 2, 'Simulacrum target needs at least 2 HP max to leave the duplicate with 1');

  // "A creature can have only one Simulacrum at a time." Per RAW this
  // is the *target* — two simulacrums of the same person can't
  // coexist. (A wizard can have simulacrums of different targets.)
  // The reducer names the new creature `Simulacrum of <target.name>`,
  // so we look up by that pattern.
  const existing = Object.values(state.characters).some(
    (c) => c.kind === 'creature' && c.name === `Simulacrum of ${target.name}`,
  );
  invariant(!existing, `${target.name} already has an active Simulacrum`);

  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  const declared: SpellCastDeclaredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.casterId,
    spellId: 'simulacrum',
    slotLevel,
    slotSource: 'standard',
    targetIds: [intent.targetId],
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

  const simulacrumId = intent.simulacrumId ?? newCharacterId();
  const hpMax = Math.max(1, Math.floor(target.hp.max / SIMULACRUM_HP_DIVISOR));
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SimulacrumCreated',
    simulacrumId,
    originalId: intent.targetId,
    hpMax,
    causedByEventId: declared.id,
  } satisfies SimulacrumCreatedEvent);

  return { events, simulacrumId };
};

const WISH_MIN_SLOT = 9;
const WISH_STRESS_FAILURE_THRESHOLD = 33;

// The eight predefined Wish effects (PHB 2024). Choosing one of these
// avoids the stress cascade entirely. Anything else carries
// `couldStress: true` — the consumer rolls a d100 and, on a result of
// 33 or lower (RAW: "you can never cast Wish again, and you take
// 1d10 force damage per level of every spell cast in the previous turn"
// — simplified here to "you gain a level of exhaustion and may take a
// permanent reduction in CON" later), gets `stressApplied: true` and a
// level of exhaustion. The engine records the freeform description on
// the event for transcript purposes.
const WISH_PREDEFINED_EFFECTS = [
  'duplicate-8th-or-lower-spell',
  'cure-wounds-mass',
  'create-non-magical-item',
  'undo-damage',
  'undo-condition',
  'grant-resistance',
  'grant-immunity',
  'restore-from-death',
] as const;
type WishPredefinedEffect = (typeof WISH_PREDEFINED_EFFECTS)[number];

export interface WishIntent {
  readonly type: 'Wish';
  readonly granterId: string;
  readonly description: string;
  // When set, the wish is one of the eight predefined PHB effects.
  // RAW: choosing a predefined effect avoids the stress cascade
  // (and the "may never cast Wish again" lockout).
  readonly predefinedEffect?: WishPredefinedEffect;
  readonly slotLevel?: number;
  readonly at?: string;
}

export interface WishOutcome {
  readonly events: ReadonlyArray<Event>;
  readonly stressApplied: boolean;
}

/**
 * RAW 2024 Wish: 9th-level conjuration (Sorcerer / Wizard), action,
 * range Self, V, duration Instantaneous. The simplest effect is to
 * duplicate any other spell of 8th level or lower. Eight predefined
 * effects avoid the stress cascade entirely. Anything else stresses
 * the caster: they roll a d100 and, on 33 or lower, "you can't cast
 * Wish again until you finish 1d4 long rests" plus 1d10 necrotic
 * damage per level of every spell cast in the previous turn (RAW
 * 2014; 2024 simplifies to exhaustion + lockout).
 *
 * The engine records:
 *   - SpellSlotConsumed (9th slot)
 *   - WishGranted (description, stressApplied flag)
 *   - ExhaustionChanged (when stressApplied)
 *
 * The d100 is rolled by the planner; consumers can short-circuit it
 * by passing a predefined effect.
 */
export const planWish = (
  state: CampaignState,
  _content: ResolvedContent,
  rng: RNG,
  intent: WishIntent,
): WishOutcome => {
  const granter = state.characters[intent.granterId];
  invariant(granter !== undefined, `Granter ${intent.granterId} not found`);
  const knowsSpell =
    granter.knownSpells.includes('wish') || granter.preparedSpells.includes('wish');
  invariant(knowsSpell, `${intent.granterId} does not know Wish`);
  const slotLevel = intent.slotLevel ?? WISH_MIN_SLOT;
  invariant(slotLevel >= WISH_MIN_SLOT, 'Wish is a 9th-level spell');
  invariant(intent.description.length > 0, 'Wish requires a description of the desired effect');

  const at = intent.at ?? nowIso();
  const events: Event[] = [];
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SpellCastDeclared',
    characterId: intent.granterId,
    spellId: 'wish',
    slotLevel,
    slotSource: 'standard',
    targetIds: [intent.granterId],
    castAsRitual: false,
  } satisfies SpellCastDeclaredEvent);
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'SpellSlotConsumed',
    characterId: intent.granterId,
    slotLevel,
  } satisfies SpellSlotConsumedEvent);

  // Stress cascade. Predefined effects bypass it entirely.
  let stressApplied = false;
  if (intent.predefinedEffect === undefined) {
    const d100 = rollDie(100, rng);
    stressApplied = d100 <= WISH_STRESS_FAILURE_THRESHOLD;
  }
  events.push({
    id: newEventId() as ULID,
    at,
    type: 'WishGranted',
    granterId: intent.granterId,
    description: intent.description,
    stressApplied,
  } satisfies WishGrantedEvent);
  if (stressApplied) {
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ExhaustionChanged',
      targetId: intent.granterId as ULID,
      fromLevel: granter.exhaustion,
      toLevel: Math.min(6, granter.exhaustion + 1),
    });
  }
  return { events, stressApplied };
};