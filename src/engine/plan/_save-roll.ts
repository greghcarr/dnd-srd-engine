import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { SaveRolledEvent } from '../../schemas/events/checks.js';
import type { AbilityScore } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { coverDexSaveBonus, type CoverKind } from './attack.js';
import { newEventId } from '../../ids.js';
import { D20_SIDES } from '../../internal/constants.js';
import type { ULID } from '../ids-utils.js';

export interface SaveRollResult {
  readonly event: SaveRolledEvent;
  readonly success: boolean;
}

export interface RollSaveInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly targetId: string;
  readonly ability: AbilityScore;
  readonly dc: number;
  readonly sourceIsMagical: boolean;
  readonly rng: RNG;
  readonly at: string;
  // When the save's success ends a specific condition (a recurring save
  // that lifts Hold Person, etc.), surface that condition id so
  // per-condition save-advantage buffs (Antitoxin's poisoned gate) fire.
  // Threaded into computeSavingThrow only when present.
  readonly savePreventsCondition?: string;
  // Optional causation link stamped on the emitted SaveRolled (the
  // breath-weapon chain points its save at the BreathWeaponFired marker).
  readonly causedByEventId?: string;
  // Slice 550: optional cover modifier. RAW (SRD 5.2.1 Cover): "A
  // target with half cover has a +2 bonus to AC and Dexterity saving
  // throws. A target with three-quarters cover has a +5 bonus..."
  // Applied only when ability === 'DEX' (RAW scopes it to Dex saves
  // alone). Caller-supplied per save site since the engine doesn't
  // model positions; consumers (UI / VTT) determine cover and pass it.
  readonly cover?: CoverKind;
  // Slice 847: force an extra advantage source on this save (RAW Hideous
  // Laughter's damage-triggered repeat save). Threaded into
  // computeSavingThrow so it nets against any disadvantage source per RAW;
  // default (undefined / false) leaves the roll byte-identical.
  readonly advantage?: boolean;
}

// Rolls a fixed-DC saving throw for `targetId` against `dc`, baking the
// d20(s) and computed bonus into a SaveRolled event. Consumes RNG, so it
// belongs to the planner layer (never reducers). Returns undefined when
// the target id doesn't resolve. The shared save-roll primitive for the
// attack on-hit-save rider, use-item Save, recurring-save, and breath
// weapon.
export const rollSaveAgainstDC = (input: RollSaveInput): SaveRollResult | undefined => {
  const target = input.state.characters[input.targetId];
  if (!target) return undefined;
  const derivation = computeSavingThrow({
    character: target,
    itemInstances: input.state.itemInstances,
    content: input.content,
    ability: input.ability,
    characters: input.state.characters,
    sourceIsMagical: input.sourceIsMagical,
    ...(input.advantage === true ? { extraAdvantage: true } : {}),
    ...(input.savePreventsCondition !== undefined
      ? { savePreventsCondition: input.savePreventsCondition }
      : {}),
  });
  const rolls: number[] = [rollDie(D20_SIDES, input.rng, 'save')];
  if (derivation.hasAdvantage || derivation.hasDisadvantage) {
    rolls.push(rollDie(D20_SIDES, input.rng, 'save'));
  }
  const used = derivation.hasAdvantage
    ? 'advantage'
    : derivation.hasDisadvantage
      ? 'disadvantage'
      : 'none';
  let usedD20 = derivation.hasAdvantage
    ? Math.max(...rolls)
    : derivation.hasDisadvantage
      ? Math.min(...rolls)
      : rolls[0]!;
  // Slice 539: Halfling Luck (save arm). RAW: "When you roll a 1 on
  // the d20 of a D20 Test, you can reroll the die, and you must use
  // the new roll." Fires when the chosen d20 is a natural 1 AND the
  // target carries the marker (surfaced via SaveResult.hasHalflingLuck).
  // The reroll is appended to the d20 array; no second reroll.
  if (usedD20 === 1 && derivation.hasHalflingLuck) {
    const reroll = rollDie(D20_SIDES, input.rng);
    rolls.push(reroll);
    usedD20 = reroll;
  }
  // Slice 331: per-roll save bonus dice (Bless +1d4 / Bane -1d4), rolled
  // after the d20(s) and folded into the bonus + total + breakdown.
  const saveBonus = rollSaveBonusDice(derivation.bonusDice, input.rng);
  // Slice 550: cover bonus on Dex saves. Other abilities ignore cover.
  const coverBonus = input.ability === 'DEX' && input.cover !== undefined
    ? coverDexSaveBonus(input.cover)
    : 0;
  const coverBreakdown = coverBonus > 0
    ? [{ source: `cover (${input.cover!})`, value: coverBonus }]
    : [];
  const bonus = derivation.total + saveBonus.total + coverBonus;
  const total = usedD20 + bonus;
  // Slice 576: RAW auto-fail (Paralyzed / Stunned / Petrified /
  // Unconscious force-fail STR + DEX saves). The d20 + modifiers are
  // computed normally so the rolled values still appear on the event
  // (transcript visibility); the `success` is forced to false. The
  // breakdown gets an `'auto-fail'` source entry so a sheet display
  // can show the reason.
  const success = derivation.hasAutoFail ? false : total >= input.dc;
  const autoFailBreakdown = derivation.hasAutoFail
    ? [{ source: 'auto-fail', value: 0 }]
    : [];
  const event: SaveRolledEvent = {
    id: newEventId() as ULID,
    at: input.at,
    type: 'SaveRolled',
    targetId: input.targetId as ULID,
    ability: input.ability,
    dc: input.dc,
    d20: rolls,
    used,
    bonus,
    total,
    success,
    ...(input.causedByEventId !== undefined ? { causedByEventId: input.causedByEventId } : {}),
    breakdown: [
      ...derivation.breakdown,
      ...saveBonus.breakdown,
      ...coverBreakdown,
      ...autoFailBreakdown,
    ],
  };
  return { event, success };
};
