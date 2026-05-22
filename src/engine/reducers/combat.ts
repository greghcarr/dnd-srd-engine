import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type {
  ConditionAppliedEvent,
  ConditionRemovedEvent,
  CreaturePushedEvent,
  CreatureDestroyedEvent,
  DamageAppliedEvent,
  DeathSaveRolledEvent,
  ExhaustionChangedEvent,
  HealedEvent,
  HPMaxBonusChangedEvent,
  StabilizedEvent,
  TempHPGrantedEvent,
} from '../../schemas/events/combat.js';
import type { Character, DeathSaves } from '../../schemas/runtime/character.js';
import { invariant } from '../../internal/invariants.js';
import { newAppliedConditionId } from '../../ids.js';
import { EXHAUSTION_MAX } from '../../schemas/primitives.js';
import { clearConcentrationEffect } from './concentration.js';

const DEATH_SAVE_SUCCESSES_TO_STABILIZE = 3;
const DEATH_SAVE_FAILURES_TO_DIE = 3;
const DEATH_SAVE_NAT_20 = 20;
const DEATH_SAVE_NAT_1 = 1;
const DEATH_SAVE_SUCCESS_THRESHOLD = 10;
const DEATH_SAVE_NAT_1_FAILURE_COUNT = 2;
const NAT_20_REVIVE_HP = 1;
const EXHAUSTION_DEFAULT_LEVEL = 1;

const requireCharacter = (state: Draft<CampaignState>, id: string): Draft<Character> => {
  const c = state.characters[id];
  invariant(c !== undefined, `Character ${id} not found`);
  return c;
};

const effectiveHpMax = (character: Pick<Character, 'hp'>): number =>
  character.hp.max + (character.hp.maxBonus ?? 0);

const isMassiveDamage = (
  hpBeforeDamage: number,
  hpAfterDamage: number,
  hpMax: number,
): boolean => hpBeforeDamage > 0 && hpAfterDamage < 0 && Math.abs(hpAfterDamage) >= hpMax;

const resetDeathSaves = (saves: Draft<DeathSaves>): void => {
  saves.successes = 0;
  saves.failures = 0;
  saves.stable = false;
};

const absorbTempHP = (character: Draft<Character>, rawDamage: number): number => {
  if (character.hp.temp <= 0) return rawDamage;
  const absorbed = Math.min(character.hp.temp, rawDamage);
  character.hp.temp -= absorbed;
  return rawDamage - absorbed;
};

const totalDamageOf = (event: DamageAppliedEvent): number =>
  event.components.reduce((sum, c) => sum + c.amount, 0);

const incrementFailures = (saves: Draft<DeathSaves>, by: number): void => {
  saves.failures = Math.min(saves.failures + by, DEATH_SAVE_FAILURES_TO_DIE);
};

export const applyDamageApplied = (
  state: Draft<CampaignState>,
  event: DamageAppliedEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  // Slice 232: record damage types for the Regeneration suppression
  // check at next turn-start. Deduped append; consumed + cleared by
  // planAdvanceTurn's regeneration hook. The reducer doesn't need
  // content (we don't look up the Regeneration suppressedBy list
  // here); the planner reads both the recorded types and the
  // effect stack at turn-start.
  for (const component of event.components) {
    if (!character.damageTypesTakenThisTurn.includes(component.type)) {
      character.damageTypesTakenThisTurn.push(component.type);
    }
  }
  const remainingAfterTemp = absorbTempHP(character, totalDamageOf(event));
  const startedConscious = character.hp.current > 0;
  const hpBeforeClamp = character.hp.current - remainingAfterTemp;
  character.hp.current = Math.max(hpBeforeClamp, -character.hp.max);

  const tookDamageWhileDown = !startedConscious && remainingAfterTemp > 0;
  if (tookDamageWhileDown) {
    incrementFailures(character.deathSaves, 1);
    character.deathSaves.stable = false;
    return;
  }
  // Massive-damage threshold compares against effective HP max
  // (stored max + active modifier bonus from Aid etc.). RAW: a 30-HP
  // character with Aid (+5 hpMax) has an effective max of 35 and only
  // dies instantly when a single hit drops them past -35 HP.
  const effMax = effectiveHpMax(character);
  if (isMassiveDamage(character.hp.current + remainingAfterTemp, hpBeforeClamp, effMax)) {
    character.hp.current = -effMax;
    character.deathSaves.failures = DEATH_SAVE_FAILURES_TO_DIE;
    character.deathSaves.stable = false;
    return;
  }
  const newlyDowned = startedConscious && character.hp.current <= 0;
  if (newlyDowned) {
    resetDeathSaves(character.deathSaves);
    // RAW 2024 PHB ch.7: "Becoming Incapacitated or dying immediately
    // ends Concentration." Defensive — planAttack / planCastSpell /
    // planFalling / planWeaponMastery already pair DamageApplied with
    // an explicit ConcentrationBroken event via planConcentrationBreakOnDrop,
    // but consumers issuing raw DamageApplied events (environmental
    // hazards, custom planners) would otherwise leave the caster
    // holding concentration from beyond unconsciousness.
    if (character.concentrationEffectId !== undefined) {
      clearConcentrationEffect(state, character.concentrationEffectId);
    }
  }
};

export const applyHealed = (state: Draft<CampaignState>, event: HealedEvent): void => {
  const character = requireCharacter(state, event.targetId);
  if (event.amount <= 0) return;
  const wasUnconscious = character.hp.current <= 0;
  if (character.hp.current < 0) character.hp.current = 0;
  if (wasUnconscious) resetDeathSaves(character.deathSaves);
  character.hp.current = Math.min(character.hp.current + event.amount, character.hp.max);
};

export const applyTempHPGranted = (
  state: Draft<CampaignState>,
  event: TempHPGrantedEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  if (event.amount > character.hp.temp) {
    character.hp.temp = event.amount;
  }
};

export const applyConditionApplied = (
  state: Draft<CampaignState>,
  event: ConditionAppliedEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  if (event.conditionId === 'exhaustion') {
    const level = event.level ?? EXHAUSTION_DEFAULT_LEVEL;
    character.exhaustion = Math.min(EXHAUSTION_MAX, character.exhaustion + level);
    return;
  }
  const existing = character.appliedConditions.find(
    (c) => c.conditionId === event.conditionId,
  );
  if (existing) return;
  // Use the triggering event id as the applied-condition id when none was supplied.
  // This keeps replay deterministic even when the consumer omits an explicit id.
  character.appliedConditions.push({
    id: event.appliedConditionId ?? event.id,
    conditionId: event.conditionId,
    sourceEventId: event.id,
    ...(event.sourceCharacterId !== undefined
      ? { sourceCharacterId: event.sourceCharacterId }
      : {}),
    ...(event.level !== undefined ? { level: event.level } : {}),
    ...(event.expiresOnRound !== undefined ? { expiresOnRound: event.expiresOnRound } : {}),
    ...(event.expiryTrigger !== undefined ? { expiryTrigger: event.expiryTrigger } : {}),
    ...(event.hpMaxBonusDelta !== undefined && event.hpMaxBonusDelta !== 0
      ? { hpMaxBonusDelta: event.hpMaxBonusDelta }
      : {}),
    ...(event.sourceEffectInstanceId !== undefined
      ? { sourceEffectInstanceId: event.sourceEffectInstanceId }
      : {}),
    ...(event.recurringSaveDC !== undefined ? { recurringSaveDC: event.recurringSaveDC } : {}),
    ...(event.recurringSaveAbility !== undefined
      ? { recurringSaveAbility: event.recurringSaveAbility }
      : {}),
    ...(event.riderDamageDice !== undefined ? { riderDamageDice: event.riderDamageDice } : {}),
    ...(event.endsOnDamage !== undefined ? { endsOnDamage: event.endsOnDamage } : {}),
  });
  if (event.hpMaxBonusDelta !== undefined && event.hpMaxBonusDelta !== 0) {
    character.hp.maxBonus = (character.hp.maxBonus ?? 0) + event.hpMaxBonusDelta;
  }
};

export const applyConditionRemoved = (
  state: Draft<CampaignState>,
  event: ConditionRemovedEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  // Reverse any hpMax bonus the condition had contributed, then drop
  // it. Walking the matching entries keeps the math symmetric with
  // applyConditionApplied (which stamps the delta on the entry).
  for (const applied of character.appliedConditions) {
    if (applied.conditionId !== event.conditionId) continue;
    if (applied.hpMaxBonusDelta !== undefined && applied.hpMaxBonusDelta !== 0) {
      character.hp.maxBonus = (character.hp.maxBonus ?? 0) - applied.hpMaxBonusDelta;
    }
  }
  character.appliedConditions = character.appliedConditions.filter(
    (c) => c.conditionId !== event.conditionId,
  );
};

export const applyCreaturePushed = (
  _state: Draft<CampaignState>,
  _event: CreaturePushedEvent,
): void => {
  // No-op: positions are consumer state. The event is a log entry
  // the consumer reads to apply the position change. Same shape as
  // TriggerFired — informational, not state-mutating.
};

export const applyExhaustionChanged = (
  state: Draft<CampaignState>,
  event: ExhaustionChangedEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  invariant(
    character.exhaustion === event.fromLevel,
    `Exhaustion mismatch on ${event.targetId}: expected ${event.fromLevel}, was ${character.exhaustion}`,
  );
  character.exhaustion = event.toLevel;
};

export const applyDeathSaveRolled = (
  state: Draft<CampaignState>,
  event: DeathSaveRolledEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  // RAW: death saves apply whenever you're at 0 HP. This engine lets
  // hp.current go negative internally to track massive-damage overflow,
  // but rules-side anything ≤ 0 is "at 0 HP" for death-save purposes.
  invariant(
    character.hp.current <= 0,
    `Death saves only apply at 0 HP (character ${event.targetId} has ${character.hp.current})`,
  );

  if (event.d20 === DEATH_SAVE_NAT_20) {
    character.hp.current = NAT_20_REVIVE_HP;
    resetDeathSaves(character.deathSaves);
    return;
  }
  if (event.d20 === DEATH_SAVE_NAT_1) {
    incrementFailures(character.deathSaves, DEATH_SAVE_NAT_1_FAILURE_COUNT);
    return;
  }
  const success = event.d20 >= DEATH_SAVE_SUCCESS_THRESHOLD;
  if (success) {
    character.deathSaves.successes = Math.min(
      character.deathSaves.successes + 1,
      DEATH_SAVE_SUCCESSES_TO_STABILIZE,
    );
    if (character.deathSaves.successes >= DEATH_SAVE_SUCCESSES_TO_STABILIZE) {
      character.deathSaves.stable = true;
    }
    return;
  }
  incrementFailures(character.deathSaves, 1);
};

export const applyStabilized = (
  state: Draft<CampaignState>,
  event: StabilizedEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  resetDeathSaves(character.deathSaves);
  character.deathSaves.stable = true;
};

// Slice 323: instant death, bypassing the death-save sequence. Sets
// HP to 0 and death-save failures to the kill threshold, so derivations
// that read "dead" via death saves see a dead creature. RAW "dying
// immediately ends Concentration", so a destroyed concentrator drops
// its effect (mirrors the massive-damage / newly-downed paths above).
export const applyCreatureDestroyed = (
  state: Draft<CampaignState>,
  event: CreatureDestroyedEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  character.hp.current = 0;
  character.deathSaves.failures = DEATH_SAVE_FAILURES_TO_DIE;
  character.deathSaves.successes = 0;
  character.deathSaves.stable = false;
  if (character.concentrationEffectId !== undefined) {
    clearConcentrationEffect(state, character.concentrationEffectId);
  }
};

export const applyHPMaxBonusChanged = (
  state: Draft<CampaignState>,
  event: HPMaxBonusChangedEvent,
): void => {
  const character = requireCharacter(state, event.targetId);
  character.hp.maxBonus = (character.hp.maxBonus ?? 0) + event.delta;
};
