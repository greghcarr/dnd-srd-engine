// Slice 400 - multi-pack id-collision policy + the pack validator.
//
// resolveContent merges packs into a global per-category id namespace in
// array order. Before this slice a reused id silently clobbered the
// earlier entry. Now resolveContent throws on any within-pack duplicate
// or undeclared cross-pack collision; a later pack may intentionally
// replace an earlier id only by declaring it in its `overrides`.
// validatePacks is the report-all author-time companion (collisions +
// dangling cross-references, no throw).
import { describe, expect, it } from 'vitest';
import {
  loadContentPack,
  resolveContent,
  detectIdCollisions,
  ContentPackLoadError,
  type ContentPack,
} from '../../../src/content/pack.js';
import { validatePacks } from '../../../src/content/validate.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const pack = (id: string, body: Record<string, unknown>): ContentPack =>
  loadContentPack({ id, name: id, version: '0.0.1', ...body });

describe('slice 400: resolveContent id-collision policy', () => {
  it('throws on a within-pack duplicate id (same category)', () => {
    const p = pack('dup', { conditions: [{ id: 'x', name: 'X' }, { id: 'x', name: 'X again' }] });
    expect(() => resolveContent([p])).toThrow(ContentPackLoadError);
    expect(() => resolveContent([p])).toThrow(/duplicate id "x"/);
  });

  it('throws on an undeclared cross-pack collision', () => {
    const a = pack('srd', { conditions: [{ id: 'fireball-burn', name: 'Burn' }] });
    const b = pack('home', { conditions: [{ id: 'fireball-burn', name: 'Burn (house)' }] });
    expect(() => resolveContent([a, b])).toThrow(/collides with pack "srd"/);
  });

  it('allows a cross-pack override when the later pack declares it; later wins', () => {
    const a = pack('srd', { conditions: [{ id: 'fireball-burn', name: 'Burn' }] });
    const b = pack('home', {
      overrides: ['fireball-burn'],
      conditions: [{ id: 'fireball-burn', name: 'Burn (house)' }],
    });
    const resolved = resolveContent([a, b]);
    expect(resolved.conditions.get('fireball-burn')?.name).toBe('Burn (house)');
  });

  it('does not flag the same id reappearing within one pack across DIFFERENT categories', () => {
    // A condition `shield` and a feat `shield` legitimately coexist
    // (ids are per-category). No collision.
    const p = pack('multi', {
      conditions: [{ id: 'shield', name: 'Shield (condition)' }],
      feats: [{ id: 'shield', name: 'Shield (feat)', category: 'origin', repeatable: false, prerequisites: [], effects: [] }],
    });
    expect(detectIdCollisions([p])).toEqual([]);
  });
});

describe('slice 400: detectIdCollisions reports without throwing', () => {
  it('names the colliding id, category, and prior pack', () => {
    const a = pack('srd', { conditions: [{ id: 'x', name: 'X' }] });
    const b = pack('home', { conditions: [{ id: 'x', name: 'X2' }] });
    const issues = detectIdCollisions([a, b]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('conditions');
    expect(issues[0]?.message).toContain('overrides');
  });
});

describe('slice 400: validatePacks (report-all)', () => {
  it('reports both a collision and a dangling cross-reference at once, without throwing', () => {
    const a = pack('srd', { conditions: [{ id: 'x', name: 'X' }] });
    const b = pack('home', {
      conditions: [{ id: 'x', name: 'X2' }], // undeclared collision
      subclasses: [{ id: 'mystic', name: 'Mystic', parentClassId: 'nope', levelTable: { 3: { features: [], columns: {} } } }],
    });
    const issues = validatePacks([a, b]);
    expect(issues.some((i) => /collides/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.path === 'subclasses.mystic.parentClassId')).toBe(true);
  });

  it('the shipped starter pack validates clean (no collisions, no dangling refs)', () => {
    expect(validatePacks([loadStarterPack()])).toEqual([]);
  });
});
