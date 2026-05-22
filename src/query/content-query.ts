// Slice 411: content query/browse surface, the first piece of the
// consumer-facing read layer.
//
// The engine is built to MUTATE state (plan -> commit events). A
// D&D-Beyond-style app is mostly READS: "show me all 3rd-level
// evocation spells a wizard can prepare," "list CR 1-5 undead," "browse
// uncommon magic items." Those browsers have no surface today; this
// module adds them as pure, deterministic filters over `ResolvedContent`.
//
// Per-category functions (not one polymorphic query) because each
// category filters on different fields and returns a precisely-typed
// result, mirroring DDB's separate spell / monster / item browsers.
// Results are returned in a stable display order so a consumer can
// render them directly without re-sorting.
import type { ResolvedContent } from '../content/pack.js';
import type { Spell } from '../schemas/content/spell.js';
import type { MonsterStatblock } from '../schemas/content/monster.js';
import type { ItemDefinition, MagicRarity } from '../schemas/content/item.js';
import type { SpellSchool, CreatureType, Size } from '../schemas/primitives.js';

/** Case-insensitive name substring match; an absent term matches everything. */
const nameMatches = (name: string, search: string | undefined): boolean =>
  search === undefined || name.toLowerCase().includes(search.toLowerCase());

const compareByName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name);

const withinRange = (value: number, min: number | undefined, max: number | undefined): boolean =>
  (min === undefined || value >= min) && (max === undefined || value <= max);

/** Rarity lives only on some `itemKind` variants; absent elsewhere. */
const itemRarity = (item: ItemDefinition): MagicRarity | undefined =>
  'rarity' in item ? item.rarity : undefined;

export interface SpellFilter {
  /** Exact spell level (0 = cantrip). Takes precedence over the range bounds. */
  readonly level?: number;
  readonly levelMin?: number;
  readonly levelMax?: number;
  readonly school?: SpellSchool;
  /** Lowercase class id (e.g. 'wizard'); matches if the spell lists that class. */
  readonly class?: string;
  readonly concentration?: boolean;
  readonly ritual?: boolean;
  /** Case-insensitive name substring. */
  readonly search?: string;
}

/** Spells matching every supplied criterion, ordered by level then name. */
export const querySpells = (
  content: ResolvedContent,
  filter: SpellFilter = {},
): readonly Spell[] => {
  const klass = filter.class?.toLowerCase();
  return [...content.spells.values()]
    .filter(
      (spell) =>
        (filter.level === undefined || spell.level === filter.level) &&
        (filter.level !== undefined || withinRange(spell.level, filter.levelMin, filter.levelMax)) &&
        (filter.school === undefined || spell.school === filter.school) &&
        (klass === undefined || spell.classes.some((c) => c.toLowerCase() === klass)) &&
        (filter.concentration === undefined || spell.concentration === filter.concentration) &&
        (filter.ritual === undefined || spell.ritual === filter.ritual) &&
        nameMatches(spell.name, filter.search),
    )
    .sort((a, b) => a.level - b.level || compareByName(a, b));
};

export interface MonsterFilter {
  readonly type?: CreatureType;
  readonly size?: Size;
  /** Exact challenge rating (fractional CRs are decimals: 1/4 = 0.25). */
  readonly cr?: number;
  readonly crMin?: number;
  readonly crMax?: number;
  readonly search?: string;
}

/** Monsters matching every supplied criterion, ordered by CR then name. */
export const queryMonsters = (
  content: ResolvedContent,
  filter: MonsterFilter = {},
): readonly MonsterStatblock[] =>
  [...content.monsters.values()]
    .filter(
      (monster) =>
        (filter.type === undefined || monster.type === filter.type) &&
        (filter.size === undefined || monster.size === filter.size) &&
        (filter.cr === undefined || monster.cr === filter.cr) &&
        (filter.cr !== undefined || withinRange(monster.cr, filter.crMin, filter.crMax)) &&
        nameMatches(monster.name, filter.search),
    )
    .sort((a, b) => a.cr - b.cr || compareByName(a, b));

export interface ItemFilter {
  readonly itemKind?: ItemDefinition['itemKind'];
  readonly rarity?: MagicRarity;
  readonly search?: string;
}

/** Items matching every supplied criterion, ordered by name. */
export const queryItems = (
  content: ResolvedContent,
  filter: ItemFilter = {},
): readonly ItemDefinition[] =>
  [...content.items.values()]
    .filter(
      (item) =>
        (filter.itemKind === undefined || item.itemKind === filter.itemKind) &&
        (filter.rarity === undefined || itemRarity(item) === filter.rarity) &&
        nameMatches(item.name, filter.search),
    )
    .sort(compareByName);
