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
} from './character-sheet.js';
