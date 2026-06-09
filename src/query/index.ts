// The consumer-facing read layer: pure, deterministic queries and view
// models over content + state, for building a character sheet, content
// browser, or combat tracker without reaching into raw state maps.
//
// Slice 411 seeds it with content browse (querySpells / queryMonsters /
// queryItems). Sheet and encounter view models follow.
export {
  querySpells,
  queryMonsters,
  queryItems,
  type SpellFilter,
  type MonsterFilter,
  type ItemFilter,
} from './content-query.js';
export {
  buildCharacterSheet,
  type CharacterSheet,
  type SkillView,
  type PassiveScores,
  type InitiativeView,
  type AttackView,
  type SpellcastingView,
  type SpellcastingClassView,
  type SpellListEntry,
  type SpellLevelGroup,
  type InventoryView,
  type InventoryEntry,
  type EquipSlot,
} from './character-sheet.js';
export {
  buildEncounterView,
  type EncounterView,
  type CombatantView,
  type CombatantConditionView,
  type CombatantTurnView,
} from './encounter-view.js';
// Slice 705 (A1): intent-shaped affordance queries ("what can this
// combatant legally do right now?"), surfaced on the engine as
// engine.query.*.
export {
  legalMoveDestinations,
  actionEconomy,
  availableActions,
  legalTargets,
  castableSpells,
  legalSpellTargets,
  type MoveDestination,
  type ActionEconomyView,
  type AvailableAction,
  type AffordanceActionId,
  type TargetCandidate,
  type CastableSpell,
  type SpellCastingTime,
  type SpellRangeFeet,
  type SpellResolves,
  type SpellTargetAllow,
  type SpellTargetDescriptor,
  type LegalSpellTargets,
} from './affordances.js';
// Slice 714: bonus-action affordances ("what bonus action can this
// combatant use right now?") + the option-id → intent dispatch builder.
export {
  bonusActions,
  bonusActionTargets,
  bonusActionIntent,
  type BonusActionOption,
  type BonusActionTarget,
  type BonusActionTargetKind,
  type BonusActionIntent,
  type BonusActionParams,
} from './bonus-actions.js';
// Slice 763: reaction affordances — discovery + trigger correlation.
export {
  availableReactions,
  reactionsForTrigger,
  type ReactionOption,
  type ReactionTriggerKind,
  type ReactionIntent,
  type CorrelatedReaction,
} from './reactions.js';
// Slice 764/771: general 2024 action affordances (registry-driven discovery
// + target enumeration).
export {
  actionOptions,
  actionTargets,
  actionIntent,
  type ActionOption,
  type ActionTarget,
  type ActionOptionTargetKind,
  type ActionIntent,
  type ActionParams,
} from './action-options.js';
// Slice 774: post-hit affordances — options contextual on a just-landed attack
// (Paladin's Smite). Discovery + slot-picker + intent builder.
export {
  postHitOptions,
  postHitIntent,
  type PostHitOption,
  type PostHitIntent,
  type PostHitParams,
} from './post-hit.js';
