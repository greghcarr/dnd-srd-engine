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
  const at = intent.at ?? nowIso();
  const event: SaveRolledEvent = {
    id: newEventId() as ULID,
    at,
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
  // Slice 577: "Next saving throw" one-shot consume — mirror of
  // consumeOnAttack at the SaveRolled site. RAW user: Bardic
  // Inspiration (one of three consume sites alongside attack + check).
  const events: Event[] = [event];
  for (const applied of character.appliedConditions) {
    if (content.conditions.get(applied.conditionId)?.consumeOnSave !== true) continue;
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: character.id as ULID,
      conditionId: applied.conditionId,
    });
  }
  return events;
};

// Slice 659: Primal Knowledge's substitution arm. RAW (SRD 5.2.1
// Barbarian L3): "while your Rage is active, you can channel primal
// power when you attempt certain tasks; whenever you make an ability
// check using one of the following skills, you can make it as a
// Strength check even if it normally uses a different ability:
// Acrobatics, Intimidation, Perception, Stealth, or Survival."
//
// The five eligible skills are listed below. When the consumer sets
// `useAbilitySubstitution: true` on an AbilityCheckIntent, the
// planner enforces: the character is Barbarian L3+, the `raging`
// condition is active, the skill is in this set, and the requested
// `ability` is STR. If any gate fails, the planner throws.
const PRIMAL_KNOWLEDGE_SKILLS: ReadonlySet<Skill> = new Set([
  'acrobatics',
  'intimidation',
  'perception',
  'stealth',
  'survival',
]);
const PRIMAL_KNOWLEDGE_CLASS_ID = 'barbarian';
const PRIMAL_KNOWLEDGE_MIN_LEVEL = 3;
const PRIMAL_KNOWLEDGE_ABILITY: AbilityScore = 'STR';
const RAGING_CONDITION_ID = 'raging';

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
  // Slice 580: the in-fiction sense this check relies on. Threads
  // into computeAbilityCheck's `event.sense` fact (slice 263 wiring),
  // which gates Deafened's auto-fail-on-hearing-check arm and the
  // existing sense-specific advantage entries (Eyes of the Eagle).
  // Undefined = consumer didn't specify; sense-gated entries don't
  // fire.
  readonly sense?: 'sight' | 'hearing' | 'smell' | 'touch' | 'taste';
  // Slice 659: opt-in flag for a Primal Knowledge-style ability
  // substitution. When true, the planner enforces the
  // Primal-Knowledge gate (Barbarian L3+ raging, ability === 'STR',
  // skill in {acrobatics, intimidation, perception, stealth,
  // survival}). Default false preserves the engine's permissive
  // ability-acceptance for pre-existing tests.
  readonly useAbilitySubstitution?: boolean;
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
  // Slice 659: Primal Knowledge gate. When `useAbilitySubstitution`
  // is set, enforce: Barbarian L3+ enrollment, `raging` condition
  // active, ability === 'STR', skill is one of the 5 substitutable
  // skills.
  if (intent.useAbilitySubstitution === true) {
    const enrollment = character.classes.find((c) => c.classId === PRIMAL_KNOWLEDGE_CLASS_ID);
    if (enrollment === undefined || enrollment.level < PRIMAL_KNOWLEDGE_MIN_LEVEL) {
      throw new Error(
        `${character.name} does not have Primal Knowledge ability substitution (requires Barbarian level ${PRIMAL_KNOWLEDGE_MIN_LEVEL})`,
      );
    }
    const raging = character.appliedConditions.some((c) => c.conditionId === RAGING_CONDITION_ID);
    if (!raging) {
      throw new Error(
        `${character.name} cannot use Primal Knowledge ability substitution: Rage is not active`,
      );
    }
    if (intent.ability !== PRIMAL_KNOWLEDGE_ABILITY) {
      throw new Error(
        `Primal Knowledge substitution requires ability='STR' (got '${intent.ability}')`,
      );
    }
    if (intent.skill === undefined || !PRIMAL_KNOWLEDGE_SKILLS.has(intent.skill)) {
      throw new Error(
        `Primal Knowledge substitution requires a skill in {acrobatics, intimidation, perception, stealth, survival} (got '${intent.skill ?? 'none'}')`,
      );
    }
  }
  const derivation = computeAbilityCheck({
    character,
    itemInstances: state.itemInstances,
    content,
    ability: intent.ability,
    ...(intent.skill !== undefined ? { skill: intent.skill } : {}),
    ...(intent.endingCondition !== undefined
      ? { endingCondition: intent.endingCondition }
      : {}),
    ...(intent.sense !== undefined ? { sense: intent.sense } : {}),
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
  const at = intent.at ?? nowIso();
  // Slice 580: RAW auto-fail (Deafened auto-fails ability checks
  // requiring hearing). Mirror of slice 576's save-side wiring: the
  // d20 + modifiers are computed normally (transcripts show the roll)
  // but when a DC is supplied, `success` is forced to false. The
  // breakdown gains an 'auto-fail' source entry.
  const autoFailBreakdown = derivation.hasAutoFail
    ? [{ source: 'auto-fail', value: 0 }]
    : [];
  const successField = intent.dc !== undefined
    ? { dc: intent.dc, success: derivation.hasAutoFail ? false : total >= intent.dc }
    : {};
  const event: AbilityCheckRolledEvent = {
    id: newEventId() as ULID,
    at,
    type: 'AbilityCheckRolled',
    characterId: intent.characterId,
    ability: intent.ability,
    ...(intent.skill !== undefined ? { skill: intent.skill } : {}),
    ...successField,
    d20: rolls,
    used,
    bonus: derivation.total,
    total,
    breakdown: [...derivation.breakdown, ...autoFailBreakdown],
  };
  // Slice 577: "Next ability check" one-shot consume — mirror of
  // consumeOnAttack at the AbilityCheckRolled site. The bearer's
  // applied conditions with `consumeOnCheck: true` are removed after
  // the check, so a one-shot rider (Help-on-check advantage; one of
  // the three Bardic Inspiration consume sites) applies to exactly
  // one check.
  const events: Event[] = [event];
  for (const applied of character.appliedConditions) {
    if (content.conditions.get(applied.conditionId)?.consumeOnCheck !== true) continue;
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'ConditionRemoved',
      targetId: character.id as ULID,
      conditionId: applied.conditionId,
    });
  }
  return events;
};
