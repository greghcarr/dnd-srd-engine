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
  type MoveDestination,
  type ActionEconomyView,
  type AvailableAction,
  type AffordanceActionId,
  type TargetCandidate,
  type CastableSpell,
} from './affordances.js';
