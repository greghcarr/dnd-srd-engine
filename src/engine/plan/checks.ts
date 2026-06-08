import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type {
  AbilityCheckRolledEvent,
  CheckAdvantage,
  SaveRolledEvent,
} from '../../schemas/events/checks.js';
import type { AbilityScore, Skill } from '../../schemas/primitives.js';
import { SKILL_ABILITY } from '../../schemas/primitives.js';
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
import { collectEffectsFromCharacter } from '../../derive/effect-stack.js';
import type { Effect } from '../../schemas/effects.js';

// Slice 738: Rogue Reliable Talent treats a d20 of 9 or lower as a 10.
const RELIABLE_TALENT_FLOOR = 10;

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

// Slice 662: ability-substitution gate now reads `GrantAbilitySubstitution`
// effects from the bearer's effective effect stack instead of
// hardcoding Primal Knowledge's class / level / condition / ability /
// skills. RAW shape: "for ability checks using <skill> ∈ skills,
// you can use <ability> instead — optionally only while a named
// condition is active." Canonical user today: Barbarian L3 Primal
// Knowledge (ability='STR', skills=[acrobatics, intimidation,
// perception, stealth, survival], activeWhileConditionId='raging').
// Future users (Stoneskin's "STR vs grappling escape" etc.) author a
// GrantAbilitySubstitution and the planner picks it up automatically.

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
  // Slice 659 / 662 / 663: opt-in flag was for "validate this
  // substitution." As of slice 663 the substitution check is
  // ALWAYS enforced: the planner accepts (ability, skill) iff the
  // ability matches the skill's RAW-default (per SKILL_ABILITY)
  // OR a GrantAbilitySubstitution on the bearer's effect stack
  // covers the requested combo (and its activeWhileConditionId,
  // if set, is satisfied). The flag is retained as a no-op for
  // back-compat with existing call sites; it has no effect on
  // gating today and may be removed in a future major version.
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
  // Slice 663: always-enforce ability substitutions. When a skill
  // is supplied, the planner accepts iff:
  //   1. The requested ability is the skill's RAW default
  //      (SKILL_ABILITY[skill]), OR
  //   2. The bearer has a GrantAbilitySubstitution covering the
  //      requested (ability, skill) AND (if the grant carries an
  //      activeWhileConditionId) that condition is active.
  // Otherwise the planner throws — the consumer can't pick an
  // arbitrary ability for a skill check. Raw ability checks (no
  // skill on the intent) are unaffected (any ability is permitted
  // for a generic check; the caller is asserting they want that
  // specific ability check).
  if (intent.skill !== undefined && intent.ability !== SKILL_ABILITY[intent.skill]) {
    const grants = collectEffectsFromCharacter({
      character,
      content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    }).filter(
      (e): e is Extract<Effect, { kind: 'GrantAbilitySubstitution' }> =>
        e.kind === 'GrantAbilitySubstitution',
    );
    const conditionActive = (id: string): boolean =>
      character.appliedConditions.some((c) => c.conditionId === id);
    const matched = grants.find(
      (g) =>
        g.ability === intent.ability &&
        g.skills.includes(intent.skill!) &&
        (g.activeWhileConditionId === undefined || conditionActive(g.activeWhileConditionId)),
    );
    if (matched === undefined) {
      const have = grants.length === 0
        ? '(no ability substitutions granted)'
        : grants
            .map((g) => `${g.ability}+[${g.skills.join(',')}]${g.activeWhileConditionId ? ` while ${g.activeWhileConditionId}` : ''}`)
            .join('; ');
      throw new Error(
        `${character.name} cannot use ability='${intent.ability}' for skill='${intent.skill}' (RAW default is '${SKILL_ABILITY[intent.skill]}'): no ability substitution matching this combination [granted: ${have}]`,
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
  // Slice 738: Rogue L7 Reliable Talent — on a check that uses one of the
  // bearer's skill/tool proficiencies, treat a d20 of 9 or lower as a 10.
  // Applied after the Halfling Luck reroll so the (possibly rerolled) chosen
  // die is the one floored. The `d20: rolls` array still shows the actual
  // die; the floor surfaces in `total` + a breakdown marker.
  const reliableTalentApplies =
    derivation.hasReliableTalent && derivation.usesProficiency && d20 < RELIABLE_TALENT_FLOOR;
  if (reliableTalentApplies) {
    d20 = RELIABLE_TALENT_FLOOR;
  }
  const reliableTalentBreakdown = reliableTalentApplies
    ? [{ source: 'reliable-talent', value: 0 }]
    : [];
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
    breakdown: [...derivation.breakdown, ...autoFailBreakdown, ...reliableTalentBreakdown],
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
