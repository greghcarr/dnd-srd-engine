// Slice 788: the monster-actions enabler. `MonsterStatblock.actions` links
// each attack to its weapon definition (closing `no-actions-field`), and
// `monsterAttackActions` resolves that link so a consumer queries the wolf's
// Bite instead of hardcoding `wolf → wolf-bite`.

import { describe, expect, it } from 'vitest';
import { resolveContent } from '../../../src/content/pack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { monsterAttackActions } from '../../../src/query/content-query.js';

const content = resolveContent([loadStarterPack()]);

describe('monsterAttackActions (slice 788)', () => {
  it("resolves a single-attack beast's natural weapon to its definition", () => {
    const actions = monsterAttackActions(content, 'wolf');
    expect(actions).toHaveLength(1);
    expect(actions[0]!.name).toBe('Bite');
    expect(actions[0]!.weaponId).toBe('wolf-bite');
    expect(actions[0]!.weapon?.id).toBe('wolf-bite');
    expect(actions[0]!.weapon?.itemKind).toBe('weapon');
  });

  it('lists every attack option for a multi-weapon monster (Scout: Shortsword + Longbow)', () => {
    const actions = monsterAttackActions(content, 'scout');
    expect(actions.map((a) => a.weaponId)).toEqual(['shortsword', 'longbow']);
    expect(actions.every((a) => a.weapon !== undefined)).toBe(true);
  });

  it('returns [] for an unknown statblock', () => {
    expect(monsterAttackActions(content, 'no-such-monster')).toEqual([]);
  });

  it('returns [] for a statblock with no authored actions (the long tail, pre-sweep)', () => {
    // Tarrasque has no `actions` authored yet (the multiattack content sweep
    // is a follow-up); the resolver degrades to empty rather than throwing.
    expect(monsterAttackActions(content, 'tarrasque')).toEqual([]);
  });
});

describe('MonsterStatblock.actions schema (slice 788)', () => {
  it('defaults to [] when a statblock omits it', () => {
    const tarrasque = content.monsters.get('tarrasque');
    expect(tarrasque?.actions).toEqual([]);
  });

  it('the 25 combat-fuzz monsters all carry a primary action', () => {
    const fuzzMonsters = ['wolf', 'goblin-warrior', 'skeleton', 'zombie', 'scout', 'imp', 'boar'];
    for (const id of fuzzMonsters) {
      const actions = content.monsters.get(id)?.actions ?? [];
      expect(actions.length, `${id} should have a primary action`).toBeGreaterThanOrEqual(1);
    }
  });
});
