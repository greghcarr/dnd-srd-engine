import { z } from 'zod';
import {
  BackgroundSchema,
  ClassSchema,
  ConditionSchema,
  FeatSchema,
  ItemDefinitionSchema,
  MonsterStatblockSchema,
  SpeciesSchema,
  SpellSchema,
  SubclassSchema,
  type Background,
  type Class,
  type Condition,
  type Feat,
  type ItemDefinition,
  type MonsterStatblock,
  type Species,
  type Spell,
  type Subclass,
} from '../schemas/content/index.js';

export const ContentPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  license: z.string().optional(),
  attribution: z.string().optional(),
  derivedFrom: z.string().optional(),
  // Entity ids this pack intentionally replaces from an earlier-loaded
  // pack. The id namespace is global per category and packs merge in
  // array order, so without this an id reused across packs would
  // silently clobber the earlier entry. `resolveContent` errors on any
  // cross-pack id collision UNLESS the later pack declares the id here
  // (a deliberate houserule override, e.g. a homebrew pack replacing the
  // SRD `fireball`). Within-pack duplicates are always an error.
  overrides: z.array(z.string()).default([]),
  species: z.array(SpeciesSchema).default([]),
  backgrounds: z.array(BackgroundSchema).default([]),
  classes: z.array(ClassSchema).default([]),
  subclasses: z.array(SubclassSchema).default([]),
  feats: z.array(FeatSchema).default([]),
  spells: z.array(SpellSchema).default([]),
  items: z.array(ItemDefinitionSchema).default([]),
  monsters: z.array(MonsterStatblockSchema).default([]),
  conditions: z.array(ConditionSchema).default([]),
});
export type ContentPack = z.infer<typeof ContentPackSchema>;

export interface ResolvedContent {
  species: ReadonlyMap<string, Species>;
  backgrounds: ReadonlyMap<string, Background>;
  classes: ReadonlyMap<string, Class>;
  subclasses: ReadonlyMap<string, Subclass>;
  feats: ReadonlyMap<string, Feat>;
  spells: ReadonlyMap<string, Spell>;
  items: ReadonlyMap<string, ItemDefinition>;
  monsters: ReadonlyMap<string, MonsterStatblock>;
  conditions: ReadonlyMap<string, Condition>;
}

export interface ContentPackIssue {
  readonly path: string;
  readonly message: string;
}

// Per-category id-collision scan. The id namespace is global within a
// category and packs merge in array order, so a reused id would
// otherwise silently clobber the earlier entry. Every within-pack
// duplicate is reported (always a bug); every cross-pack collision is
// reported unless the later pack declares the id in its `overrides`
// (a deliberate replacement). `resolveContent` throws on any issue;
// `validatePacks` collects them for an author-time report.
const CATEGORY_IDS: ReadonlyArray<{
  readonly name: string;
  readonly list: (pack: ContentPack) => ReadonlyArray<{ readonly id: string }>;
}> = [
  { name: 'species', list: (p) => p.species },
  { name: 'backgrounds', list: (p) => p.backgrounds },
  { name: 'classes', list: (p) => p.classes },
  { name: 'subclasses', list: (p) => p.subclasses },
  { name: 'feats', list: (p) => p.feats },
  { name: 'spells', list: (p) => p.spells },
  { name: 'items', list: (p) => p.items },
  { name: 'monsters', list: (p) => p.monsters },
  { name: 'conditions', list: (p) => p.conditions },
];

export const detectIdCollisions = (
  packs: ReadonlyArray<ContentPack>,
): ReadonlyArray<ContentPackIssue> => {
  const issues: ContentPackIssue[] = [];
  for (const { name, list } of CATEGORY_IDS) {
    const definedIn = new Map<string, string>(); // id -> first pack that defined it
    for (const pack of packs) {
      const seenInPack = new Set<string>();
      for (const entry of list(pack)) {
        if (seenInPack.has(entry.id)) {
          issues.push({
            path: `${pack.id}.${name}`,
            message: `duplicate id "${entry.id}" appears more than once in pack "${pack.id}" (category ${name})`,
          });
          continue;
        }
        seenInPack.add(entry.id);
        const priorPackId = definedIn.get(entry.id);
        if (priorPackId !== undefined && !pack.overrides.includes(entry.id)) {
          issues.push({
            path: `${pack.id}.${name}`,
            message: `id "${entry.id}" (${name}) collides with pack "${priorPackId}"; declare it in "${pack.id}".overrides to intentionally replace it`,
          });
        }
        definedIn.set(entry.id, pack.id);
      }
    }
  }
  return issues;
};

// Pure last-wins merge into per-category maps. Callers that care about
// collisions (`resolveContent`) run `detectIdCollisions` first; the only
// duplicates that reach here are declared overrides, where later-wins is
// the intended behavior.
const mergeIntoMaps = (packs: ReadonlyArray<ContentPack>): ResolvedContent => {
  const species = new Map<string, Species>();
  const backgrounds = new Map<string, Background>();
  const classes = new Map<string, Class>();
  const subclasses = new Map<string, Subclass>();
  const feats = new Map<string, Feat>();
  const spells = new Map<string, Spell>();
  const items = new Map<string, ItemDefinition>();
  const monsters = new Map<string, MonsterStatblock>();
  const conditions = new Map<string, Condition>();

  for (const pack of packs) {
    for (const e of pack.species) species.set(e.id, e);
    for (const e of pack.backgrounds) backgrounds.set(e.id, e);
    for (const e of pack.classes) classes.set(e.id, e);
    for (const e of pack.subclasses) subclasses.set(e.id, e);
    for (const e of pack.feats) feats.set(e.id, e);
    for (const e of pack.spells) spells.set(e.id, e);
    for (const e of pack.items) items.set(e.id, e);
    for (const e of pack.monsters) monsters.set(e.id, e);
    for (const e of pack.conditions) conditions.set(e.id, e);
  }

  return { species, backgrounds, classes, subclasses, feats, spells, items, monsters, conditions };
};

export const resolveContent = (packs: ReadonlyArray<ContentPack>): ResolvedContent => {
  const collisions = detectIdCollisions(packs);
  if (collisions.length > 0) throw new ContentPackLoadError(collisions);
  return mergeIntoMaps(packs);
};

// The pure merge, exposed for author-time validation (`validatePacks`),
// which reports collisions rather than throwing and still needs a merged
// view to resolve cross-references against.
export const mergeContent = (packs: ReadonlyArray<ContentPack>): ResolvedContent =>
  mergeIntoMaps(packs);

const formatZodPath = (path: ReadonlyArray<PropertyKey>): string =>
  path.length === 0 ? '<root>' : path.map((p) => String(p)).join('.');

export class ContentPackLoadError extends Error {
  public readonly issues: ReadonlyArray<{ path: string; message: string }>;
  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    const summary = issues.length === 1 ? '1 issue' : `${issues.length} issues`;
    const body = issues.map((i) => `  ${i.path}: ${i.message}`).join('\n');
    super(`Content pack failed validation (${summary}):\n${body}`);
    this.name = 'ContentPackLoadError';
    this.issues = issues;
  }
}

export const loadContentPack = (input: unknown): ContentPack => {
  const result = ContentPackSchema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => ({
    path: formatZodPath(i.path),
    message: i.message,
  }));
  throw new ContentPackLoadError(issues);
};
