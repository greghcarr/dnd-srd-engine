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
// Coverage: Shield, Cutting Words, Uncanny Dodge, Counterspell (slice 763),
// plus Stone's Endurance + Protection (slice 765) — across the attack-roll /
// damage / spell-cast triggers — each planner-faithful (its owns/correlate
// matches what the planner accepts). Stone's Endurance gates on the RESOLVED
// Giant Ancestry choice; Protection on the shield + Fighting Style + a
// positional adjacency check (5 ft of the attacked ally; positionless → not
// offered). Deliberately NOT yet wired — each needs cross-event context a
// single trigger event can't carry: Deflect Attacks (the attack event linked
// from the damage), Countercharm (the Charmed/Frightened context the
// SaveRolled lacks); and Opportunity Attack (a positional move trigger).

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
import { findActorBlockingCondition } from '../engine/plan/_actor-state.js';
import { findGoliathAncestryChoice } from '../engine/plan/_giant-ancestry.js';
import { chebyshevDistance } from '../engine/plan/movement.js';
import { buildEffectStack } from '../derive/effect-stack.js';
import {
  shouldShield,
  shouldCuttingWords,
  shouldCounterspell,
  hasUncannyDodge,
  hasStonesEndurance,
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

const REASON_REACTION_USED = 'reaction-used';

// ── Public types ────────────────────────────────────────────────────
/** What just happened that a reaction responds to. */
export type ReactionTriggerKind = 'attack-roll' | 'damage' | 'spell-cast';

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
  | StonesEnduranceIntent;

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
  ) => ReactionIntent | undefined;
}

const TRIGGER_EVENT_TYPE: Record<ReactionTriggerKind, Event['type']> = {
  'attack-roll': 'AttackRolled',
  damage: 'DamageApplied',
  'spell-cast': 'SpellCastDeclared',
};

const damageTotal = (e: DamageAppliedEvent): number =>
  e.components.reduce((sum, c) => sum + c.amount, 0);

const hasCounterspellSlot = (character: Character, content: ResolvedContent): boolean =>
  (computeAvailableSpellSlots(character, content.classes).standardByLevel[COUNTERSPELL_SLOT_LEVEL - 1] ?? 0) >= 1;

const arcaneClassId = (character: Character): string | undefined =>
  character.classes.find((c) => ARCANE_CLASS_IDS.includes(c.classId))?.classId;

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

const REGISTRY: ReadonlyArray<ReactionDescriptor> = [
  {
    id: 'shield',
    label: 'Shield',
    trigger: 'attack-roll',
    owns: (c) => c.preparedSpells.includes(SHIELD_SPELL_ID),
    correlate: (reactorId, event, reactor) => {
      const e = event as AttackRolledEvent;
      if (e.targetId !== reactorId || e.hit !== true) return undefined;
      if (!shouldShield(reactor, e.total, e.targetAC)) return undefined;
      return {
        type: 'Shield',
        casterId: reactorId,
        triggeringAttackEventId: e.id,
        triggeringAttackTotal: e.total,
        originalAC: e.targetAC,
        slotLevel: SHIELD_SLOT_LEVEL,
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
    owns: (c) => c.preparedSpells.includes(COUNTERSPELL_SPELL_ID),
    correlate: (reactorId, event, reactor, _state, content) => {
      const e = event as SpellCastDeclaredEvent;
      if (e.characterId === reactorId) return undefined; // don't counter your own cast
      if (!shouldCounterspell(reactor, e.slotLevel)) return undefined;
      if (!hasCounterspellSlot(reactor, content)) return undefined;
      const castingClassId = arcaneClassId(reactor);
      if (castingClassId === undefined) return undefined;
      return {
        type: 'Counterspell',
        counterCasterId: reactorId,
        targetCasterId: e.characterId,
        originalSpellEventId: e.id,
        spellId: e.spellId,
        castingClassId,
        slotLevelToConsume: COUNTERSPELL_SLOT_LEVEL,
        // 0 so Counterspell does NOT re-emit the countered spell's level (the
        // slot is consumed via slotLevelToConsume) — see reactive-spells.ts.
        originalSpellLevel: 0,
      };
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
    const intent = d.correlate(reactorId, triggerEvent, character, state, content, encounterId);
    if (intent !== undefined) out.push({ id: d.id, label: d.label, intent });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
};
