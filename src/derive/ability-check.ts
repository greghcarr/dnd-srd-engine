import type { Character } from '../schemas/runtime/character.js';
import type { ItemInstance } from '../schemas/runtime/item-instance.js';
import type { PendingChoice } from '../schemas/runtime/pending-choice.js';
import type { ResolvedContent } from '../content/pack.js';
import type { AbilityScore, Skill } from '../schemas/primitives.js';
import { SKILL_ABILITY, PROFICIENCY_MULTIPLIER } from '../schemas/primitives.js';
import { abilityModifier, effectiveAbilityScore, proficiencyBonus } from './ability.js';
import { computeTotalLevel } from '../schemas/runtime/character.js';
import { buildEffectStack } from './effect-stack.js';
import { wearsUntrainedBodyArmor } from './armor-training.js';
import { EXHAUSTION_SAVE_PENALTY_PER_LEVEL } from '../internal/constants.js';

export interface AbilityCheckBreakdownEntry {
  readonly source: string;
  readonly value: number;
}

export interface AbilityCheckResult {
  readonly total: number;
  readonly breakdown: ReadonlyArray<AbilityCheckBreakdownEntry>;
  readonly hasAdvantage: boolean;
  readonly hasDisadvantage: boolean;
  // Slice 539: Halfling Luck flag (surfaced from the bearer's effect
  // stack). When true and the chosen d20 of the check is a natural 1,
  // the planner rerolls once and uses the new die per RAW.
  readonly hasHalflingLuck: boolean;
  // Slice 580: auto-fail flag (RAW user: Deafened auto-fails ability
  // checks that require hearing). The pack carries SetAdvantage
  // entries with mode: 'auto-fail' gated on event.sense; the
  // EffectAccumulator tracks them via autoFail per ability/skill;
  // this exposes the flag to planAbilityCheck so the d20 + modifiers
  // are bypassed and the check emits as a forced failure.
  readonly hasAutoFail: boolean;
  // Slice 738: Rogue L7 Reliable Talent marker (from the bearer's effect
  // stack). When true AND `usesProficiency` is true, planAbilityCheck
  // treats a d20 of 9 or lower as a 10.
  readonly hasReliableTalent: boolean;
  // True when an explicit skill (or tool) proficiency contributed to this
  // check (proficient / expertise) — NOT the half-proficiency floor, which
  // RAW doesn't count as a proficiency you "have". Gates Reliable Talent.
  readonly usesProficiency: boolean;
}

export interface ComputeAbilityCheckInput {
  readonly character: Character;
  readonly itemInstances: Readonly<Record<string, ItemInstance>>;
  readonly content: ResolvedContent;
  readonly ability: AbilityScore;
  readonly skill?: Skill;
  readonly pendingChoices?: Readonly<Record<string, PendingChoice>>;
  // Optional: when provided, source-relative formulas on condition
  // effects (Aura of Protection's +CHA-mod-of-source) resolve via
  // the source character's stats. Saves already thread this since
  // slice 64; slice 105 closes the same RAW gap for ability checks
  // so the Paladin's L6 Aura of Protection applies to both rolls.
  readonly characters?: Readonly<Record<string, Character>>;
  // Slice 263: the in-fiction sense the check relies on (sight /
  // hearing / smell / touch / taste). RAW magic items can gate their
  // advantage on a specific sense (Eyes of the Eagle: "Advantage on
  // WIS (Perception) checks that rely on sight"). Populated by the
  // consumer who knows the narrative context; defaults to undefined
  // (advantage gated on a specific sense will NOT apply when the
  // consumer didn't specify).
  readonly sense?: 'sight' | 'hearing' | 'smell' | 'touch' | 'taste';
  // Slice 274: the specific Strength (Athletics) sub-action the check
  // resolves. Mirror of `sense` but on a different axis: RAW magic
  // items can gate Athletics advantage on a specific sub-action
  // (Gloves of Swimming and Climbing: "Advantage on any Strength
  // (Athletics) check you make to climb or swim"). The five-value
  // enum covers the 2024 PHB-named Athletics applications. Populated
  // by the consumer; defaults to undefined (advantage gated on a
  // specific sub-action will NOT apply when the consumer didn't
  // specify).
  readonly athleticsSubAction?: 'climb' | 'swim' | 'jump' | 'grapple' | 'shove';
  // Slice 276: consumer-supplied LoS fact for the Frightened
  // condition's ability-check disadvantage arm. RAW: "Disadvantage
  // on ability checks ... while the source of fear is within line
  // of sight." The engine doesn't model line of sight; the consumer
  // supplies the value. Semantics:
  //   true  -> source visible (disadvantage applies; default RAW
  //            reading when no information is available).
  //   false -> source NOT visible (RAW bypass; no disadvantage).
  //   undefined -> consumer didn't specify; default-apply (same as
  //                true). Mirror of AttackIntent.bearerCanSeeFearSource
  //                on the attack-roll arm.
  readonly bearerCanSeeFearSource?: boolean;
  // Slice 279: consumer-supplied ambient-light fact for items / spells
  // that gate effects on light level (Cloak of the Bat: "Advantage on
  // Dexterity (Stealth) checks while in dim light or darkness").
  // Same opt-in semantic as slice 263 `sense?` and slice 274
  // `athleticsSubAction?`: the engine doesn't model scene lighting,
  // the consumer reports the value. Predicates that require a
  // specific light level evaluate false when this is undefined, so
  // the bearer must explicitly receive the consumer-supplied value
  // to get the gated benefit. The three-value enum matches the
  // 2024 PHB / DMG light-tier vocabulary.
  readonly lightLevel?: 'bright' | 'dim' | 'darkness';
  // Slice 465: consumer-supplied "this ability check is to end the
  // named condition" fact, mirroring the slice-291 save-side
  // `savePreventsCondition`. RAW driver: 2024 Goliath Powerful Build
  // grants Advantage on "any ability check you make to end the Grappled
  // condition" — the escape attempt can be Athletics OR Acrobatics
  // (or any other), so the fact is condition-keyed rather than skill-
  // keyed (the slice-274 `athleticsSubAction` would miss the
  // Acrobatics-escape arm). Same opt-in semantic: the consumer reports
  // the condition the check ends, and gated effects fire only when
  // it matches. Generic checks leave this undefined.
  readonly endingCondition?: string;
  // Slice 807: RAW Charmed Social Advantage — "the charmer has Advantage
  // on any ability check to interact with you socially." The engine has
  // no social-interaction model (an ability check carries no target
  // creature), so the consumer designates the creature this social check
  // is directed at; when that creature is Charmed by the checker and the
  // skill is a social one (Persuasion / Deception / Intimidation /
  // Performance), the check gains Advantage. Resolved against
  // `characters`. Omitted → no such advantage.
  readonly socialCheckTargetId?: string;
}

const exhaustionPenalty = (level: number): number =>
  EXHAUSTION_SAVE_PENALTY_PER_LEVEL * level;

export const computeAbilityCheck = (input: ComputeAbilityCheckInput): AbilityCheckResult => {
  const effects = buildEffectStack(input);
  const baseScore = input.character.abilityScores[input.ability];
  const floor = effects.effectiveAbilityScoreFloor(input.ability)?.value;
  const increase = effects.effectiveAbilityScoreIncrease(input.ability);
  // Slice 835: a drained ability lowers the check (Athletics off a drained STR).
  const drain = input.character.abilityDrain?.[input.ability];
  const abilityMod = abilityModifier(effectiveAbilityScore(baseScore, floor, increase, drain));
  const breakdown: AbilityCheckBreakdownEntry[] = [
    { source: `${input.ability}-mod`, value: abilityMod },
  ];

  const fullProfBonus = proficiencyBonus(computeTotalLevel(input.character));
  // Track whether any explicit proficiency contribution is applied to
  // this check. If not, and the actor has Jack of All Trades (or any
  // GrantHalfProficiencyBonusFloor effect), apply floor(profBonus / 2)
  // as a fallback.
  let proficiencyApplied = false;
  if (input.skill !== undefined) {
    const expectedAbility = SKILL_ABILITY[input.skill];
    if (expectedAbility === input.ability) {
      const profLevel = effects.proficiencyLevel('skill', input.skill);
      const multiplier = PROFICIENCY_MULTIPLIER[profLevel];
      if (multiplier > 0) {
        const bonus = Math.floor(fullProfBonus * multiplier);
        breakdown.push({ source: `skill-prof(${profLevel})`, value: bonus });
        proficiencyApplied = true;
      }
    }
  }

  if (!proficiencyApplied && effects.hasHalfProficiencyBonusFloor()) {
    const halfProf = Math.floor(fullProfBonus / 2);
    if (halfProf > 0) {
      breakdown.push({ source: 'jack-of-all-trades', value: halfProf });
    }
  }

  const skillModifier = input.skill !== undefined
    ? effects.modifierSum({ kind: 'skill', skill: input.skill })
    : 0;
  if (skillModifier !== 0) {
    breakdown.push({ source: 'skill-modifier', value: skillModifier });
  }

  const checkModifier = effects.modifierSum({ kind: 'check', ability: input.ability });
  if (checkModifier !== 0) {
    breakdown.push({ source: 'check-modifier', value: checkModifier });
  }

  if (input.character.exhaustion > 0) {
    breakdown.push({ source: 'exhaustion', value: exhaustionPenalty(input.character.exhaustion) });
  }

  // Slice 263: thread `event.sense` so predicated SetAdvantage entries
  // (Eyes of the Eagle's sight-only Perception advantage) can gate on
  // the in-fiction sense. Undefined sense means "consumer didn't
  // specify" — predicated entries that require a specific sense
  // evaluate false.
  // Slice 274: `event.athleticsSubAction` is the sibling axis for
  // Athletics-only advantage gates (Gloves of Swimming and Climbing).
  // Same undefined-means-no-match semantics.
  // Slice 276: `bearer.canSeeFearSource` carries the consumer-supplied
  // LoS fact for the Frightened gate. Default-apply semantics: the
  // predicate is `not eq value:false`, so undefined and true both
  // fire the disadvantage. Consumers that model line of sight pass
  // `false` to bypass.
  const facts = new Map<string, unknown>([
    ['event.sense', input.sense],
    ['event.athleticsSubAction', input.athleticsSubAction],
    ['bearer.canSeeFearSource', input.bearerCanSeeFearSource],
    // Slice 279: ambient-light fact (Cloak of the Bat dim-light gate).
    ['bearer.lightLevel', input.lightLevel],
    // Slice 465: condition-ended fact (Goliath Powerful Build's
    // "ability check to end the Grappled condition" gate).
    ['event.endingCondition', input.endingCondition],
  ]);
  // Slice 265: a skill check IS an ability check (RAW: skill check =
  // ability mod + skill bonus + d20). Pre-slice, `advantageFor` was
  // queried only on the skill target when skill was set, missing
  // advantage / disadvantage applied at the underlying ability-check
  // level. Result: poisoned (slice 264 disadvantage on all 6 checks)
  // didn't apply to Athletics; Bull's Strength advantage on STR
  // checks didn't apply to Athletics either. Fix: query BOTH the
  // skill target AND the underlying ability's check target, merge
  // results. (This mirrors how `modifierSum` already adds both skill
  // and check modifiers above.)
  const skillAdv = input.skill !== undefined
    ? effects.advantageFor({ kind: 'skill', skill: input.skill }, facts)
    : { advantage: false, disadvantage: false, autoCrit: false, autoFail: false };
  const checkAdv = effects.advantageFor({ kind: 'check', ability: input.ability }, facts);
  // Slice 798: armor with the Stealth-disadvantage property (RAW
  // equipment.md — Padded, Scale Mail, Half Plate, Ring Mail, Splint,
  // Chain Mail, Plate) imposes Disadvantage on Dexterity (Stealth)
  // checks while worn. The `stealthDisadvantage` flag was authored on
  // every armor entry but never read, so plate-wearers rolled Stealth
  // normally. Resolved the same way `computeAC` reads the equipped
  // armor (instance → definition); shields don't carry the flag.
  const armorStealthDisadvantage = (() => {
    if (input.skill !== 'stealth') return false;
    const armorInstanceId = input.character.equipped.armor;
    if (armorInstanceId === undefined) return false;
    const armorInstance = input.itemInstances[armorInstanceId];
    const armorDef = armorInstance ? input.content.items.get(armorInstance.definitionId) : undefined;
    return armorDef?.itemKind === 'armor' && armorDef.stealthDisadvantage === true;
  })();
  // Slice 804: RAW Armor Training — wearing Light/Medium/Heavy armor you
  // lack training with gives Disadvantage on "any D20 Test that involves
  // Strength or Dexterity", which covers STR/DEX ability + skill checks.
  const untrainedArmorStrDexDisadvantage =
    (input.ability === 'STR' || input.ability === 'DEX') &&
    wearsUntrainedBodyArmor(input.character, input.content, input.itemInstances, effects);
  // Slice 807: the Charmer's Advantage on a social ability check directed
  // at a creature Charmed by them (consumer-designated target).
  const SOCIAL_SKILLS: ReadonlySet<Skill> = new Set(['persuasion', 'deception', 'intimidation', 'performance']);
  const charmerSocialAdvantage =
    input.socialCheckTargetId !== undefined &&
    input.skill !== undefined && SOCIAL_SKILLS.has(input.skill) &&
    input.characters?.[input.socialCheckTargetId]?.appliedConditions.some(
      (c) => c.conditionId === 'charmed' && c.sourceCharacterId === input.character.id,
    ) === true;
  const adv = {
    advantage: skillAdv.advantage || checkAdv.advantage || charmerSocialAdvantage,
    disadvantage: skillAdv.disadvantage || checkAdv.disadvantage || armorStealthDisadvantage || untrainedArmorStrDexDisadvantage,
    autoCrit: skillAdv.autoCrit || checkAdv.autoCrit,
    autoFail: skillAdv.autoFail || checkAdv.autoFail,
  };
  const total = breakdown.reduce((sum, e) => sum + e.value, 0);
  return {
    total,
    breakdown,
    hasAdvantage: adv.advantage && !adv.disadvantage,
    hasDisadvantage: adv.disadvantage && !adv.advantage,
    hasHalflingLuck: effects.hasHalflingLuck(),
    // Slice 580: auto-fail (RAW user: Deafened auto-fails ability
    // checks that require hearing). Mirror of slice 576's save-side
    // hasAutoFail. The EffectAccumulator merges autoFail from both
    // the skill target and the underlying ability target — the
    // existing slice 265 merge above already handles this for adv +
    // disadv; we mirror it here for autoFail.
    hasAutoFail: adv.autoFail,
    hasReliableTalent: effects.hasReliableTalent(),
    usesProficiency: proficiencyApplied,
  };
};

export const computePassiveScore = (input: ComputeAbilityCheckInput): number => {
  const PASSIVE_BASE = 10;
  const check = computeAbilityCheck(input);
  const advantageBonus = check.hasAdvantage ? 5 : check.hasDisadvantage ? -5 : 0;
  return PASSIVE_BASE + check.total + advantageBonus;
};
