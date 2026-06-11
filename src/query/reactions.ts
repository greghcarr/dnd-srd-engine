// Slice 763: reaction affordances.
//
// "What reactions can this combatant take right now, and (given a trigger
// event) with what arguments?" Before this, the entire reaction category was
// undiscoverable from engine.query.* — a consumer had to hardcode each
// reaction against the event stream. Two halves, mirroring bonus-actions:
//   - `availableReactions(...)` enumerates the reactions a combatant OWNS,
//     each flagged enabled/disabled (a blocking condition, or the reaction
//     already spent this round) with the trigger kind it responds to. Pure +
//     read-only.
//   - `reactionsForTrigger(...)` is the correlation helper: given a trigger
//     EVENT (an AttackRolled / DamageApplied / SpellCastDeclared), it returns
//     ready-to-commit reaction intents with their params pre-filled from the
//     event. The consumer dispatches each by `intent.type` to the matching
//     typed planner (engine.plan.shield / cuttingWords / …) to get the rich
//     outcome and commit the events. The planner stays authoritative.
//
// One source of truth (the REGISTRY) so enumeration and correlation can't
// drift. Applicability reuses the proven decision predicates in
// src/ai/reactions.ts (the same logic the combat-fuzz reaction layer uses).
//
// Coverage (complete): Shield, Cutting Words, Uncanny Dodge, Counterspell
// (763), Stone's Endurance + Protection (765), Opportunity Attack (766),
// Deflect Attacks + Countercharm (767) — across the attack-roll / damage /
// spell-cast / leaves-reach / condition-applied triggers, each planner-faithful
// (its owns/correlate matches what the planner accepts, verified by dispatch).
// Deflect Attacks (damage trigger) and Countercharm (condition-applied trigger)
// need CROSS-EVENT context — the DamageApplied has no link to its attack, and
// the SaveRolled doesn't say which condition it gated — so they scan the
// optional `recentEvents` the consumer passes to reactionsForTrigger (the
// triggering AttackRolled / the preceding failed SaveRolled). Without
// recentEvents they don't correlate; every other reaction reads only the
// trigger event.

import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import type { Character } from '../schemas/runtime/character.js';
import type { Event } from '../schemas/events/index.js';
import type { AttackRolledEvent } from '../schemas/events/attack.js';
import type { DamageAppliedEvent } from '../schemas/events/combat.js';
import type { SpellCastDeclaredEvent } from '../schemas/events/spellcasting.js';
import type { ShieldIntent, CounterspellIntent, UncannyDodgeIntent, ProtectionIntent } from '../engine/plan/reactive-spells.js';
import type { CuttingWordsIntent } from '../engine/plan/cutting-words.js';
import type { StonesEnduranceIntent } from '../engine/plan/stones-endurance.js';
import type { OpportunityAttackIntent } from '../engine/plan/opportunity-attack.js';
import type { CombatantMovedEvent } from '../schemas/events/movement.js';
import type { DeflectAttacksIntent } from '../engine/plan/deflect-attacks.js';
import type { CountercharmIntent } from '../engine/plan/countercharm.js';
import type { SaveRolledEvent } from '../schemas/events/checks.js';
import type { ConditionAppliedEvent } from '../schemas/events/combat.js';
import { findActorBlockingCondition } from '../engine/plan/_actor-state.js';
import { findGoliathAncestryChoice } from '../engine/plan/_giant-ancestry.js';
import { chebyshevDistance } from '../engine/plan/movement.js';
import { buildEffectStack } from '../derive/effect-stack.js';
import { perDayFreeCastAvailable } from '../engine/plan/_per-day-free-cast.js';
import { SHIELD_AC_BONUS } from '../ai/reaction-constants.js';
import {
  shouldShield,
  shouldCuttingWords,
  shouldCounterspell,
  hasUncannyDodge,
  hasStonesEndurance,
  hasDeflectAttacks,
  hasCountercharm,
} from '../ai/reactions.js';
import { computeAvailableSpellSlots } from '../derive/spell-slots.js';

// ── Named constants ─────────────────────────────────────────────────
const SHIELD_SPELL_ID = 'shield';
const COUNTERSPELL_SPELL_ID = 'counterspell';
const COUNTERSPELL_SLOT_LEVEL = 3;
// Arcane classes that prepare Counterspell, for the casting-class (save-DC)
// arg. Mirrors SHIELD_CASTER_CLASS_IDS in src/ai/reactions.ts.
const ARCANE_CLASS_IDS: ReadonlyArray<string> = ['wizard', 'sorcerer'];
const SHIELD_SLOT_LEVEL = 1;
const STONES_ENDURANCE_ANCESTRY = 'stones-endurance';
// Protection reaches an ally within 5 ft (chebyshev, feet — slice 698).
const PROTECTION_REACH_FEET = 5;
const MELEE_REACH_FEET = 5;
const REACH_PROPERTY_BONUS_FEET = 5;
// Countercharm rerolls a failed save against these conditions.
const CHARM_FRIGHTEN_CONDITIONS: ReadonlyArray<string> = ['charmed', 'frightened'];
// Countercharm's 30 ft range (consumer-managed per the planner; used here only
// to refine the affordance when positions are known).
const COUNTERCHARM_RANGE_FEET = 30;
// Deflect Attacks only reduces physical attack damage.
type DeflectablePhysical = 'bludgeoning' | 'piercing' | 'slashing';
const DEFLECTABLE_TYPES: ReadonlyArray<string> = ['bludgeoning', 'piercing', 'slashing'];

const REASON_REACTION_USED = 'reaction-used';

// ── Public types ────────────────────────────────────────────────────
/** What just happened that a reaction responds to. */
export type ReactionTriggerKind = 'attack-roll' | 'damage' | 'spell-cast' | 'leaves-reach' | 'condition-applied';

export interface ReactionOption {
  /** Stable id (matches the produced intent's reaction). */
  readonly id: string;
  readonly label: string;
  /** The trigger this reaction responds to. */
  readonly trigger: ReactionTriggerKind;
  readonly enabled: boolean;
  /**
   * Machine-readable reason when `enabled` is false: a blocking-condition id
   * ('incapacitated', 'stunned', …) or 'reaction-used'.
   */
  readonly reason?: string;
}

/** The typed reaction intents `reactionsForTrigger` produces. */
export type ReactionIntent =
  | ShieldIntent
  | CuttingWordsIntent
  | UncannyDodgeIntent
  | CounterspellIntent
  | ProtectionIntent
  | StonesEnduranceIntent
  | OpportunityAttackIntent
  | DeflectAttacksIntent
  | CountercharmIntent;

/**
 * A reaction correlated to a trigger event — its params pre-filled and ready
 * to commit. Dispatch by `intent.type` to the matching typed planner.
 */
export interface CorrelatedReaction {
  readonly id: string;
  readonly label: string;
  readonly intent: ReactionIntent;
}

// ── Registry ────────────────────────────────────────────────────────
interface ReactionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly trigger: ReactionTriggerKind;
  /**
   * Does this character have the reaction? Usually class / level / species /
   * prepared (character alone), but a few read more — Stone's Endurance needs
   * the resolved Giant Ancestry (state), Protection the effect stack
   * (content) — so `state` + `content` are passed; most ignore them.
   */
  readonly owns: (character: Character, state: CampaignState, content: ResolvedContent) => boolean;
  /**
   * Build the ready-to-commit intent from the trigger event, or undefined if
   * this reaction doesn't apply to this specific trigger (wrong target, the
   * decision predicate says no, no slot, out of reach, …). The trigger event's
   * concrete type matches TRIGGER_EVENT_TYPE[trigger].
   */
  readonly correlate: (
    reactorId: string,
    triggerEvent: Event,
    reactor: Character,
    state: CampaignState,
    content: ResolvedContent,
    encounterId: string,
    // Recent events for cross-event correlation (Deflect Attacks needs the
    // triggering AttackRolled; Countercharm the preceding failed SaveRolled).
    // Empty unless the consumer supplies it — those reactions then don't correlate.
    recentEvents: ReadonlyArray<Event>,
  ) => ReactionIntent | undefined;
}

const TRIGGER_EVENT_TYPE: Record<ReactionTriggerKind, Event['type']> = {
  'attack-roll': 'AttackRolled',
  damage: 'DamageApplied',
  'spell-cast': 'SpellCastDeclared',
  'leaves-reach': 'CombatantMoved',
  'condition-applied': 'ConditionApplied',
};

const damageTotal = (e: DamageAppliedEvent): number =>
  e.components.reduce((sum, c) => sum + c.amount, 0);

const hasCounterspellSlot = (character: Character, content: ResolvedContent): boolean =>
  (computeAvailableSpellSlots(character, content.classes).standardByLevel[COUNTERSPELL_SLOT_LEVEL - 1] ?? 0) >= 1;

const arcaneClassId = (character: Character): string | undefined =>
  character.classes.find((c) => ARCANE_CLASS_IDS.includes(c.classId))?.classId;

// Slice 821: a monster reaction spell granted as an "N/Day" pool with budget
// remaining — the Mage/Archmage "Protective Magic" (Counterspell/Shield).
// Players cast Shield/Counterspell from prepared spells + slots, so this is
// gated on `statblockId` (a monster) to skip the effect-stack build for the
// common player path; the cast meters via the pool (slice 819's `useFreeCast`).
const grantedReactionAvailable = (
  character: Character,
  state: CampaignState,
  content: ResolvedContent,
  spellId: string,
): boolean =>
  character.statblockId !== undefined &&
  perDayFreeCastAvailable(state, content, character.id, spellId);

// Protection: a shield-bearer with the Fighting Style (the gates planProtection
// enforces). buildEffectStack is only reached for shield-bearers (cheap guard).
const hasProtectionStyle = (character: Character, state: CampaignState, content: ResolvedContent): boolean =>
  character.equipped.shield !== undefined
  && buildEffectStack({
    character,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  }).hasProtectionFightingStyle();

const combatantPosition = (state: CampaignState, encounterId: string, combatantId: string) =>
  state.encounters[encounterId]?.combatants.find((c) => c.combatantId === combatantId)?.position;

// The reactor's main-hand melee weapon (the one an Opportunity Attack would
// use) + its reach in feet, or undefined if it isn't wielding a melee weapon.
const meleeWeapon = (
  character: Character,
  state: CampaignState,
  content: ResolvedContent,
): { readonly instanceId: string; readonly reachFeet: number } | undefined => {
  const instanceId = character.equipped.mainHand;
  if (instanceId === undefined) return undefined;
  const instance = state.itemInstances[instanceId];
  const def = instance !== undefined ? content.items.get(instance.definitionId) : undefined;
  if (def?.itemKind !== 'weapon' || def.attackKind === 'ranged') return undefined;
  const reachFeet = def.properties.includes('reach') ? MELEE_REACH_FEET + REACH_PROPERTY_BONUS_FEET : MELEE_REACH_FEET;
  return { instanceId, reachFeet };
};

const isActiveCombatant = (state: CampaignState, encounterId: string, combatantId: string): boolean => {
  const enc = state.encounters[encounterId];
  return enc?.combatants[enc.activeIndex]?.combatantId === combatantId;
};

// The deflectable physical damage type with the most damage in the components,
// or undefined if none is physical (Deflect Attacks only reduces B/P/S attack
// damage). Mirrors scripts/reactions/reaction-policy.ts.
const dominantPhysicalType = (
  components: DamageAppliedEvent['components'],
): DeflectablePhysical | undefined => {
  let best: { readonly type: DeflectablePhysical; readonly amount: number } | undefined;
  for (const c of components) {
    if (!DEFLECTABLE_TYPES.includes(c.type)) continue;
    if (best === undefined || c.amount > best.amount) best = { type: c.type as DeflectablePhysical, amount: c.amount };
  }
  return best?.type;
};

// The id of the most recent AttackRolled targeting `targetId` in `recentEvents`
// (the attack that caused the damage). Undefined if none — Deflect can't fire.
const mostRecentAttackOn = (recentEvents: ReadonlyArray<Event>, targetId: string): string | undefined => {
  for (let i = recentEvents.length - 1; i >= 0; i -= 1) {
    const e = recentEvents[i]!;
    if (e.type === 'AttackRolled' && (e as AttackRolledEvent).targetId === targetId) return e.id;
  }
  return undefined;
};

// The most recent FAILED SaveRolled for `targetId` in `recentEvents` — supplies
// the DC / ability / bonus the Countercharm reroll needs (SaveRolled doesn't
// record which condition it gated). Mirrors the slice-752 policy's lookback.
const precedingFailedSave = (recentEvents: ReadonlyArray<Event>, targetId: string): SaveRolledEvent | undefined => {
  for (let i = recentEvents.length - 1; i >= 0; i -= 1) {
    const e = recentEvents[i]!;
    if (e.type === 'SaveRolled' && (e as SaveRolledEvent).targetId === targetId && (e as SaveRolledEvent).success === false) {
      return e as SaveRolledEvent;
    }
  }
  return undefined;
};

const REGISTRY: ReadonlyArray<ReactionDescriptor> = [
  {
    id: 'shield',
    label: 'Shield',
    trigger: 'attack-roll',
    // Player: Shield prepared. Monster: a granted Protective Magic pool with
    // budget (slice 821).
    owns: (c, state, content) =>
      c.preparedSpells.includes(SHIELD_SPELL_ID) ||
      grantedReactionAvailable(c, state, content, SHIELD_SPELL_ID),
    correlate: (reactorId, event, reactor, state, content) => {
      const e = event as AttackRolledEvent;
      if (e.targetId !== reactorId || e.hit !== true) return undefined;
      const freeCast = grantedReactionAvailable(reactor, state, content, SHIELD_SPELL_ID);
      if (reactor.preparedSpells.includes(SHIELD_SPELL_ID)) {
        // Player path: class + prepared + the +5 would flip the hit.
        if (!shouldShield(reactor, e.total, e.targetAC)) return undefined;
      } else if (freeCast) {
        // Monster path: only the structural "+5 flips the hit" filter (the
        // pool budget + reaction economy are enforced by planShield).
        if (e.total >= e.targetAC + SHIELD_AC_BONUS) return undefined;
      } else {
        return undefined;
      }
      return {
        type: 'Shield',
        casterId: reactorId,
        triggeringAttackEventId: e.id,
        triggeringAttackTotal: e.total,
        originalAC: e.targetAC,
        slotLevel: SHIELD_SLOT_LEVEL,
        ...(freeCast ? { useFreeCast: true } : {}),
      };
    },
  },
  {
    id: 'cutting-words',
    label: 'Cutting Words',
    trigger: 'attack-roll',
    owns: (c) => c.classes.some((cl) => cl.classId === 'bard'),
    correlate: (reactorId, event, reactor) => {
      const e = event as AttackRolledEvent;
      if (!shouldCuttingWords(reactor, e.total, e.targetAC)) return undefined;
      return { type: 'CuttingWords', bardId: reactorId, originalRollTotal: e.total, threshold: e.targetAC };
    },
  },
  {
    id: 'uncanny-dodge',
    label: 'Uncanny Dodge',
    trigger: 'damage',
    owns: hasUncannyDodge,
    correlate: (reactorId, event, reactor) => {
      const e = event as DamageAppliedEvent;
      if (e.targetId !== reactorId || !hasUncannyDodge(reactor)) return undefined;
      return { type: 'UncannyDodge', characterId: reactorId, triggeringDamageEventId: e.id, damageAmount: damageTotal(e) };
    },
  },
  {
    id: 'counterspell',
    label: 'Counterspell',
    trigger: 'spell-cast',
    // Player: Counterspell prepared. Monster: a granted Protective Magic pool
    // with budget (slice 821).
    owns: (c, state, content) =>
      c.preparedSpells.includes(COUNTERSPELL_SPELL_ID) ||
      grantedReactionAvailable(c, state, content, COUNTERSPELL_SPELL_ID),
    correlate: (reactorId, event, reactor, state, content) => {
      const e = event as SpellCastDeclaredEvent;
      if (e.characterId === reactorId) return undefined; // don't counter your own cast
      if (e.slotLevel < 1) return undefined; // leveled spells only (a cantrip isn't worth it)
      const base = {
        type: 'Counterspell' as const,
        counterCasterId: reactorId,
        targetCasterId: e.characterId,
        originalSpellEventId: e.id,
        spellId: e.spellId,
        slotLevelToConsume: COUNTERSPELL_SLOT_LEVEL,
        // 0 so Counterspell does NOT re-emit the countered spell's level (the
        // slot is consumed via slotLevelToConsume) — see reactive-spells.ts.
        originalSpellLevel: 0,
      };
      if (reactor.preparedSpells.includes(COUNTERSPELL_SPELL_ID)) {
        // Player path: arcane class (for the save DC) + a 3rd-level slot.
        if (!shouldCounterspell(reactor, e.slotLevel)) return undefined;
        if (!hasCounterspellSlot(reactor, content)) return undefined;
        const castingClassId = arcaneClassId(reactor);
        if (castingClassId === undefined) return undefined;
        return { ...base, castingClassId };
      }
      // Monster path: a granted pool with budget; the flat statblock save DC
      // comes from the SetSpellcastingProfile (castingClassId '' → profile).
      if (!grantedReactionAvailable(reactor, state, content, COUNTERSPELL_SPELL_ID)) return undefined;
      return { ...base, castingClassId: '', useFreeCast: true };
    },
  },
  {
    id: 'stones-endurance',
    label: "Stone's Endurance",
    trigger: 'damage',
    // Planner-faithful: validateGoliathAncestry requires the RESOLVED Stone's
    // Endurance ancestry (not just species) + the giant-ancestry resource.
    owns: (c, state) => hasStonesEndurance(c) && findGoliathAncestryChoice(c, state) === STONES_ENDURANCE_ANCESTRY,
    correlate: (reactorId, event) => {
      const e = event as DamageAppliedEvent;
      if (e.targetId !== reactorId) return undefined;
      return { type: 'StonesEndurance', goliathId: reactorId, damageAmount: damageTotal(e), triggeringDamageEventId: e.id };
    },
  },
  {
    id: 'protection',
    label: 'Protection',
    trigger: 'attack-roll',
    owns: hasProtectionStyle,
    correlate: (reactorId, event, _reactor, state, _content, encounterId) => {
      const e = event as AttackRolledEvent;
      // Protect an ALLY (not yourself, not your own attack), on a normal
      // single-d20 attack (no advantage/disadvantage stacking) — mirrors the
      // combat-fuzz pre-damage policy.
      if (e.targetId === reactorId || e.attackerId === reactorId) return undefined;
      if (e.used !== 'none' || e.d20.length !== 1) return undefined;
      // Positional: within 5 ft of the attacked ally. Both positions must be
      // known (positionless → adjacency is consumer scope, so don't offer it).
      const selfPos = combatantPosition(state, encounterId, reactorId);
      const targetPos = combatantPosition(state, encounterId, e.targetId);
      if (selfPos === undefined || targetPos === undefined) return undefined;
      if (chebyshevDistance(selfPos, targetPos) > PROTECTION_REACH_FEET) return undefined;
      return { type: 'Protection', protectorId: reactorId, attackerId: e.attackerId, triggeringAttackEventId: e.id };
    },
  },
  {
    id: 'opportunity-attack',
    label: 'Opportunity Attack',
    trigger: 'leaves-reach',
    owns: (c, state, content) => meleeWeapon(c, state, content) !== undefined,
    correlate: (reactorId, event, reactor, state, content, encounterId) => {
      const e = event as CombatantMovedEvent;
      if (e.combatantId === reactorId) return undefined; // not your own move
      // planOpportunityAttack rejects an active-turn reactor (you take OAs on
      // others' turns). The planner does NOT range-check (it uses resolveAttack
      // directly), so an attack on a creature that has left reach is accepted.
      if (isActiveCombatant(state, encounterId, reactorId)) return undefined;
      const weapon = meleeWeapon(reactor, state, content);
      if (weapon === undefined) return undefined;
      const reactorPos = combatantPosition(state, encounterId, reactorId);
      if (reactorPos === undefined || e.fromPosition === undefined) return undefined;
      // Left reach: within reach before the move, beyond it after.
      const wasInReach = chebyshevDistance(reactorPos, e.fromPosition) <= weapon.reachFeet;
      const nowInReach = chebyshevDistance(reactorPos, e.toPosition) <= weapon.reachFeet;
      if (!wasInReach || nowInReach) return undefined;
      return { type: 'OpportunityAttack', reactorId, targetId: e.combatantId, weaponInstanceId: weapon.instanceId };
    },
  },
  {
    id: 'deflect-attacks',
    label: 'Deflect Attacks',
    trigger: 'damage',
    owns: hasDeflectAttacks,
    // Cross-event: the DamageApplied carries no link to its attack, so scan
    // recentEvents for the triggering AttackRolled. Only physical attack damage
    // is deflectable.
    correlate: (reactorId, event, _reactor, _state, _content, _encounterId, recentEvents) => {
      const e = event as DamageAppliedEvent;
      if (e.targetId !== reactorId) return undefined;
      const damageType = dominantPhysicalType(e.components);
      if (damageType === undefined) return undefined;
      const triggeringAttackEventId = mostRecentAttackOn(recentEvents, reactorId);
      if (triggeringAttackEventId === undefined) return undefined; // needs recentEvents
      return { type: 'DeflectAttacks', monkId: reactorId, triggeringAttackEventId, incomingDamage: damageTotal(e), damageType };
    },
  },
  {
    id: 'countercharm',
    label: 'Countercharm',
    trigger: 'condition-applied',
    owns: hasCountercharm,
    // Cross-event: triggers on the Charmed/Frightened ConditionApplied (the
    // SaveRolled doesn't say which condition it gated), then scans recentEvents
    // for the preceding failed save to fill the reroll's DC / ability / bonus.
    // On a successful reroll the consumer removes the just-applied condition
    // (the slice-752 pattern). 30 ft range is consumer-managed; refined here
    // when positions are known.
    correlate: (reactorId, event, _reactor, state, _content, encounterId, recentEvents) => {
      const e = event as ConditionAppliedEvent;
      if (!CHARM_FRIGHTEN_CONDITIONS.includes(e.conditionId)) return undefined;
      const save = precedingFailedSave(recentEvents, e.targetId);
      if (save === undefined) return undefined;
      const reactorPos = combatantPosition(state, encounterId, reactorId);
      const targetPos = combatantPosition(state, encounterId, e.targetId);
      if (reactorPos !== undefined && targetPos !== undefined && chebyshevDistance(reactorPos, targetPos) > COUNTERCHARM_RANGE_FEET) {
        return undefined;
      }
      return { type: 'Countercharm', bardId: reactorId, targetId: e.targetId, ability: save.ability, dc: save.dc, saveBonus: save.bonus };
    },
  },
];

// A reaction needs the reactor's reaction for the round, and the reactor not
// to be Incapacitated/etc. Returns the blocking-condition id, 'reaction-used',
// or undefined (can react).
const reactionBlockedReason = (
  state: CampaignState,
  encounterId: string,
  combatantId: string,
  character: Character,
): string | undefined => {
  const blocker = findActorBlockingCondition(character);
  if (blocker !== undefined) return blocker;
  const cb = state.encounters[encounterId]?.combatants.find((c) => c.combatantId === combatantId);
  if (cb !== undefined && cb.turnUsage.reactionUsedThisRound) return REASON_REACTION_USED;
  return undefined;
};

// ── availableReactions (enumeration) ────────────────────────────────
export const availableReactions = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  combatantId: string,
): ReadonlyArray<ReactionOption> => {
  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === combatantId);
  const character = state.characters[combatantId];
  if (encounter === undefined || self === undefined || character === undefined) return [];

  const reason = reactionBlockedReason(state, encounterId, combatantId, character);
  const out: ReactionOption[] = [];
  for (const d of REGISTRY) {
    if (!d.owns(character, state, content)) continue;
    out.push({
      id: d.id,
      label: d.label,
      trigger: d.trigger,
      enabled: reason === undefined,
      ...(reason !== undefined ? { reason } : {}),
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
};

// ── reactionsForTrigger (correlation) ───────────────────────────────
export const reactionsForTrigger = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
  reactorId: string,
  triggerEvent: Event,
  // Recent committed events (the consumer's log slice) for cross-event
  // correlation. Deflect Attacks needs the triggering AttackRolled and
  // Countercharm the preceding failed SaveRolled; without it those two don't
  // correlate (every other reaction reads only the trigger event).
  recentEvents: ReadonlyArray<Event> = [],
): ReadonlyArray<CorrelatedReaction> => {
  const encounter = state.encounters[encounterId];
  const self = encounter?.combatants.find((c) => c.combatantId === reactorId);
  const character = state.characters[reactorId];
  if (encounter === undefined || self === undefined || character === undefined) return [];
  // No reaction available (spent, or Incapacitated/etc.) → nothing applies.
  if (reactionBlockedReason(state, encounterId, reactorId, character) !== undefined) return [];

  const out: CorrelatedReaction[] = [];
  for (const d of REGISTRY) {
    if (TRIGGER_EVENT_TYPE[d.trigger] !== triggerEvent.type) continue;
    if (!d.owns(character, state, content)) continue;
    const intent = d.correlate(reactorId, triggerEvent, character, state, content, encounterId, recentEvents);
    if (intent !== undefined) out.push({ id: d.id, label: d.label, intent });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
};
