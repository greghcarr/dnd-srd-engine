import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ConcentrationBrokenEvent } from '../../schemas/events/concentration.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { DamageComponent } from '../../schemas/events/combat.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, parseDiceExpression } from '../../rng/dice.js';
import { applyHalflingLuckFromFlag } from './_halfling-luck.js';
import { newAppliedConditionId, newEventId } from '../../ids.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { applyAll } from '../apply.js';
import { isImmuneToCondition } from '../../derive/condition-immunity.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';
import type { AuraTrigger } from '../../schemas/content/spell.js';

const CONCENTRATION_MIN_DC = 10;
const CONCENTRATION_DC_DIVISOR = 2;

const totalOfComponents = (components: ReadonlyArray<DamageComponent>): number =>
  components.reduce((sum, c) => sum + c.amount, 0);

const concentrationDC = (damageTaken: number): number =>
  Math.max(CONCENTRATION_MIN_DC, Math.floor(damageTaken / CONCENTRATION_DC_DIVISOR));

/**
 * Predicts whether the given mitigated damage will reduce the target's
 * current HP to zero or below, after temp HP absorbs first. Mirrors the
 * arithmetic in applyDamageApplied so the planner can decide what
 * follow-on events to emit before the reducer runs.
 */
const damageWouldDropTo0 = (
  target: Character,
  mitigated: ReadonlyArray<DamageComponent>,
): boolean => {
  if (target.hp.current <= 0) return false;
  const total = totalOfComponents(mitigated);
  if (total <= 0) return false;
  const afterTemp = Math.max(0, total - target.hp.temp);
  return target.hp.current - afterTemp <= 0;
};

/**
 * RAW 2024 PHB ch.7: falling unconscious ends concentration immediately.
 * If `target` is concentrating and the `mitigated` damage would drop it
 * to 0 HP, emit `ConcentrationBroken` so its effects clear in the same
 * event chain as the damage that downed it.
 *
 * Returns at most one event. Callers append it after `DamageApplied`.
 *
 * Slice 601: prefer `planConcentrationOnDamage` for the full RAW path —
 * it ALSO rolls the per-damage CON save that this helper omits. Kept as
 * the unconscious-only variant for tests and the rare call site that
 * has no RNG available.
 */
export const planConcentrationBreakOnDrop = (
  target: Character,
  mitigated: ReadonlyArray<DamageComponent>,
  causedByEventId: ULID,
  at: string,
): ReadonlyArray<Event> => {
  if (target.concentrationEffectId === undefined) return [];
  if (!damageWouldDropTo0(target, mitigated)) return [];
  const broken: ConcentrationBrokenEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConcentrationBroken',
    effectInstanceId: target.concentrationEffectId,
    casterId: target.id as ULID,
    reason: 'unconscious',
    causedByEventId,
  };
  return [broken];
};

/**
 * Roll a single CON save for a single source of damage and return the
 * SaveRolled event. Pure helper; doesn't decide whether to break
 * concentration — that's the caller's job in `planConcentrationOnDamage`.
 */
const rollConcentrationSave = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  target: Character,
  damageAmount: number,
  at: string,
): SaveRolledEvent => {
  const dc = concentrationDC(damageAmount);
  const saveDerivation = computeSavingThrow({
    character: target,
    itemInstances: state.itemInstances,
    content,
    ability: 'CON',
    characters: state.characters,
    isConcentrationCheck: true,
  });
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  const d20 = applyHalflingLuckFromFlag(rolls[0]!, saveDerivation.hasHalflingLuck, rolls, rng);
  const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
  const bonus = saveDerivation.total + saveBonus.total;
  const totalRoll = d20 + bonus;
  const success = totalRoll >= dc;
  return {
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: target.id as ULID,
    ability: 'CON',
    dc,
    d20: rolls,
    used: 'none',
    bonus,
    total: totalRoll,
    success,
    breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
  };
};

/**
 * RAW 2024 PHB Concentration (slices 601 + 612):
 *
 * > Whenever you take damage while you are concentrating on a spell,
 * > you must make a Constitution saving throw to maintain your
 * > concentration. The DC equals 10 or half the damage you take
 * > (rounded down), whichever number is higher. **If you take damage
 * > from multiple sources, such as an arrow and a dragon's breath,
 * > you make a separate saving throw for each source of damage.**
 *
 * Plus:
 *
 * > You also lose concentration on a spell if you are incapacitated
 * > or if you die.
 *
 * Behavior:
 *   1. would-drop-to-0 → immediately emit `ConcentrationBroken (unconscious)`,
 *      no saves needed (RAW: 0 HP → Unconscious → ends concentration).
 *   2. non-fatal damage with N components → roll ONE save per component
 *      (slice 612). DC per save = max(10, floor(componentAmount / 2)).
 *      On any failure: emit `SaveRolled` (fail) + `ConcentrationBroken
 *      (failedSave)` and STOP — once concentration breaks, subsequent
 *      sources can't break what's already broken. Matches the RAW
 *      narrative reading "first source, save; second source, save; …".
 *
 * Slice 601 rolled a single save against the totaled damage. For a
 * single-component damage event (the common case) behavior is
 * identical (1 component → 1 save). For multi-component (1d8 piercing
 * + 1d6 Hex necrotic) the pre-slice-612 path under-rolled (1 save vs
 * the larger DC); now rolls 2 saves vs the per-source DCs.
 *
 * Callers append the returned events after their `DamageApplied`. The
 * save uses the standard `computeSavingThrow` derivation so Bless /
 * Bane / War Caster / Eldritch Mind / Halfling Luck all wire through.
 *
 * Damage of 0 across all components returns no events — RAW: no damage
 * taken, no save.
 */
export const planConcentrationOnDamage = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  target: Character,
  mitigated: ReadonlyArray<DamageComponent>,
  causedByEventId: ULID,
  at: string,
): ReadonlyArray<Event> => {
  if (target.concentrationEffectId === undefined) return [];
  const total = totalOfComponents(mitigated);
  if (total <= 0) return [];

  if (damageWouldDropTo0(target, mitigated)) {
    const broken: ConcentrationBrokenEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: target.concentrationEffectId,
      casterId: target.id as ULID,
      reason: 'unconscious',
      causedByEventId,
    };
    return [broken];
  }

  // Slice 612: per-source saves. Iterate components in order; on the
  // first failure, emit Broken and stop.
  const events: Event[] = [];
  for (const component of mitigated) {
    if (component.amount <= 0) continue;
    const save = rollConcentrationSave(state, content, rng, target, component.amount, at);
    events.push(save);
    if (!save.success) {
      events.push({
        id: newEventId() as ULID,
        at,
        type: 'ConcentrationBroken',
        effectInstanceId: target.concentrationEffectId,
        casterId: target.id as ULID,
        reason: 'failedSave',
        causedByEventId: save.id,
      } satisfies ConcentrationBrokenEvent);
      break;
    }
  }
  return events;
};

export interface CheckConcentrationIntent {
  readonly type: 'CheckConcentration';
  readonly characterId: string;
  readonly damageTaken: number;
  readonly at?: string;
}

export const planCheckConcentration = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: CheckConcentrationIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (character.concentrationEffectId === undefined) {
    return [];
  }
  if (intent.damageTaken <= 0) {
    return [];
  }

  const at = intent.at ?? nowIso();
  const dc = concentrationDC(intent.damageTaken);
  const saveDerivation = computeSavingThrow({
    character,
    itemInstances: state.itemInstances,
    content,
    ability: 'CON',
    characters: state.characters,
    // Slice 515: surface "this save is a Concentration check" to the
    // SetAdvantage condition facts so Eldritch Mind etc. can gate on it.
    isConcentrationCheck: true,
  });
  const rolls: number[] = [rollDie(D20_SIDES, rng)];
  // Slice 543: Halfling Luck on Concentration save.
  const d20 = applyHalflingLuckFromFlag(rolls[0]!, saveDerivation.hasHalflingLuck, rolls, rng);
  // Slice 331: per-roll save bonus dice (Bless +1d4 / Bane -1d4).
  const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
  const bonus = saveDerivation.total + saveBonus.total;
  const total = d20 + bonus;
  const success = total >= dc;

  const save: SaveRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'SaveRolled',
    targetId: intent.characterId as ULID,
    ability: 'CON',
    dc,
    d20: rolls,
    used: 'none',
    bonus,
    total,
    success,
    breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
  };
  const events: Event[] = [save];

  if (!success) {
    const broken: ConcentrationBrokenEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: character.concentrationEffectId,
      casterId: intent.characterId as ULID,
      reason: 'failedSave',
      causedByEventId: save.id,
    };
    events.push(broken);
  }
  return events;
};

export interface ExpireSpellDurationsIntent {
  readonly type: 'ExpireSpellDurations';
  readonly at?: string;
}

/**
 * Returns ConcentrationBroken (reason='durationEnded') events for every
 * active effect whose listed duration has elapsed by the current
 * in-game time. Consumers call this after committing an
 * InGameTimeAdvanced event so listed-duration spells (Bless 1 min,
 * Heroes' Feast 24h) clear at the right time without manual bookkeeping.
 *
 * Only effects with `durationMinutes` and `startedAtMinutes` populated
 * are considered. Instantaneous, Until dispelled, and Special spells
 * have no listed duration and never auto-expire.
 */
export const planExpireSpellDurations = (
  state: CampaignState,
  _content: ResolvedContent,
  intent: ExpireSpellDurationsIntent,
): ReadonlyArray<Event> => {
  const at = intent.at ?? nowIso();
  const now = state.inGameTime.totalMinutes;
  const events: Event[] = [];
  for (const effect of Object.values(state.effectInstances)) {
    if (effect.durationMinutes === undefined) continue;
    if (effect.startedAtMinutes === undefined) continue;
    if (now < effect.startedAtMinutes + effect.durationMinutes) continue;
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: effect.id,
      casterId: effect.casterId,
      reason: 'durationEnded',
    } satisfies ConcentrationBrokenEvent);
  }
  return events;
};

export interface TickAuraIntent {
  readonly type: 'TickAura';
  readonly casterId: string;
  readonly targetIds: ReadonlyArray<string>;
  // Optional activation moment. Multi-component zones (Hunger of
  // Hadar's cold-on-enter + acid-on-turn-end) tag each mechanic
  // with a trigger; the planner fires only matching ones. Legacy
  // mechanics (no trigger on the mechanic itself) fire on every
  // tickAura call regardless. If the intent omits `trigger`, only
  // legacy mechanics fire — triggered mechanics need an explicit
  // intent.trigger to activate.
  readonly trigger?: AuraTrigger;
  readonly at?: string;
}

/**
 * Runs one tick of the caster's active concentration aura against the
 * specified targets. Used by Spirit Guardians and similar concentration
 * auras with the `aura-damage` mechanic. The consumer is responsible
 * for choosing which targets are affected this turn — RAW Spirit
 * Guardians: "creatures you choose within 15 feet of you, when they
 * enter the area for the first time on a turn or start their turn
 * there." The engine doesn't enforce position / per-turn deduplication;
 * it just rolls saves and emits damage.
 */
export const planTickAura = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: TickAuraIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  if (!caster) throw new Error(`Unknown caster ${intent.casterId}`);
  const effectId = caster.concentrationEffectId;
  if (effectId === undefined) {
    throw new Error('Caster has no active concentration');
  }
  const effect = state.effectInstances[effectId];
  if (!effect) throw new Error('Caster concentration effect not found');
  const spell = content.spells.get(effect.spellId);
  if (!spell) throw new Error(`Spell ${effect.spellId} not found in content`);
  // Pick every aura-damage mechanic whose trigger matches the intent.
  // Legacy mechanics (no trigger set) fire on every call. Triggered
  // mechanics fire only when intent.trigger matches their own trigger
  // — multi-component zones like Hunger of Hadar (cold on enter +
  // acid on turn end) need the consumer to call tickAura twice with
  // the right intent.trigger.
  const auras = spell.mechanicalEffects.filter(
    (m): m is Extract<typeof m, { kind: 'aura-damage' }> => {
      if (m.kind !== 'aura-damage') return false;
      if (m.trigger === undefined) return true;
      return m.trigger === intent.trigger;
    },
  );
  if (auras.length === 0) {
    throw new Error(`Spell ${spell.id} has no aura-damage mechanic matching trigger`);
  }

  const slotLevel = effect.slotLevel ?? spell.level;
  const slotsAboveBase = Math.max(0, slotLevel - spell.level);
  const at = intent.at ?? nowIso();

  // Compute the spell's save DC from the caster.
  const dcResult = computeSpellSaveDC({
    character: caster,
    itemInstances: state.itemInstances,
    content,
    classId: findCastingClassForSpell(caster, content, spell.id),
    characters: state.characters,
  });

  const events: Event[] = [];
  for (const aura of auras) {
  for (const targetId of intent.targetIds) {
    const target = state.characters[targetId];
    if (!target) continue;

    // Roll the save (if configured). No-save zones (Cloud of Daggers
    // and similar auto-damage areas) skip the save block; damage and
    // condition apply unconditionally per RAW.
    let saveCausedById: ULID | undefined;
    let saveSucceeded = false;
    if (aura.saveAbility !== undefined) {
      const saveDerivation = computeSavingThrow({
        character: target,
        itemInstances: state.itemInstances,
        content,
        ability: aura.saveAbility,
        characters: state.characters,
      });
      const rolls: number[] = [rollDie(D20_SIDES, rng)];
      // Slice 543: Halfling Luck on the aura save target side.
      const d20 = applyHalflingLuckFromFlag(rolls[0]!, saveDerivation.hasHalflingLuck, rolls, rng);
      const saveBonus = rollSaveBonusDice(saveDerivation.bonusDice, rng);
      const bonus = saveDerivation.total + saveBonus.total;
      const total = d20 + bonus;
      saveSucceeded = total >= dcResult.total;
      const saveEvent: SaveRolledEvent = {
        id: newEventId() as ULID,
        at,
        type: 'SaveRolled',
        targetId: targetId as ULID,
        ability: aura.saveAbility,
        dc: dcResult.total,
        d20: rolls,
        used: 'none',
        bonus,
        total,
        success: saveSucceeded,
        breakdown: [...saveDerivation.breakdown, ...saveBonus.breakdown],
      };
      events.push(saveEvent);
      saveCausedById = saveEvent.id;
    }
    const causedByEventId: ULID =
      saveCausedById ?? (effect.startedAtEventId as ULID);

    // Roll the damage once per target (per-target rolling is the RAW
    // for per-turn aura ticks — Spirit Guardians says "the creature
    // takes 3d8 damage" not "the spell rolls 3d8 once for all
    // creatures hit"). Damage is optional: condition-only zones
    // (Stinking Cloud, Entangle) skip this block.
    if (aura.damageDice !== undefined && aura.damageType !== undefined) {
      const extraDice = (aura.extraDicePerSlotLevel ?? 0) * slotsAboveBase;
      const parsed = parseDiceExpression(aura.damageDice);
      const dieCount = parsed.count + extraDice;
      let rawDamage = parsed.modifier;
      for (let i = 0; i < dieCount; i++) {
        rawDamage += rollDie(parsed.die, rng);
      }
      const halfOnSuccess = aura.halfOnSuccess !== false;
      const noSave = aura.saveAbility === undefined;
      const final = noSave
        ? rawDamage
        : saveSucceeded && halfOnSuccess
          ? Math.floor(rawDamage / 2)
          : saveSucceeded
            ? 0
            : rawDamage;
      if (final > 0) {
        const mitigated = mitigateDamage({
          character: target,
          itemInstances: state.itemInstances,
          content,
          rawComponents: [{ amount: final, type: aura.damageType }],
          characters: state.characters,
          sourceIsMagical: true,
        });
        const damageId = newEventId() as ULID;
        const intercept = interceptFatalDamage({
          state: applyAll(state, events),
          content,
          targetId,
          mitigatedComponents: mitigated,
          causedByEventId: damageId,
          at,
          rng,
        });
        events.push({
          id: damageId,
          at,
          type: 'DamageApplied',
          targetId: targetId as ULID,
          components: intercept.components,
          causedByEventId,
          sourceCharacterId: intent.casterId as ULID,
          source: spell.id,
        });
        events.push(...intercept.extraEvents);
        // Slice 612: per-target aura damage now triggers a concentration
        // check on the target (a hostile caster's Spirit Guardians can
        // break the bearer's concentration on Hex etc.). Mirrors the
        // direct-damage path's slice-601 wiring.
        events.push(
          ...planConcentrationOnDamage(
            applyAll(state, events),
            content,
            rng,
            target,
            intercept.components,
            damageId,
            at,
          ),
        );
      }
    }

    // Apply the optional condition. When a save was rolled, the
    // condition fires only on failure; when no save is rolled, the
    // condition applies unconditionally. Gated by the target's
    // existing immunities so Aura of Courage's Frightened immunity
    // (etc.) blocks the condition cleanly.
    const applyCondition =
      aura.conditionOnFail !== undefined &&
      (aura.saveAbility === undefined || !saveSucceeded);
    if (applyCondition && aura.conditionOnFail !== undefined) {
      const immune = isImmuneToCondition({
        state,
        content,
        targetId,
        conditionId: aura.conditionOnFail,
        sourceCharacterId: intent.casterId,
      });
      if (!immune) {
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'ConditionApplied',
          targetId: targetId as ULID,
          conditionId: aura.conditionOnFail,
          appliedConditionId: newAppliedConditionId(),
          causedByEventId,
        });
      }
    }
  }
  }
  return events;
};

export interface TickMovementDamageIntent {
  readonly type: 'TickMovementDamage';
  readonly casterId: string;
  readonly targetId: string;
  readonly feetMoved: number;
  readonly at?: string;
}

/**
 * Damage per 5 ft moved through a movement-damage zone (Spike
 * Growth: 2d4 piercing per 5 ft). The consumer detects a creature
 * moving through the zone and calls this with the total feet moved
 * through the area; the planner rolls `damageDicePerFiveFeet` once
 * per 5-ft increment (floored — 7 ft = 1 hit) and emits a single
 * DamageApplied with the summed amount. No save; this is RAW
 * auto-damage tied to traversal.
 */
export const planTickMovementDamage = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: TickMovementDamageIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  if (!caster) throw new Error(`Unknown caster ${intent.casterId}`);
  const effectId = caster.concentrationEffectId;
  if (effectId === undefined) {
    throw new Error('Caster has no active concentration');
  }
  const effect = state.effectInstances[effectId];
  if (!effect) throw new Error('Caster concentration effect not found');
  const spell = content.spells.get(effect.spellId);
  if (!spell) throw new Error(`Spell ${effect.spellId} not found in content`);
  const mechanic = spell.mechanicalEffects.find((m) => m.kind === 'movement-damage');
  if (mechanic === undefined || mechanic.kind !== 'movement-damage') {
    throw new Error(`Spell ${spell.id} has no movement-damage mechanic`);
  }

  const target = state.characters[intent.targetId];
  if (!target) return [];
  const hits = Math.floor(intent.feetMoved / 5);
  if (hits <= 0) return [];

  const parsed = parseDiceExpression(mechanic.damageDicePerFiveFeet);
  let rawDamage = parsed.modifier * hits;
  for (let h = 0; h < hits; h += 1) {
    for (let d = 0; d < parsed.count; d += 1) {
      rawDamage += rollDie(parsed.die, rng);
    }
  }
  if (rawDamage <= 0) return [];

  const at = intent.at ?? nowIso();
  const mitigated = mitigateDamage({
    character: target,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount: rawDamage, type: mechanic.damageType }],
    characters: state.characters,
    sourceIsMagical: true,
  });
  const damageId = newEventId() as ULID;
  const intercept = interceptFatalDamage({
    state,
    content,
    targetId: intent.targetId,
    mitigatedComponents: mitigated,
    causedByEventId: damageId,
    at,
    rng,
  });
  const damageApplied: Event = {
    id: damageId,
    at,
    type: 'DamageApplied',
    targetId: intent.targetId as ULID,
    components: intercept.components,
    causedByEventId: effect.startedAtEventId as ULID,
    sourceCharacterId: intent.casterId as ULID,
    source: spell.id,
  };
  const events: Event[] = [damageApplied, ...intercept.extraEvents];
  // Slice 612: a target moving through Spike Growth (or future
  // movement-damage zones) and taking damage must roll a concentration
  // save like any other damage source.
  events.push(
    ...planConcentrationOnDamage(
      applyAll(state, events),
      content,
      rng,
      target,
      intercept.components,
      damageId,
      at,
    ),
  );
  return events;
};

export interface TickRecurringIntent {
  readonly type: 'TickRecurring';
  readonly casterId: string;
  readonly targetId: string;
  readonly at?: string;
}

/**
 * One tick of a recurring spell effect against the named target.
 * The consumer calls this at the start of each target's turn (or
 * whichever cadence the spell's RAW specifies) while the caster's
 * concentration on the spell holds. Heroism (temp HP at start of
 * each turn) is the canonical example.
 *
 * Reads the caster's concentration effect, finds the spell's
 * `recurring` SpellMechanic, rolls the per-tick amount (dice +
 * flat + caster ability mod when configured), and emits the
 * matching event:
 *   - effect: 'temp-hp' → TempHPGranted
 *   - effect: 'heal' → Healed
 *   - effect: 'damage' → DamageApplied (with damageType)
 */
export const planTickRecurring = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: TickRecurringIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  if (!caster) throw new Error(`Unknown caster ${intent.casterId}`);
  const effectId = caster.concentrationEffectId;
  if (effectId === undefined) {
    throw new Error('Caster has no active concentration');
  }
  const effect = state.effectInstances[effectId];
  if (!effect) throw new Error('Caster concentration effect not found');
  const spell = content.spells.get(effect.spellId);
  if (!spell) throw new Error(`Spell ${effect.spellId} not found in content`);
  const mechanic = spell.mechanicalEffects.find((m) => m.kind === 'recurring');
  if (mechanic === undefined || mechanic.kind !== 'recurring') {
    throw new Error(`Spell ${spell.id} has no recurring mechanic`);
  }

  const target = state.characters[intent.targetId];
  if (!target) return [];

  let rolled = 0;
  if (mechanic.amountDice !== undefined) {
    const parsed = parseDiceExpression(mechanic.amountDice);
    // Slice 503: per-tick upcast scaling. Each slot above the spell's
    // base level adds `extraDicePerSlotLevel` of the same die to every
    // tick (Ensnaring Strike: +1d6 per slot above 1).
    const slotsAbove = Math.max(0, (effect.slotLevel ?? spell.level) - spell.level);
    const bonusDiceCount = (mechanic.extraDicePerSlotLevel ?? 0) * slotsAbove;
    let sum = parsed.modifier;
    for (let i = 0; i < parsed.count + bonusDiceCount; i += 1) {
      sum += rollDie(parsed.die, rng);
    }
    rolled = sum;
  }
  const flat = mechanic.flatAmount ?? 0;
  const abilityBonus =
    mechanic.addCasterAbilityMod !== undefined
      ? Math.floor((caster.abilityScores[mechanic.addCasterAbilityMod] - 10) / 2)
      : 0;
  const amount = Math.max(0, rolled + flat + abilityBonus);
  if (amount <= 0) return [];

  const at = intent.at ?? nowIso();
  const causedByEventId = effect.startedAtEventId as ULID;

  if (mechanic.effect === 'temp-hp') {
    return [
      {
        id: newEventId() as ULID,
        at,
        type: 'TempHPGranted',
        targetId: intent.targetId as ULID,
        amount,
        source: spell.id,
        causedByEventId,
      },
    ];
  }
  if (mechanic.effect === 'heal') {
    return [
      {
        id: newEventId() as ULID,
        at,
        type: 'Healed',
        targetId: intent.targetId as ULID,
        amount,
        source: spell.id,
        causedByEventId,
      },
    ];
  }
  // damage
  if (mechanic.damageType === undefined) {
    throw new Error(`Recurring damage mechanic on ${spell.id} missing damageType`);
  }
  const mitigated = mitigateDamage({
    character: target,
    itemInstances: state.itemInstances,
    content,
    rawComponents: [{ amount, type: mechanic.damageType }],
    characters: state.characters,
    sourceIsMagical: true,
  });
  const damageId = newEventId() as ULID;
  const intercept = interceptFatalDamage({
    state,
    content,
    targetId: intent.targetId,
    mitigatedComponents: mitigated,
    causedByEventId: damageId,
    at,
    rng,
  });
  const damageApplied: Event = {
    id: damageId,
    at,
    type: 'DamageApplied',
    targetId: intent.targetId as ULID,
    components: intercept.components,
    causedByEventId,
    sourceCharacterId: intent.casterId as ULID,
    source: spell.id,
  };
  const events: Event[] = [damageApplied, ...intercept.extraEvents];
  // Slice 612: recurring-damage ticks (Stirge drain, Cloud of Daggers,
  // etc.) trigger concentration saves on the target like any other
  // damage source.
  events.push(
    ...planConcentrationOnDamage(
      applyAll(state, events),
      content,
      rng,
      target,
      intercept.components,
      damageId,
      at,
    ),
  );
  return events;
};

const findCastingClassForSpell = (
  caster: Character,
  content: ResolvedContent,
  spellId: string,
): string => {
  // Pick the first of the caster's classes that the spell lists as one
  // of its eligible casting classes. The spell's `classes` array is the
  // source of truth for "who can cast this." Falls back to the caster's
  // primary class so the DC computation always has something to work
  // with — for ill-formed content this at least produces a sensible
  // number.
  const spell = content.spells.get(spellId);
  if (spell !== undefined) {
    for (const cls of caster.classes) {
      if (spell.classes.includes(cls.classId)) return cls.classId;
    }
  }
  return caster.classes[0]?.classId ?? 'cleric';
};
