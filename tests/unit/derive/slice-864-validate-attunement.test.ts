// Slice 864 — `attune-prereq-not-validated`.
//
// `applyItemAttuned` (a content-less reducer) gates the 3-slot limit and
// double-attunement but can't see whether an item even REQUIRES attunement,
// nor its restriction text. Attunement is consumer-committed (no planAttune
// planner), so the engine ships `validateAttunement` — the consumer-validator
// pattern (cf. `validateMulticlass`, slice 810) — that a UI runs before
// committing the ItemAttuned event.
//
// `requiresAttunement` is machine-checkable; the `attunementCondition`
// restriction ("by a Dwarf", "by a Spellcaster") is free-form prose, so it's
// returned as `unverifiedCondition` for the consumer / DM to confirm.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { validateAttunement } from '../../../src/derive/attunement-prereq.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema, type ItemInstance } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const hero = (attuned: string[] = []): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    equipped: { attuned: attuned as never },
  });

const inst = (definitionId: string, over: Partial<ItemInstance> = {}): ItemInstance =>
  ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId, ...over });

describe('slice 864: validateAttunement enforces the engine-checkable attunement rules', () => {
  it('an attunement item with no restriction is attunable (no issues, no condition)', () => {
    const v = validateAttunement(hero(), inst('gauntlets-of-ogre-power'), CONTENT);
    expect(v.issues).toEqual([]);
    expect(v.unverifiedCondition).toBeUndefined();
  });

  it('surfaces a free-form attunement restriction for the consumer to confirm', () => {
    // Dwarven Thrower: "Requires Attunement by a Dwarf or a creature attuned
    // to a Belt of Dwarvenkind" — the engine can't machine-verify that.
    const v = validateAttunement(hero(), inst('dwarven-thrower'), CONTENT);
    expect(v.issues).toEqual([]); // the engine-checkable rules pass
    expect(v.unverifiedCondition).toMatch(/Dwarf/);
  });

  it('rejects attuning an item that does not require attunement', () => {
    const v = validateAttunement(hero(), inst('dagger'), CONTENT);
    expect(v.issues.some((i) => /does not require attunement/i.test(i))).toBe(true);
  });

  it('rejects an already-attuned instance', () => {
    const v = validateAttunement(hero(), inst('gauntlets-of-ogre-power', { attuned: true }), CONTENT);
    expect(v.issues.some((i) => /already attuned/i.test(i))).toBe(true);
  });

  it('rejects attuning a 4th item when the 3-slot limit is full', () => {
    const full = hero([newItemInstanceId(), newItemInstanceId(), newItemInstanceId()]);
    const v = validateAttunement(full, inst('gauntlets-of-ogre-power'), CONTENT);
    expect(v.issues.some((i) => /maximum of 3 attuned/i.test(i))).toBe(true);
  });
});
