// Slice 411: content query/browse surface (the read layer's first piece).
//
// Pins the consumer-facing browsers DDB leads with: filter spells by
// level / school / class / concentration / ritual / name, monsters by
// type / size / CR range, items by kind / rarity / name, each returned
// in a stable display order. Runs against the real SRD starter pack so
// the assertions double as coverage that the filters compose correctly
// over production content.
import { describe, expect, it } from 'vitest';
import { resolveContent } from '../../../src/content/pack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { querySpells, queryMonsters, queryItems } from '../../../src/query/content-query.js';

const content = resolveContent([loadStarterPack()]);

const isSorted = <T>(xs: readonly T[], rank: (x: T) => number): boolean =>
  xs.every((x, i) => i === 0 || rank(xs[i - 1]!) <= rank(x));

describe('slice 411: querySpells', () => {
  it('empty filter returns every spell, ordered by level then name', () => {
    const all = querySpells(content);
    expect(all.length).toBe(content.spells.size);
    expect(isSorted(all, (s) => s.level)).toBe(true);
  });

  it('exact level filter returns only that level', () => {
    const cantrips = querySpells(content, { level: 0 });
    expect(cantrips.length).toBeGreaterThan(0);
    expect(cantrips.every((s) => s.level === 0)).toBe(true);
  });

  it('level range bounds are inclusive', () => {
    const low = querySpells(content, { levelMin: 1, levelMax: 3 });
    expect(low.length).toBeGreaterThan(0);
    expect(low.every((s) => s.level >= 1 && s.level <= 3)).toBe(true);
  });

  it('exact level overrides the range bounds', () => {
    const result = querySpells(content, { level: 2, levelMin: 5, levelMax: 9 });
    expect(result.every((s) => s.level === 2)).toBe(true);
  });

  it('school + class compose', () => {
    const wizardEvocation = querySpells(content, { school: 'evocation', class: 'wizard' });
    expect(wizardEvocation.length).toBeGreaterThan(0);
    expect(wizardEvocation.every((s) => s.school === 'evocation' && s.classes.includes('wizard'))).toBe(true);
  });

  it('class match is case-insensitive', () => {
    expect(querySpells(content, { class: 'WIZARD' }).length).toBe(querySpells(content, { class: 'wizard' }).length);
  });

  it('concentration and ritual flags filter', () => {
    expect(querySpells(content, { concentration: true }).every((s) => s.concentration)).toBe(true);
    expect(querySpells(content, { ritual: true }).every((s) => s.ritual)).toBe(true);
  });

  it('search is a case-insensitive name substring', () => {
    const hits = querySpells(content, { search: 'fire' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((s) => s.name.toLowerCase().includes('fire'))).toBe(true);
  });
});

describe('slice 411: queryMonsters', () => {
  it('empty filter returns every monster, ordered by CR then name', () => {
    const all = queryMonsters(content);
    expect(all.length).toBe(content.monsters.size);
    expect(isSorted(all, (m) => m.cr)).toBe(true);
  });

  it('CR range bounds are inclusive and fractional', () => {
    const low = queryMonsters(content, { crMin: 0, crMax: 0.25 });
    expect(low.length).toBeGreaterThan(0);
    expect(low.every((m) => m.cr >= 0 && m.cr <= 0.25)).toBe(true);
  });

  it('type filter narrows to one creature type', () => {
    const dragons = queryMonsters(content, { type: 'Dragon' });
    expect(dragons.length).toBeGreaterThan(0);
    expect(dragons.every((m) => m.type === 'Dragon')).toBe(true);
  });
});

describe('slice 411: queryItems', () => {
  it('empty filter returns every item, ordered by name', () => {
    const all = queryItems(content);
    expect(all.length).toBe(content.items.size);
    expect(all.every((it, i) => i === 0 || all[i - 1]!.name.localeCompare(it.name) <= 0)).toBe(true);
  });

  it('itemKind filter narrows to one kind', () => {
    const weapons = queryItems(content, { itemKind: 'weapon' });
    expect(weapons.length).toBeGreaterThan(0);
    expect(weapons.every((it) => it.itemKind === 'weapon')).toBe(true);
  });

  it('rarity filter matches only items carrying that rarity', () => {
    const rare = queryItems(content, { rarity: 'rare' });
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every((it) => 'rarity' in it && it.rarity === 'rare')).toBe(true);
  });
});
