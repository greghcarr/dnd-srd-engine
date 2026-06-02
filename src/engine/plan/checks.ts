import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  AbilityCheckRolledEvent,
  CheckAdvantage,
  SaveRolledEvent,
} from '../../schemas/events/checks.js';
import type { AbilityScore, Skill } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { newEventId } from '../../ids.js';
import { computeSavingThrow } from '../../derive/save.js';
import { rollSaveBonusDice } from './_bonus-dice.js';
import { computeAbilityCheck } from '../../derive/ability-check.js';
import { coverDexSaveBonus, type CoverKind } from './attack.js';
import { D20_SIDES } from '../../internal/constants.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const rollWithAdvantage = (
  rng: RNG,
  advantage: CheckAdvantage,
): { rolls: number[]; used: number } => {
  const first = rollDie(D20_SIDES, rng);
  if (advantage === 'none') return { rolls: [first], used: first };
  const second = rollDie(D20_SIDES, rng);
  const used = advantage === 'advantage' ? Math.max(first, second) : Math.min(first, second);
  return { rolls: [first, second], used };
};

const resolveAdvantage = (
  requested: CheckAdvantage | undefined,
  derivedAdv: boolean,
  derivedDis: boolean,
): CheckAdvantage => {
  if (requested !== undefined && requested !== 'none') return requested;
  if (derivedAdv && !derivedDis) return 'advantage';
  if (derivedDis && !derivedAdv) return 'disadvantage';
  return 'none';
};

export interface SaveIntent {
  readonly type: 'Save';
  readonly characterId: string;
  readonly ability: AbilityScore;
  readonly dc: number;
  readonly advantage?: CheckAdvantage;
  // Slice 550: optional cover. RAW applies a +2 / +5 bonus to
  // Dexterity saves under half / three-quarters cover (mirror of AC).
  // Ignored for non-DEX ability saves.
  readonly cover?: CoverKind;
  readonly at?: string;
}

export const planSave = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: SaveIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const derivation = computeSavingThrow({
    character,
    itemInstances: state.itemInstances,
    content,
    ability: intent.ability,
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const used = resolveAdvantage(
    intent.advantage,
    derivation.hasAdvantage,
    derivation.hasDisadvantage,
  );
  const { rolls, used: initialD20 } = rollWithAdvantage(rng, used);
  // Slice 539: Halfling Luck (save arm via planSave). Mirror of the
  // _save-roll.ts wire; planSave uses its own rollWithAdvantage helper
  // rather than rollSaveAgainstDC, so the reroll is duplicated here.
  let d20 = initialD20;
  if (d20 === 1 && derivation.hasHalflingLuck) {
    const reroll = rollDie(D20_SIDES, rng);
    rolls.push(reroll);
    d20 = reroll;
  }
  const saveBonus = rollSaveBonusDice(derivation.bonusDice, rng);
  // Slice 550: cover bonus on Dex saves only.
  const coverBonus = intent.ability === 'DEX' && intent.cover !== undefined
    ? coverDexSaveBonus(intent.cover)
    : 0;
  const coverBreakdown = coverBonus > 0
    ? [{ source: `cover (${intent.cover!})`, value: coverBonus }]
    : [];
  const bonus = derivation.total + saveBonus.total + coverBonus;
  const total = d20 + bonus;
  // Slice 576: RAW auto-fail (Paralyzed / Stunned / Petrified /
  // Unconscious force-fail STR + DEX saves). Mirror of the wiring in
  // _save-roll.ts so both save paths behave identically.
  const success = derivation.hasAutoFail ? false : total >= intent.dc;
  const autoFailBreakdown = derivation.hasAutoFail
    ? [{ source: 'auto-fail', value: 0 }]
    : [];
  const event: SaveRolledEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'SaveRolled',
    targetId: intent.characterId,
    ability: intent.ability,
    dc: intent.dc,
    d20: rolls,
    used,
    bonus,
    total,
    success,
    breakdown: [
      ...derivation.breakdown,
      ...saveBonus.breakdown,
      ...coverBreakdown,
      ...autoFailBreakdown,
    ],
  };
  return [event];
};

export interface AbilityCheckIntent {
  readonly type: 'AbilityCheck';
  readonly characterId: string;
  readonly ability: AbilityScore;
  readonly skill?: Skill;
  readonly dc?: number;
  readonly advantage?: CheckAdvantage;
  // Slice 465: when present, marks this ability check as the attempt
  // to end the named condition (e.g. 'grappled'). Goliath's Powerful
  // Build gates Advantage on this fact. Mirrors the slice 291 save-
  // side `savePreventsCondition`; semantics in
  // [src/derive/ability-check.ts](../../derive/ability-check.ts).
  readonly endingCondition?: string;
  readonly at?: string;
}

export const planAbilityCheck = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: AbilityCheckIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  const derivation = computeAbilityCheck({
    character,
    itemInstances: state.itemInstances,
    content,
    ability: intent.ability,
    ...(intent.skill !== undefined ? { skill: intent.skill } : {}),
    ...(intent.endingCondition !== undefined
      ? { endingCondition: intent.endingCondition }
      : {}),
    pendingChoices: state.pendingChoices,
    characters: state.characters,
  });
  const used = resolveAdvantage(
    intent.advantage,
    derivation.hasAdvantage,
    derivation.hasDisadvantage,
  );
  const { rolls, used: initialD20 } = rollWithAdvantage(rng, used);
  // Slice 539: Halfling Luck (check arm). RAW: "When you roll a 1 on
  // the d20 of a D20 Test, you can reroll the die, and you must use
  // the new roll." Fires when the chosen d20 is a natural 1 AND the
  // bearer carries the marker (surfaced via AbilityCheckResult.
  // hasHalflingLuck). The reroll is appended to the d20 array; no
  // second reroll.
  let d20 = initialD20;
  if (d20 === 1 && derivation.hasHalflingLuck) {
    const reroll = rollDie(D20_SIDES, rng);
    rolls.push(reroll);
    d20 = reroll;
  }
  const total = d20 + derivation.total;
  const event: AbilityCheckRolledEvent = {
    id: newEventId() as ULID,
    at: intent.at ?? nowIso(),
    type: 'AbilityCheckRolled',
    characterId: intent.characterId,
    ability: intent.ability,
    ...(intent.skill !== undefined ? { skill: intent.skill } : {}),
    ...(intent.dc !== undefined ? { dc: intent.dc, success: total >= intent.dc } : {}),
    d20: rolls,
    used,
    bonus: derivation.total,
    total,
    breakdown: [...derivation.breakdown],
  };
  return [event];
};
