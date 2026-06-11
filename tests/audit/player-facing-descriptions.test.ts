// Slice 811: `description` is now an end-user-facing string — dnd-web's
// tap-to-read rules feature shows it verbatim (Spells/Items/Bonus info
// buttons, the inspect tooltip, the battle log). So a shipped
// `description` must read as clean SRD-style rules text, with no
// engineering artifacts: no `Slice <n>` changelog refs, no `RAW (...)`
// citation wrappers, no consumer/implementation commentary. Those live in
// the sibling `engineNotes` field (dev-only, not shown to players).
//
// This lint walks every player-facing `description` in the starter pack
// and fails on the artifact markers so the cleanup can't regress.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/content/packs/starter.js';

const PACK = loadStarterPack();

// Markers that betray an engineering note leaking into player text.
const ARTIFACT_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: 'Slice <n> changelog ref', re: /\bSlice \d/ },
  { label: 'RAW (...) citation wrapper', re: /\bRAW\b/ },
  { label: 'consumer/implementation note', re: /consumer/i },
];

// Collect every player-facing `description` string with a locating path.
// Only the `description` key is player-facing; `engineNotes` is exempt.
const collectDescriptions = (): Array<{ path: string; text: string }> => {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === 'description' && typeof v === 'string') {
          out.push({ path: `${path}.description`, text: v });
        } else if (k !== 'engineNotes') {
          walk(v, `${path}.${k}`);
        }
      }
    }
  };
  walk(PACK, 'pack');
  return out;
};

describe('player-facing descriptions are clean SRD text (slice 811)', () => {
  const descriptions = collectDescriptions();

  it('the pack ships player-facing descriptions to lint', () => {
    expect(descriptions.length).toBeGreaterThan(100);
  });

  for (const { label, re } of ARTIFACT_PATTERNS) {
    it(`no shipped description contains an engineering artifact: ${label}`, () => {
      const offenders = descriptions
        .filter((d) => re.test(d.text))
        .map((d) => `${d.path}: ${d.text.slice(0, 90)}…`);
      expect(offenders, `${offenders.length} description(s) still carry "${label}"`).toEqual([]);
    });
  }
});
