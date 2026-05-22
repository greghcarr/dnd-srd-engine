#!/usr/bin/env node
// Release-time review report for the front-door percentages and
// wired-counts that are NOT cleanly machine-derivable.
//
// Companion to scripts/sync-doc-counts.mjs (which auto-fixes the one
// unambiguous number, the test/file total). This script does NOT write
// anything. It computes the best available ground-truth signal for each
// tracked figure, lists every doc line that cites it (so the surrounding
// prose gets re-read, not just the number), and prints a verdict:
//
//   [COMPUTED]  the figure is derivable; the report asserts the cited
//               number matches the signal (MATCH / DRIFT).
//   [JUDGMENT]  no single machine criterion is honest (e.g. "wired"
//               spans the effects array + dedicated planners + handlers
//               + UseItem/ConsumeItem wiring; the effects>0 criterion
//               undercounts planner-driven content). The report prints
//               the signal next to the doc's estimate so a human can
//               confirm or update it, and flags the prose for review.
//
// Run at release time (see DEVELOPMENT.md "Cutting a release"). The
// content counts themselves (spell/item/monster/condition totals,
// EFFECT_KINDS) are guarded per-commit by tests/audit/doc-counts.test.ts
// + gaps-spells-counts.test.ts, so they are always accurate; this report
// covers the derived percentages and the wired tallies layered on top.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

// Front-door surfaces carrying the percentages / wired tallies.
const DOC_FILES = ['README.md', 'docs/status.md'];

// ---------- ground-truth signals ----------

const pack = JSON.parse(read('src/content/packs/starter-pack.json'));
const effWired = (x) => Array.isArray(x.effects) && x.effects.length > 0;

const spellSplit = () => {
  const re = /^## Level (\d+) \((\d+) in pack\): (\d+) wired, (\d+) narrative, (\d+) deferred/gm;
  const doc = read('docs/gaps-spells.md');
  let m, p = 0, w = 0, n = 0, x = 0;
  while ((m = re.exec(doc)) !== null) { p += +m[2]; w += +m[3]; n += +m[4]; x += +m[5]; }
  return { p, w, n, x, pct: ((100 * w) / p).toFixed(1) };
};

const itemsByKind = () => {
  const out = {};
  for (const it of pack.items) {
    const k = it.itemKind ?? '?';
    out[k] = out[k] ?? { total: 0, effWired: 0 };
    out[k].total += 1;
    if (effWired(it)) out[k].effWired += 1;
  }
  return out;
};

const subclassFeatures = () => {
  let total = 0, wired = 0;
  for (const s of pack.subclasses ?? []) {
    for (const arr of Object.values(s.levelGrants ?? {})) {
      for (const f of Array.isArray(arr) ? arr : []) {
        total += 1;
        if (effWired(f)) wired += 1;
      }
    }
  }
  return { total, wired, pct: ((100 * wired) / total).toFixed(0) };
};

const effectKinds = () => {
  const src = read('src/schemas/effects.ts');
  const block = src.slice(src.indexOf('EFFECT_KINDS = ['));
  const kinds = block.slice(0, block.indexOf(']')).match(/'[A-Za-z]+'/g) ?? [];
  return kinds.length;
};

const MM_STATBLOCK_ESTIMATE = 370; // "full MM" denominator cited in status.md.
const monsterCount = () => pack.monsters.length;

// ---------- citation finder ----------

// Returns [{ file, line, text }] for every doc line matching `re`.
const citations = (re) => {
  const hits = [];
  for (const file of DOC_FILES) {
    const lines = read(file).split('\n');
    lines.forEach((text, i) => {
      if (re.test(text)) hits.push({ file, line: i + 1, text: text.trim() });
    });
  }
  return hits;
};

const printCitations = (re) => {
  const hits = citations(re);
  if (hits.length === 0) {
    console.log('    (no citations found; phrasing may have changed, update this report\'s regex)');
    return;
  }
  for (const h of hits) {
    const snippet = h.text.length > 240 ? `${h.text.slice(0, 240)}...` : h.text;
    console.log(`    ${h.file}:${h.line}  ${snippet}`);
  }
};

// ---------- figures ----------

const figures = [
  {
    name: 'Spells wired',
    type: 'COMPUTED',
    run: () => {
      const s = spellSplit();
      console.log(`  signal: ${s.w} wired / ${s.n} narrative / ${s.x} deferred / ${s.p} total = ${s.pct}% wired (summed from docs/gaps-spells.md headers, which gaps-spells-counts guards for internal consistency)`);
      console.log('  cited in:');
      printCitations(/\d+\/351 wired|wired count \d+|spells \(shipped\)|~?\d+% of spells/i);
      const wiredCited = citations(/\b194\b|\b\d+\/351 wired/).some((c) => c.text.includes(String(s.w)));
      console.log(`  verdict: wired count ${s.w} ${wiredCited ? 'MATCHES' : 'NOT FOUND in'} the cited lines. Re-read the lines above for stale narrative/schema-only splits and the %.`);
    },
  },
  {
    name: 'Effect-primitive vocabulary',
    type: 'COMPUTED',
    run: () => {
      const k = effectKinds();
      console.log(`  signal: ${k} EFFECT_KINDS entries (${k - 1} primitives + the Custom escape hatch) in src/schemas/effects.ts`);
      console.log('  cited in:');
      printCitations(/EFFECT_KINDS|primitives|effect-primitive/i);
      // Both numbers a citation can carry: the EFFECT_KINDS total (k) and
      // the primitive count (k-1, excluding the Custom hatch). A "N
      // primitives" claim that isn't k-1 is stale.
      const primitiveClaims = citations(/(\d+) (declarative |wired )?primitives/i)
        .map((c) => ({ ...c, n: Number(/(\d+) (declarative |wired )?primitives/i.exec(c.text)[1]) }));
      const stale = primitiveClaims.filter((c) => c.n !== k - 1);
      if (stale.length > 0) {
        console.log(`  verdict: DRIFT. Expected "${k - 1} primitives" (= ${k} EFFECT_KINDS - Custom). Stale citations:`);
        for (const s of stale) console.log(`    ${s.file}:${s.line} says ${s.n} primitives`);
      } else {
        console.log(`  verdict: primitive count ${k - 1} (+ Custom = ${k}) MATCHES all cited lines. The ~NN% maturity estimate has no machine denominator, so JUDGMENT; confirm it still reads true.`);
      }
    },
  },
  {
    name: 'Monsters (pack vs full MM)',
    type: 'COMPUTED',
    run: () => {
      const c = monsterCount();
      console.log(`  signal: ${c} statblocks in pack / ~${MM_STATBLOCK_ESTIMATE} full-MM estimate = ~${((100 * c) / MM_STATBLOCK_ESTIMATE).toFixed(0)}%`);
      console.log('  cited in:');
      printCitations(/\d+\/~?\d+ (MM )?statblocks|~?\d+% pack vs full MM|monster statblocks/i);
      console.log(`  verdict: pack count ${c} is doc-counts-guarded; confirm the ~% and the "/~${MM_STATBLOCK_ESTIMATE}" denominator + surrounding prose still read true.`);
    },
  },
  {
    name: 'Magic items mechanically wired',
    type: 'JUDGMENT',
    run: () => {
      const k = itemsByKind();
      const fmt = (kind) => `${kind} ${k[kind]?.effWired ?? 0}/${k[kind]?.total ?? 0}`;
      console.log(`  signal (effects>0 only, UNDERCOUNTS planner/handler/consumable wiring): ${fmt('magic')}, ${fmt('consumable')}, ${fmt('weapon')}, ${fmt('armor')}`);
      console.log('    NOTE: consumables (potions/scrolls) are UseItem/ConsumeItem-driven and ship effects:[]; the doc\'s ~45 wired consumables is the accurate human figure, not the 0 here.');
      console.log('  cited in:');
      printCitations(/magic items? \+ .*consumables? mechanically wired|~?\d+% mechanically wired|~?\d+ magic items?.*wired/i);
      console.log('  verdict: JUDGMENT. Use the effects>0 magic-item signal as a floor; confirm the ~91/~45 tallies + ~35% against recent item/consumable wiring slices, and re-read the prose.');
    },
  },
  {
    name: 'Subclasses wired',
    type: 'JUDGMENT',
    run: () => {
      const s = subclassFeatures();
      console.log(`  signal: ${s.wired}/${s.total} shipped subclass features have effects>0 (${s.pct}% of SHIPPED features; planner-driven features ship effects:[] and are undercounted)`);
      console.log('    NOTE: status.md\'s ~40% measures wired features against a broader denominator (post-L3 features across the SRD subclasses), not this shipped-feature ratio. Use this as a directional signal only.');
      console.log('  cited in:');
      printCitations(/subclass/i);
      console.log('  verdict: JUDGMENT. Cross-check against docs/srd-5.2.1-audit-classes.md (the authoritative per-feature tracker) and the recent subclass-feature slices, then confirm the ~% + prose.');
    },
  },
  {
    name: 'Headline aggregate (SRD pack-presence + architecture)',
    type: 'JUDGMENT',
    run: () => {
      console.log('  signal: none; this is an explicit weighted editorial aggregate of catalog presence + locked architecture.');
      console.log('  cited in:');
      printCitations(/pack-presence \+ architecture|headline aggregate|~?\d+%/i);
      console.log('  verdict: JUDGMENT. No machine signal. Confirm the ~85% still reflects the per-row numbers below it and re-read the prose.');
    },
  },
];

// ---------- run ----------

console.log('Release-time doc-figure review (read-only). Auto-fix the test/file count separately with `npm run release:doc-counts`.\n');
console.log(`Front-door surfaces scanned: ${DOC_FILES.join(', ')}\n`);
for (const f of figures) {
  console.log(`### ${f.name}  [${f.type}]`);
  f.run();
  console.log('');
}
console.log('Review every line above. For COMPUTED figures, fix any number that does not MATCH. For JUDGMENT figures, confirm the estimate against its signal and recent slices. When ANY number changes, re-read the full sentence it sits in for stale accompanying text.');
