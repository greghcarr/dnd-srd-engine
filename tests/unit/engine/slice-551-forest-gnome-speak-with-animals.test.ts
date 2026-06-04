// Slice 551: Forest Gnome Speak with Animals — per-rest cap closure.
//
// RAW (SRD 5.2.1 Forest Gnome): "You also always have the Speak with
// Animals spell prepared. You can cast it without a spell slot a
// number of times equal to your Proficiency Bonus, and you regain
// all expended uses when you finish a Long Rest. You can also use
// any spell slots you have to cast the spell."
//
// Pre-slice the engine wired this grant as `preparation: "at-will"`
// (infinite casts). That was an over-grant — RAW caps the free casts
// at PB uses per long rest. The engine does not yet model "PB free
// casts per rest" (slice 486's free-cast tracker is boolean per
// spell id, not a counter); the closest RAW-compliant primitive is
// `oncePerLongRest` (1 free cast per LR instead of PB).
//
// Slice 551 picks the conservative direction: under-grant by
// (PB - 1) free casts per rest rather than over-grant infinitely.
// At L1 PB = 2, so RAW = 2 / engine = 1 (one-cast deficit per rest).
// A future slice could introduce a per-spell-id counter primitive to
// land the exact RAW behavior; tracked in starter-pack-gaps.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();

const findForestGnomeOption = () => {
  const gnome = PACK.species?.find((s) => s.id === 'gnome');
  expect(gnome).toBeDefined();
  const lineageChoice = gnome!.traits?.find(
    (t) => t.kind === 'OfferChoice' && t.choiceId === 'gnome-gnomish-lineage',
  ) as { options: Array<{ id: string; effects: Array<{ kind: string; spellId?: string; preparation?: string }> }> } | undefined;
  expect(lineageChoice).toBeDefined();
  const forestGnome = lineageChoice!.options.find((o) => o.id === 'forest-gnome');
  expect(forestGnome).toBeDefined();
  return forestGnome!;
};

describe("Forest Gnome Speak with Animals (slice 551)", () => {
  it('Speak with Animals is granted as oncePerLongRest, not at-will', () => {
    const forestGnome = findForestGnomeOption();
    const swa = forestGnome.effects.find(
      (e) => e.kind === 'GrantSpell' && e.spellId === 'speak-with-animals',
    );
    expect(swa).toBeDefined();
    expect(swa!.preparation).toBe('oncePerLongRest');
    // Sanity: explicitly NOT at-will (the pre-slice value)
    expect(swa!.preparation).not.toBe('at-will');
  });

  it('Minor Illusion (the Forest Gnome cantrip) remains at-will', () => {
    const forestGnome = findForestGnomeOption();
    const minorIllusion = forestGnome.effects.find(
      (e) => e.kind === 'GrantSpell' && e.spellId === 'minor-illusion',
    );
    expect(minorIllusion).toBeDefined();
    // Cantrips are at-will per RAW — confirm slice 551 didn't accidentally
    // change the wrong line.
    expect(minorIllusion!.preparation).toBe('at-will');
  });

  it('Rock Gnome cantrips remain at-will (control: did not touch other lineage)', () => {
    const gnome = PACK.species?.find((s) => s.id === 'gnome');
    const lineageChoice = gnome!.traits?.find(
      (t) => t.kind === 'OfferChoice' && t.choiceId === 'gnome-gnomish-lineage',
    ) as { options: Array<{ id: string; effects: Array<{ kind: string; spellId?: string; preparation?: string }> }> };
    const rockGnome = lineageChoice.options.find((o) => o.id === 'rock-gnome')!;
    for (const e of rockGnome.effects) {
      if (e.kind === 'GrantSpell') {
        expect(e.preparation).toBe('at-will'); // cantrips
      }
    }
  });
});
