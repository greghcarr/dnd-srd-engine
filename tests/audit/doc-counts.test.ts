// Doc-counts audit.
//
// Slice 362. Pins the headline content counts cited in the live
// front-door docs to the actual source (the starter pack JSON +
// EFFECT_KINDS), so a content slice that bumps a count fails CI until the
// docs are updated in the SAME slice, instead of drifting silently until a
// periodic batch reconciliation (slices 337 and 361 were two such
// reconciliations). This is the same "promote a repeatable sweep to a
// permanent audit" move as the per-level spell-count guard in
// gaps-spells-counts.test.ts; that audit owns the wired/narrative/deferred
// spell split, so this one deliberately does NOT re-check it.
//
// When this audit fails:
//   1. The failure names the doc + the count that drifted.
//   2. Update that doc's citation to the new source-derived value.
//   3. If you intentionally rephrased a citation so a regex no longer
//      matches, update the regex here in the same slice (keep the guard
//      alive, the way gaps-spells-counts requires its header format).
//
// Only source-derivable, drift-prone counts are guarded. Test counts
// stay out of scope (circular). Percentages were out of scope too until
// slice 631 added derivable wired-vs-total spell percentage guards
// (source: the gaps-spells.md per-level catalog, which is itself audit-
// pinned to the pack via gaps-spells-counts.test.ts).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EFFECT_KINDS } from '../../src/schemas/effects.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

interface Pack {
  conditions: ReadonlyArray<unknown>;
  monsters: ReadonlyArray<unknown>;
  spells: ReadonlyArray<unknown>;
  feats: ReadonlyArray<unknown>;
  species: ReadonlyArray<unknown>;
  backgrounds: ReadonlyArray<unknown>;
  items: ReadonlyArray<{ itemKind: string }>;
}

const pack: Pack = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'src/content/packs/starter-pack.json'), 'utf8'),
);

const RAW_CONDITION_COUNT = 15;
const itemsByKind = pack.items.reduce<Record<string, number>>((acc, i) => {
  acc[i.itemKind] = (acc[i.itemKind] ?? 0) + 1;
  return acc;
}, {});

// Slice 631: derive the spell wired/narrative/deferred/total split from
// the gaps-spells.md per-level catalog (the canonical per-level wiring
// source). Headers parse as:
//   ## Level N (P in pack): W wired, R narrative, X deferred
// The gaps-spells-counts audit pins the inPack numbers to the pack; we
// piggyback on that and sum the wired / narrative / deferred per level
// for the front-door-doc citations + the rounded percentage.
const SPELL_HEADER_RE =
  /^## Level (\d+) \((\d+) in pack\): (\d+) wired, (\d+) narrative, (\d+) deferred\s*$/gm;
const spellsDoc = readFileSync(resolve(REPO_ROOT, 'docs/gaps-spells.md'), 'utf8');
let wiredTotal = 0;
let narrativeTotal = 0;
let deferredTotal = 0;
let inPackTotal = 0;
{
  let m: RegExpExecArray | null;
  while ((m = SPELL_HEADER_RE.exec(spellsDoc)) !== null) {
    inPackTotal += Number(m[2]);
    wiredTotal += Number(m[3]);
    narrativeTotal += Number(m[4]);
    deferredTotal += Number(m[5]);
  }
}
const spellWiredPct = Math.round((wiredTotal / inPackTotal) * 100);

// Ground truth, computed from source so it auto-tracks the pack.
const GT = {
  conditionsTotal: pack.conditions.length,
  conditionsRider: pack.conditions.length - RAW_CONDITION_COUNT,
  monsters: pack.monsters.length,
  spells: pack.spells.length,
  feats: pack.feats.length,
  species: pack.species.length,
  backgrounds: pack.backgrounds.length,
  weapon: itemsByKind.weapon ?? 0,
  armor: itemsByKind.armor ?? 0,
  consumable: itemsByKind.consumable ?? 0,
  tool: itemsByKind.tool ?? 0,
  gear: itemsByKind.gear ?? 0,
  magic: itemsByKind.magic ?? 0,
  effectKinds: EFFECT_KINDS.length, // includes Custom escape hatch
  primitives: EFFECT_KINDS.length - 1, // excludes the Custom escape hatch
  spellsWired: wiredTotal,
  spellsNarrative: narrativeTotal,
  spellsDeferred: deferredTotal,
  spellsTotal: inPackTotal,
  spellWiredPct,
} as const;

const readDoc = (rel: string): string => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

// Each check: a canonical citation in a live doc, a regex whose capture
// groups are the cited numbers (in order), and the source-derived values
// they must equal. A required citation that no longer matches fails too,
// so a rephrase forces a same-slice regex update (keeping the guard live).
interface CountCheck {
  readonly file: string;
  readonly label: string;
  readonly pattern: RegExp;
  readonly expected: ReadonlyArray<number>;
}

const CHECKS: ReadonlyArray<CountCheck> = [
  {
    file: 'docs/getting-started.md',
    label: 'conditions (total + rider)',
    pattern: /(\d+) conditions \(all 15 RAW plus (\d+) mechanic-rider/,
    expected: [GT.conditionsTotal, GT.conditionsRider],
  },
  {
    file: 'docs/getting-started.md',
    label: 'items by kind + monsters',
    pattern:
      /(\d+) weapons \+ (\d+) armors \+ (\d+) tools \+ (\d+) adventuring-gear items \+ (\d+) consumables, (\d+) magic items, (\d+) monster statblocks/,
    expected: [GT.weapon, GT.armor, GT.tool, GT.gear, GT.consumable, GT.magic, GT.monsters],
  },
  {
    file: 'docs/getting-started.md',
    label: 'spells total',
    pattern: /(\d+) spells \(the complete SRD/,
    expected: [GT.spells],
  },
  {
    file: 'docs/getting-started.md',
    label: 'feats total',
    pattern: /(\d+) feats \(\d+ origin/,
    expected: [GT.feats],
  },
  {
    file: 'docs/getting-started.md',
    label: 'species + backgrounds',
    pattern: /(\d+) species, (\d+) backgrounds \(/,
    expected: [GT.species, GT.backgrounds],
  },
  {
    file: 'docs/status.md',
    label: 'conditions row (total + rider)',
    pattern: /(\d+) \(15 RAW \+ (\d+) rider\)/,
    expected: [GT.conditionsTotal, GT.conditionsRider],
  },
  {
    file: 'docs/starter-pack-gaps.md',
    label: 'conditions row (total + rider)',
    pattern: /(\d+) \(15 RAW \+ (\d+) rider\)/,
    expected: [GT.conditionsTotal, GT.conditionsRider],
  },
  {
    file: 'docs/starter-pack-gaps.md',
    label: 'items by kind',
    pattern:
      /(\d+) weapons \+ (\d+) armor \+ (\d+) consumables \+ (\d+) tools \+ (\d+) gear \+ (\d+) magic items/,
    expected: [GT.weapon, GT.armor, GT.consumable, GT.tool, GT.gear, GT.magic],
  },
  {
    file: 'docs/authoring-content-packs.md',
    label: 'effect kinds (total + primitives)',
    pattern: /(\d+) effect kinds \((\d+) primitives/,
    expected: [GT.effectKinds, GT.primitives],
  },
  {
    file: 'docs/concepts.md',
    label: 'effect primitives',
    pattern: /about (\d+) \*\*effect primitives\*\*/,
    expected: [GT.primitives],
  },
  // EFFECT_KINDS drift hit 5 front-door citations between alpha.15 and
  // the 0.2.0 release: README "52 declarative primitives", README
  // "currently 52 primitives plus the `Custom` escape hatch", README
  // "(N primitives + `Custom` escape hatch in `EFFECT_KINDS`)", and
  // status.md "N wired primitives ... (M `EFFECT_KINDS` entries total)".
  // Promote each to a pinned citation so the next bump trips CI in the
  // same slice instead of waiting for the next release-doc-review.
  {
    file: 'README.md',
    label: 'declarative primitives (Why this engine bullet)',
    pattern: /(\d+) declarative primitives express the bulk/,
    expected: [GT.primitives],
  },
  {
    file: 'README.md',
    label: 'currently N primitives plus the Custom escape hatch (Architecture bullet)',
    pattern: /currently (\d+) primitives plus the `Custom` escape hatch/,
    expected: [GT.primitives],
  },
  {
    file: 'README.md',
    label: 'N primitives + Custom escape hatch (Status bullet)',
    pattern: /\((\d+) primitives \+ `Custom` escape hatch in `EFFECT_KINDS`\)/,
    expected: [GT.primitives],
  },
  {
    file: 'docs/status.md',
    label: 'Effect-primitive vocabulary row (N wired primitives + M EFFECT_KINDS entries total)',
    pattern: /(\d+) wired primitives plus the `Custom` escape hatch\*\* \((\d+) `EFFECT_KINDS` entries total/,
    expected: [GT.primitives, GT.effectKinds],
  },
  // Slice 631: spell wired-vs-total percentage + split, derived from
  // gaps-spells.md (which is itself audit-pinned to the pack).
  {
    file: 'README.md',
    label: 'spell mechanical wiring (pct + W/T + narrative + deferred)',
    pattern:
      /Spell mechanical wiring ~(\d+)% \((\d+)\/(\d+) wired, (\d+) narrative, (\d+) schema-only/,
    expected: [
      GT.spellWiredPct,
      GT.spellsWired,
      GT.spellsTotal,
      GT.spellsNarrative,
      GT.spellsDeferred,
    ],
  },
  {
    file: 'docs/status.md',
    label: 'headline spell wiring aggregate (pct + W/T + narrative + deferred)',
    pattern:
      /~(\d+)% of spells \((\d+)\/(\d+) wired, with (\d+) narrative \+ (\d+) schema-only\)/,
    expected: [
      GT.spellWiredPct,
      GT.spellsWired,
      GT.spellsTotal,
      GT.spellsNarrative,
      GT.spellsDeferred,
    ],
  },
  {
    file: 'docs/status.md',
    label: 'Spells (mechanically wired) row (W/T + narrative + deferred)',
    pattern:
      /(\d+)\/(\d+) wired \(cast-time `mechanicalEffects`[^)]*\); (\d+) narrative-only and (\d+) schema-only/,
    expected: [GT.spellsWired, GT.spellsTotal, GT.spellsNarrative, GT.spellsDeferred],
  },
  {
    file: 'docs/status.md',
    label: 'Spells content-gaps row (wired count + narrative + deferred)',
    pattern: /Wired count (\d+) \([^)]*\); (\d+) ship narrative-only and (\d+) schema-only/,
    expected: [GT.spellsWired, GT.spellsNarrative, GT.spellsDeferred],
  },
  {
    file: 'docs/getting-started.md',
    label: 'spell wiring (W + narrative + deferred)',
    pattern:
      /\d+ spells \(the complete SRD 5\.2\.1 catalog; (\d+) mechanically wired, (\d+) narrative-only, (\d+) schema-only\)/,
    expected: [GT.spellsWired, GT.spellsNarrative, GT.spellsDeferred],
  },
];

describe('doc-counts audit: live docs cite the current source-derived counts', () => {
  for (const check of CHECKS) {
    it(`${check.file}: ${check.label}`, () => {
      const text = readDoc(check.file);
      const match = check.pattern.exec(text);
      expect(
        match,
        `Could not find the "${check.label}" citation in ${check.file} (pattern ${check.pattern}). If you rephrased it, update the regex in tests/audit/doc-counts.test.ts in the same slice.`,
      ).not.toBeNull();
      const actual = match!.slice(1, check.expected.length + 1).map((n) => Number.parseInt(n, 10));
      expect(
        actual,
        `Stale count in ${check.file} ("${check.label}"): doc says ${JSON.stringify(actual)}, source says ${JSON.stringify(check.expected)}. Update the doc.`,
      ).toEqual([...check.expected]);
    });
  }
});
