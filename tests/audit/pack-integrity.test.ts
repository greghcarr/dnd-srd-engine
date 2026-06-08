// Pack-integrity audits (slice 303).
//
// Two repeatable checks promoted from ad-hoc pattern-check sweeps that
// surfaced real bugs in slices 298 + 301. The promotion path mirrors
// srd-drift (slice 195, from the slices 177-194 ad-hoc fixes) and
// doc-size (slice 285, from the slices 270/277 recurring archives):
// when a sweep is something a script can check repeatably, it belongs
// in tests/audit/ so CI catches regressions at commit time instead of
// relying on an agent remembering to sweep.
//
// 1. Duplicate pack entries (slice 298 found Stone of Good Luck shipped
//    twice — one wired, one empty stub — invisible to the SRD-drift
//    audit because the wired entry's name mismatched SRD canonical).
// 2. Orphan conditions (slice 301 found 6 dead 2014-era conditions with
//    effects but no spell / item / feature / planner applying them).
//
// Lesson encoded here (the slice-301 false-positive trap): a reference
// sweep must account for EVERY way a thing can be referenced. The
// slice-301 first pass walked only content-side `conditionId` refs and
// flagged planner-emitted + already-wired conditions as false orphans.
// This audit walks content refs AND the engine source AND explicitly
// allowlists conditions applied via runtime string interpolation
// (which a static substring scan cannot see). Under-walking references
// is the false-positive mirror of the "filter shape determines what a
// sweep can find" false-negative trap (CLAUDE.md, slices 264/268).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, '../../src');
const PACK_PATH = resolve(HERE, '../../src/content/packs/starter-pack.json');

interface Entry {
  readonly id: string;
  readonly name?: string;
  readonly itemKind?: string;
  readonly effects?: ReadonlyArray<unknown>;
  readonly onUse?: ReadonlyArray<unknown>;
  readonly onConsume?: ReadonlyArray<unknown>;
  readonly charges?: unknown;
  readonly mechanicalEffects?: ReadonlyArray<unknown>;
  readonly dedicatedPlanner?: boolean;
}
interface Pack {
  items: Entry[];
  spells: Entry[];
  conditions: Entry[];
  monsters: Entry[];
}

const pack: Pack = JSON.parse(readFileSync(PACK_PATH, 'utf8'));

// Strip parenthetical qualifiers ("(Acid)", "(Luckstone)") so variant
// families and their alternate-name twins land in the same group.
const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const itemIsWired = (e: Entry): boolean =>
  (e.effects?.length ?? 0) > 0 ||
  (e.onUse?.length ?? 0) > 0 ||
  (e.onConsume?.length ?? 0) > 0 ||
  e.charges !== undefined;

const conditionIsWired = (e: Entry): boolean => (e.effects?.length ?? 0) > 0;

// Recursively lists every .ts file under a directory. Shared by the
// guards that scan the engine source for a referenced id.
const collectTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(p));
    else if (entry.name.endsWith('.ts')) out.push(p);
  }
  return out;
};

// Walks any pack subtree and collects, per key of interest, the set of
// string values found under that key. Shared by the cross-reference and
// effect-less-condition guards below.
const collectRefsByKey = (
  root: unknown,
  keys: ReadonlySet<string>,
): Map<string, Set<string>> => {
  const out = new Map<string, Set<string>>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (keys.has(k) && typeof v === 'string') {
          const set = out.get(k) ?? new Set<string>();
          set.add(v);
          out.set(k, set);
        }
        walk(v);
      }
    }
  };
  walk(root);
  return out;
};

describe('pack integrity: spell scrolls are consumable', () => {
  // Slice 310 (pattern-check follow-up to slices 305 / 309). Spell
  // scrolls are consumed on use (RAW item type "Scroll"), so they must
  // ship as `itemKind: 'consumable'` (which carries `onConsume`), never
  // as `itemKind: 'magic'`. The specific `spell-scroll-of-X` entries
  // were already consumable; the ten generic by-level templates
  // (`spell-scroll-cantrip` / `-1st-level` … `-9th-level`) were
  // mislabeled `magic` and reclassified in slice 310. This guard is
  // id-based rather than SRD-name-matched because the generic templates
  // ("Spell Scroll, Nth Level") don't match the SRD "Spell Scroll"
  // header, so the slice-309 srd-drift Potion-type guard can't see them.
  it('every spell-scroll-* item is itemKind consumable', () => {
    const offenders = pack.items
      .filter((e) => /^spell-scroll-/.test(e.id))
      .filter((e) => e.itemKind !== 'consumable')
      .map((e) => `${e.id}: itemKind=${e.itemKind ?? '<unset>'}`);
    expect(offenders).toEqual([]);
  });
});

describe('pack integrity: no duplicate ids within a category', () => {
  // Ids are looked up per category, so a spell `shield` and an armor
  // item `shield` legitimately coexist. The invariant is per-category
  // uniqueness, not global.
  for (const [category, list] of [
    ['items', pack.items],
    ['spells', pack.spells],
    ['conditions', pack.conditions],
    ['monsters', pack.monsters],
  ] as const) {
    it(`${category} have unique ids`, () => {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const e of list) {
        if (seen.has(e.id)) dupes.push(e.id);
        seen.add(e.id);
      }
      expect(dupes).toEqual([]);
    });
  }
});

describe('pack integrity: no wired/empty duplicate within a name group', () => {
  // The Stone of Good Luck signature (slice 298): two entries sharing
  // a normalized name, one wired and one an empty stub. Intentional
  // variant families (Armor/Ring/Potion of Resistance, Greatclub /
  // Ogre Greatclub, absorb-elements-charged-*) are internally
  // consistent: every member is wired, or every member is empty. A
  // wired/empty MIX inside one group is the accidental-duplicate tell.
  const check = (
    list: Entry[],
    wired: (e: Entry) => boolean,
    label: string,
  ): void => {
    it(`${label}: no name group mixes wired and empty entries`, () => {
      const groups = new Map<string, Entry[]>();
      for (const e of list) {
        if (e.name === undefined) continue;
        const key = normalizeName(e.name);
        const bucket = groups.get(key) ?? [];
        bucket.push(e);
        groups.set(key, bucket);
      }
      const offenders: string[] = [];
      for (const [key, entries] of groups) {
        if (entries.length < 2) continue;
        const wiredCount = entries.filter(wired).length;
        if (wiredCount > 0 && wiredCount < entries.length) {
          offenders.push(
            `${key}: ${wiredCount}/${entries.length} wired (${entries.map((e) => e.id).join(', ')})`,
          );
        }
      }
      expect(offenders).toEqual([]);
    });
  };
  check(pack.items, itemIsWired, 'items');
  check(pack.conditions, conditionIsWired, 'conditions');
});

describe('pack integrity: conditions with effects are reachable', () => {
  // A condition that carries effects but is never applied by any
  // spell, item, feature, or planner is dead weight. This audit walks
  // BOTH content refs and the engine source. Two allowlists encode
  // the two legitimate "unreferenced by a static scan" cases.

  // Dead 2014-era conditions: no SRD 5.2.1 spell carrier exists. Slice
  // 304 removed all six (wrathful/thunderous/branding-smite,
  // holy-weapon, invulnerable, earthbound) from the pack, so this list
  // is now empty. If a future slice adds an unwired condition, prefer
  // wiring it; only add to this allowlist with a tracked
  // starter-pack-gaps.md row explaining why it can't be wired yet.
  const KNOWN_DEAD_ORPHANS: ReadonlySet<string> = new Set([]);

  // Applied at runtime via string interpolation, so a static source
  // scan cannot see the literal id. `planAbsorbElements` builds
  // `absorb-elements-charged-${damageType}-active` (reactive-spells.ts).
  // These are correctly wired — the allowlist documents why the scan
  // misses them. This is the slice-301 false-positive lesson made
  // durable: the orphan sweep there wrongly flagged dynamically-applied
  // conditions because it didn't account for interpolated ids.
  const DYNAMICALLY_APPLIED: ReadonlySet<string> = new Set([
    'absorb-elements-charged-acid-active',
    'absorb-elements-charged-cold-active',
    'absorb-elements-charged-fire-active',
    'absorb-elements-charged-lightning-active',
    'absorb-elements-charged-thunder-active',
  ]);

  const collectReferencedIds = (): Set<string> => {
    const referenced = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const v of node) walk(v);
        return;
      }
      if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (
            (k === 'conditionId' ||
              k === 'allyConditionId' ||
              k === 'conditionOnFail' ||
              k === 'conditionOnSuccess' ||
              k === 'applyConditionId' ||
              k === 'bearerConditionId') &&
            typeof v === 'string'
          ) {
            referenced.add(v);
          } else if (k === 'eligibleConditionIds' && Array.isArray(v)) {
            for (const id of v) if (typeof id === 'string') referenced.add(id);
          }
          walk(v);
        }
      }
    };
    walk(pack);
    return referenced;
  };

  it('every condition with effects is applied somewhere (content, planner, or allowlisted)', () => {
    const referenced = collectReferencedIds();
    const sourceBlob = collectTsFiles(SRC_DIR)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    const isReachable = (id: string): boolean =>
      referenced.has(id) ||
      sourceBlob.includes(id) ||
      DYNAMICALLY_APPLIED.has(id) ||
      KNOWN_DEAD_ORPHANS.has(id);

    const unexpectedOrphans = pack.conditions
      .filter(conditionIsWired)
      .map((c) => c.id)
      .filter((id) => !isReachable(id));

    expect(unexpectedOrphans).toEqual([]);
  });

  it('the known-dead-orphans allowlist stays accurate (no entry has become reachable)', () => {
    const referenced = collectReferencedIds();
    const sourceBlob = collectTsFiles(SRC_DIR)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    // If a dead orphan becomes referenced (a future slice wired its
    // spell) or stops existing (a cleanup slice removed it), it should
    // leave this list. Flag stale allowlist entries so the list can't
    // silently rot.
    const conditionIds = new Set(pack.conditions.map((c) => c.id));
    const stale: string[] = [];
    for (const id of KNOWN_DEAD_ORPHANS) {
      const stillExists = conditionIds.has(id);
      const nowReferenced = referenced.has(id) || sourceBlob.includes(id);
      if (!stillExists || nowReferenced) stale.push(id);
    }
    expect(stale).toEqual([]);
  });
});

describe('pack integrity: engine-emitted conditions are defined in the pack', () => {
  // The mirror of the reachability audit above. A planner that emits
  // `ConditionApplied` for a conditionId the pack does NOT define produces
  // a silently-inert condition: the reducer stores the applied marker, but
  // `collectConditionEffects` (effect-stack.ts) finds no definition and
  // applies no effects, and no derivation reads it. Slice 381 found three
  // weapon masteries (Sap / Vex / Slow) broken exactly this way -- the
  // planner emitted `sapped` / `vexed-by` / `slowed-10ft`, none defined,
  // so the masteries did nothing. This guard scans engine source for
  // `conditionId: '<literal>'` emissions and asserts each is a real pack
  // condition (or an allowlisted base/interpolated id).
  const EMITTED_LITERAL = /conditionId:\s*'([a-z0-9-]+)'/g;

  // RAW base conditions the engine emits but the pack does not need to
  // carry as effect-bearing rows (their mechanics live in engine code) --
  // currently none are undefined; every base condition the engine names is
  // in the pack. Interpolated ids (absorb-elements-charged-${type}) never
  // appear as a full literal, so they don't reach this scan.
  const ALLOWED_UNDEFINED: ReadonlySet<string> = new Set<string>([]);

  it('every conditionId emitted as a literal in engine source is a defined pack condition', () => {
    const definedIds = new Set(pack.conditions.map((c) => c.id));
    const emitted = new Set<string>();
    for (const file of collectTsFiles(SRC_DIR)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(EMITTED_LITERAL)) emitted.add(m[1] as string);
    }
    const undefinedEmits = [...emitted]
      .filter((id) => !definedIds.has(id) && !ALLOWED_UNDEFINED.has(id))
      .sort();
    expect(
      undefinedEmits,
      `engine emits ConditionApplied for these conditionIds, but the pack defines no such condition (they apply a silently-inert marker): ${JSON.stringify(undefinedEmits)}. Define the condition with its effects, or add a documented ALLOWED_UNDEFINED entry.`,
    ).toEqual([]);
  });

  it('the ALLOWED_UNDEFINED allowlist stays accurate (no entry is actually defined)', () => {
    const definedIds = new Set(pack.conditions.map((c) => c.id));
    const stale = [...ALLOWED_UNDEFINED].filter((id) => definedIds.has(id)).sort();
    expect(
      stale,
      `ALLOWED_UNDEFINED entries that are now defined in the pack (remove them): ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });
});

describe('pack integrity: content cross-references resolve', () => {
  // Catches a renamed / deleted / mistyped id that a content slice still
  // references (e.g. a `GrantSpell` pointing at a spell id that no longer
  // exists). Such a dangling reference is silent today: the grant just
  // never resolves. This guard fails the build instead.
  const full = pack as unknown as {
    spells: Entry[];
    items: Entry[];
    conditions: Entry[];
    classes?: Entry[];
  };
  const idsOf = (arr?: ReadonlyArray<Entry>): Set<string> =>
    new Set((arr ?? []).map((e) => e.id));
  const spellIds = idsOf(full.spells);
  const itemIds = idsOf(full.items);
  const conditionIds = idsOf(full.conditions);
  const classIds = idsOf(full.classes);

  // Reference key -> the id set it must resolve into.
  const TARGETS: Record<string, Set<string>> = {
    spellId: spellIds,
    enchantmentDefinitionId: itemIds,
    parentClassId: classIds,
    conditionId: conditionIds,
    conditionOnFail: conditionIds,
    conditionOnSuccess: conditionIds,
    allyConditionId: conditionIds,
    applyConditionId: conditionIds,
    bearerConditionId: conditionIds,
  };
  const refs = collectRefsByKey(pack, new Set(Object.keys(TARGETS)));

  for (const key of Object.keys(TARGETS)) {
    it(`${key} references resolve to a defined entity`, () => {
      const target = TARGETS[key]!;
      const dangling = [...(refs.get(key) ?? new Set<string>())]
        .filter((v) => !target.has(v))
        .sort();
      expect(
        dangling,
        `${key}: references to undefined ids ${JSON.stringify(dangling)} (rename/delete left a dangling ref, or the referenced entry was never added)`,
      ).toEqual([]);
    });
  }
});

describe('pack integrity: wired spells do not apply effect-less conditions', () => {
  // A spell that ships mechanicalEffects (i.e. is "wired") but applies a
  // condition whose own `effects: []` is empty does nothing mechanically
  // on a successful application. Slice 361 swept all such cases by hand;
  // this guard makes the sweep permanent so a new instance fails CI.
  // Legitimate empty-effect conditions are allowlisted with their reason.
  const CONDITION_REF_KEYS = new Set([
    'conditionId',
    'conditionOnFail',
    'conditionOnSuccess',
    'applyConditionId',
    'bearerConditionId',
  ]);
  const condById = new Map(pack.conditions.map((c) => [c.id, c] as const));

  // Conditions that legitimately ship `effects: []` even when a wired
  // spell applies them. See docs/starter-pack-gaps.md "Empty-effect
  // condition gaps" (slice 361) for the full rationale.
  const EFFECT_LESS_OK: ReadonlySet<string> = new Set([
    // Engine-hardcoded base RAW conditions (mechanics live in engine code,
    // not in the condition's effects array):
    'charmed',
    'exhaustion',
    'incapacitated',
    // (Slice 580 added a hearing-gated auto-fail to `deafened`, so it's
    // no longer effect-less. Removed from this allowlist.)
    // Engine-read markers (the mechanic lives in a planner / the attack
    // resolver / an id-keyed allowlist, not in the effects array):
    'guided', // consumed by planConsumeGuidance (rolls the d4)
    'mirror-image-active', // read in the attack planner; appliedConditionLevel = image count
    'hideous-laughter-active', // slice 366: action-blocking (ACTION_BLOCKING_CONDITIONS) + recurringSave; Incapacitated/Prone are engine-coded base conditions
    'cursed-inert-active', // slice 368: recurringSave { onFail: 'dodge' } drives it (save-or-Dodge); the mechanic is the recurring save, not the effects array
    'resisted', // slice 369: consumer-invoked planConsumeResistance rolls the 1d4 reduction (mirrors Absorb Elements); the marker just says Resistance is active
    'addled', // slice 380: Open Hand Technique (Addle); the opportunity-attack planner reads the id to bar OAs (the "can't make Opportunity Attacks" restriction isn't an effect primitive)
    'expeditious-retreat-active', // slice 521: marker condition read by planExpeditiousRetreatDash to gate the per-turn Bonus-Action-Dash arm (the BA-Dash isn't an effect primitive)
    'phantasmal-force-active', // slice 667: marker for planTickRecurring (per-turn 1d6 psychic damage). The disbelieve-on-INT-investigation arm is consumer-driven.
    'dragons-breath-acid-active', // slice 669: marker for planExhaleDragonsBreath (caster picks damage type at cast). The buffed creature uses its action to exhale; the planner reads the variant marker.
    'dragons-breath-cold-active', // slice 669: see dragons-breath-acid-active.
    'dragons-breath-fire-active', // slice 669: see dragons-breath-acid-active.
    'dragons-breath-lightning-active', // slice 669: see dragons-breath-acid-active.
    'dragons-breath-poison-active', // slice 669: see dragons-breath-acid-active.
    'blink-active', // slice 672: marker that Blink is active; consumer calls planBlinkTurnEnd at end-of-turn (rolls d20 vs 11+).
    'blink-ethereal-active', // slice 672: marker that the bearer is currently on the Ethereal Plane. Plane semantics (attacks auto-miss, can pass through objects, 10-ft re-emergence) are consumer-managed (engine has no positions or plane model).
    // (The slice-361 "known-open bugs" group is now empty — all four were fixed in slices 366-369.)
    // Consumer-managed / narrative (no clean engine model):
    'commanded-approach-active',
    'commanded-drop-active',
    'commanded-flee-active',
    'confused-active',
    'emotionally-indifferent-active',
    'water-breathing-active',
  ]);

  const conditionsAppliedByWiredSpells = (): Set<string> => {
    const out = new Set<string>();
    for (const spell of pack.spells) {
      if ((spell.mechanicalEffects?.length ?? 0) === 0) continue;
      for (const set of collectRefsByKey(spell.mechanicalEffects, CONDITION_REF_KEYS).values()) {
        for (const id of set) out.add(id);
      }
    }
    return out;
  };

  it('every condition applied by a wired spell carries effects or is allowlisted', () => {
    const offenders = [...conditionsAppliedByWiredSpells()]
      .filter((id) => {
        const c = condById.get(id);
        return c !== undefined && (c.effects?.length ?? 0) === 0 && !EFFECT_LESS_OK.has(id);
      })
      .sort();
    expect(
      offenders,
      `wired spells apply these effect-less conditions: ${JSON.stringify(offenders)}. Wire the condition's effects, or add it to EFFECT_LESS_OK with a documented reason + a starter-pack-gaps.md row.`,
    ).toEqual([]);
  });

  it('the effect-less allowlist stays accurate (entries still exist and remain empty-effect)', () => {
    const stale = [...EFFECT_LESS_OK]
      .filter((id) => {
        const c = condById.get(id);
        return c === undefined || (c.effects?.length ?? 0) > 0;
      })
      .sort();
    expect(
      stale,
      `EFFECT_LESS_OK entries that vanished or gained effects (remove them; if a known-open bug was fixed, drop it from the allowlist): ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });
});

describe('pack integrity: every Custom handlerId has a backing implementation', () => {
  // A feature/condition effect `{ kind: 'Custom', handlerId }` is a marker
  // that the mechanic is implemented in engine code (a planner, the attack
  // resolver, etc.). A handlerId with no backing implementation is a
  // do-nothing feature. This guard asserts every pack handlerId is either
  // referenced by name in the engine source OR on a documented allowlist
  // of handlers whose implementation does not reference the id string
  // literally (the marker is decorative; the mechanic is keyed off the
  // intent type / weapon / class instead).
  const handlerIds = [
    ...collectRefsByKey(pack, new Set(['handlerId'])).get('handlerId') ?? new Set<string>(),
  ].sort();
  const sourceBlob = collectTsFiles(SRC_DIR)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const referencedInSource = (id: string): boolean => sourceBlob.includes(id);

  // Handlers whose implementation does not contain the handlerId string.
  // Each is genuinely backed; the allowlist documents where.
  const BACKED_INDIRECTLY: ReadonlyMap<string, string> = new Map([
    ['martial-arts', 'attack planner: martialArtsDie / applyMartialArtsDieScaling key off the monk class + weapon, not the handlerId'],
    ['slow-fall', 'planFalling reduces fall damage via its `useSlowFall` arm (5 x monk level), keyed off the intent flag'],
    // Slice 505: ritual-adept was promoted from a Custom-handler stub to a
    // real `GrantRitualAdept` marker effect (observable in the effect
    // stack via `hasRitualAdept()`). Removed from this allowlist when the
    // pack no longer carried the Custom handlerId.
    // Slice 535: narrative-only Halfling traits. The engine cannot model
    // positional gates (Nimbleness = move-through-larger; Naturally
    // Stealthy = Hide-with-larger-creature-obscurement). The markers are
    // declaratively present so consumers (a position-aware UI / VTT) can
    // detect them and enforce the narrative rule. No engine-side handler
    // is required because the rule lives entirely in the consumer.
    ['halfling-nimbleness', 'narrative marker: positional move-through-larger-creature rule; consumer-managed (engine has no position model)'],
    ['halfling-naturally-stealthy', 'narrative marker: Hide-with-larger-creature-obscurement rule; consumer-managed (engine has no LOS / obscurement model)'],
    // Slice 536: narrative-only Elf Trance trait.
    ['elf-trance', 'narrative marker: no-sleep + magic-cant-put-to-sleep + 4-hour Long Rest; consumer-managed (engine does not model sleep state, magical-sleep gates, or rest-wall-clock duration)'],
    // Slice 741: Barbarian L7 Instinctive Pounce — "as part of entering Rage,
    // move up to half your Speed." Positional movement; consumer-managed
    // (engine has no position model). Deliberately not an engine event: reusing
    // Disengaged would over-grant no-provoke (RAW Instinctive Pounce can
    // provoke), so the marker exposes the capability for a position-aware
    // consumer to apply the half-Speed move on Rage.
    ['instinctive-pounce', 'positional marker: half-Speed move when entering Rage; consumer-managed (engine has no position model)'],
    // Slice 537/542: Human Resourceful (Heroic Inspiration on Long
    // Rest) was previously a narrative Custom marker; slice 542
    // promoted it to a real GrantHeroicInspirationOnLongRest effect
    // primitive (observable in the effect stack via
    // hasHeroicInspirationOnLongRest()). Removed from this allowlist
    // when the Custom-marker form left the pack.
  ]);

  it('every Custom handlerId is referenced in engine source or allowlisted as indirectly backed', () => {
    const unbacked = handlerIds
      .filter((id) => !referencedInSource(id) && !BACKED_INDIRECTLY.has(id))
      .sort();
    expect(
      unbacked,
      `Custom handlerIds with no backing implementation: ${JSON.stringify(unbacked)}. Implement the handler/planner, or (if the mechanic is keyed off something other than the id string) add it to BACKED_INDIRECTLY with where it lives.`,
    ).toEqual([]);
  });

  it('the indirectly-backed allowlist stays accurate (entries still exist and are still indirect)', () => {
    const present = new Set(handlerIds);
    const stale = [...BACKED_INDIRECTLY.keys()]
      .filter((id) => !present.has(id) || referencedInSource(id))
      .sort();
    expect(
      stale,
      `BACKED_INDIRECTLY entries that vanished from the pack or are now referenced by name (remove them): ${JSON.stringify(stale)}`,
    ).toEqual([]);
  });
});
