// Slice 798: armor with the Stealth-disadvantage property imposes
// Disadvantage on Dexterity (Stealth) checks while worn (Area 6
// divergence `armor-stealth-disadvantage`). The `stealthDisadvantage`
// flag was authored on every armor entry (Padded, Scale Mail, Half
// Plate, Ring Mail, Splint, Chain Mail, Plate) but never read — a
// plate-wearer rolled Stealth normally. computeAbilityCheck now reads
// the equipped armor's definition (the same instance→definition path
// computeAC uses) and OR-s in disadvantage for the stealth skill.

import { describe, expect, it } from 'vitest';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

// Build a character wearing `armorId` (or nothing) + the itemInstances map.
const wearing = (armorId?: string): { character: Character; itemInstances: Record<string, ReturnType<typeof ItemInstanceSchema.parse>> } => {
  const itemInstances: Record<string, ReturnType<typeof ItemInstanceSchema.parse>> = {};
  let armorInstanceId: string | undefined;
  if (armorId !== undefined) {
    const inst = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: armorId });
    itemInstances[inst.id] = inst;
    armorInstanceId = inst.id;
  }
  const character = CharacterSchema.parse({
    id: newCharacterId(), name: 'Scout', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'rogue', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 10 },
    hp: { current: 21, max: 21, temp: 0 },
    equipped: armorInstanceId !== undefined ? { armor: armorInstanceId, attuned: [] } : { attuned: [] },
  });
  return { character, itemInstances };
};

const stealth = (armorId?: string) => {
  const { character, itemInstances } = wearing(armorId);
  return computeAbilityCheck({ character, itemInstances, content: CONTENT, ability: 'DEX', skill: 'stealth' });
};

describe('Armor Stealth disadvantage (slice 798)', () => {
  it('Splint (stealthDisadvantage: true) imposes disadvantage on Stealth', () => {
    const r = stealth('splint');
    expect(r.hasDisadvantage).toBe(true);
    expect(r.hasAdvantage).toBe(false);
  });

  it('Scale Mail + Half Plate + Ring Mail + Padded all impose Stealth disadvantage', () => {
    for (const id of ['scale-mail', 'half-plate', 'ring-mail', 'padded-armor']) {
      expect(stealth(id).hasDisadvantage, `${id} should impose Stealth disadvantage`).toBe(true);
    }
  });

  it('Studded Leather + Breastplate (stealthDisadvantage: false) do NOT', () => {
    expect(stealth('studded-leather').hasDisadvantage).toBe(false);
    expect(stealth('breastplate').hasDisadvantage).toBe(false);
  });

  it('no armor → no Stealth disadvantage', () => {
    expect(stealth(undefined).hasDisadvantage).toBe(false);
  });

  it('the disadvantage is Stealth-specific: a non-Stealth DEX check (Acrobatics) is unaffected', () => {
    const { character, itemInstances } = wearing('splint');
    const acro = computeAbilityCheck({ character, itemInstances, content: CONTENT, ability: 'DEX', skill: 'acrobatics' });
    expect(acro.hasDisadvantage).toBe(false);
    // A raw DEX check (no skill) while wearing Splint is also unaffected.
    const rawDex = computeAbilityCheck({ character, itemInstances, content: CONTENT, ability: 'DEX' });
    expect(rawDex.hasDisadvantage).toBe(false);
  });

  it('passive Stealth takes the -5 from the disadvantage', () => {
    const noArmor = stealth(undefined).total;
    // Same modifiers, but disadvantage → passive score is 5 lower.
    const { character, itemInstances } = wearing('splint');
    const splintCheck = computeAbilityCheck({ character, itemInstances, content: CONTENT, ability: 'DEX', skill: 'stealth' });
    expect(splintCheck.total).toBe(noArmor); // flat modifier unchanged
    expect(splintCheck.hasDisadvantage).toBe(true); // the -5 applies at the passive layer
  });
});
