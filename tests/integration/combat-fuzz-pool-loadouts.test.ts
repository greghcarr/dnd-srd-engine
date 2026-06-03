// Slice 622: pool-loadout invariants.
//
// The fuzz tool's per-class loadouts (weapon, armor, cantrips, L1
// spells) are pool-draws from CLASS_POOLS. This test pins the
// invariants that survive any future pool tuning: every drawn weapon /
// armor / spell is a real pack id; equipped armor matches the
// character's class armor proficiency; equipped weapons match the
// character's class weapon proficiency category bucket; and two-handed
// weapons never co-occur with a shield. Deliberately NOT a coverage
// floor (e.g., "fighter must roll N distinct weapons in 50 seeds") --
// that would over-pin the random surface and break on every legitimate
// pool tweak.
//
// Catches: pool typos (weapon id not in pack), proficiency drift
// (martial weapon in a simple-only class), two-handed + shield bug
// regressions, and armorPool entries that resolve to non-armor items.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';

const STARTER = loadStarterPack();

const WEAPON_IDS = new Set(
  STARTER.items.filter((i) => i.itemKind === 'weapon').map((i) => i.id),
);
const ARMOR_IDS = new Set(
  STARTER.items.filter((i) => i.itemKind === 'armor').map((i) => i.id),
);
const SPELL_IDS = new Set(STARTER.spells.map((s) => s.id));

const isTwoHanded = (weaponId: string): boolean => {
  const w = STARTER.items.find((i) => i.id === weaponId);
  if (w === undefined || w.itemKind !== 'weapon') return false;
  return ((w as { properties?: string[] }).properties ?? []).includes('two-handed');
};

const CLASS_WEAPON_PROFS: Readonly<Record<string, ReadonlyArray<string>>> = Object.fromEntries(
  STARTER.classes.map((c) => [c.id, c.weaponProficiencies ?? []]),
);

const CLASS_ARMOR_PROFS: Readonly<Record<string, ReadonlyArray<string>>> = Object.fromEntries(
  STARTER.classes.map((c) => [c.id, c.armorProficiencies ?? []]),
);

const weaponCategoryAllowed = (
  classId: string,
  weaponId: string,
): boolean => {
  const profs = CLASS_WEAPON_PROFS[classId] ?? [];
  if (profs.includes('simple') && profs.includes('martial')) return true;
  const w = STARTER.items.find((i) => i.id === weaponId);
  if (w === undefined || w.itemKind !== 'weapon') return false;
  const cat = (w as { category?: string }).category;
  const props = ((w as { properties?: string[] }).properties ?? []);
  if (cat === 'simple' && profs.includes('simple')) return true;
  if (cat === 'martial' && profs.includes('martial')) return true;
  if (cat === 'martial' && profs.includes('martial-finesse') && props.includes('finesse')) return true;
  if (cat === 'martial' && profs.includes('martial-light') && props.includes('light')) return true;
  return false;
};

describe('combat-fuzz pool-loadout invariants (slice 622)', () => {
  const SEEDS = Array.from({ length: 20 }, (_, i) => 5000 + i);
  const battles = SEEDS.map((seed) => ({ seed, result: runBattle({ seed, pack: STARTER }) }));

  it('every equipped weapon is a real pack weapon', () => {
    for (const { seed, result } of battles) {
      for (const ch of Object.values(result.campaign.state.characters)) {
        const wId = ch.equipped.mainHand;
        if (wId === undefined) continue;
        const inst = result.campaign.state.itemInstances[wId];
        if (inst === undefined) continue;
        const defId = inst.definitionId;
        expect(
          WEAPON_IDS.has(defId),
          `seed=${seed} ${ch.name} equipped weapon "${defId}" not in pack`,
        ).toBe(true);
      }
    }
  });

  it('every equipped armor is a real pack armor', () => {
    for (const { seed, result } of battles) {
      for (const ch of Object.values(result.campaign.state.characters)) {
        const aId = ch.equipped.armor;
        if (aId === undefined) continue;
        const inst = result.campaign.state.itemInstances[aId];
        if (inst === undefined) continue;
        const defId = inst.definitionId;
        expect(
          ARMOR_IDS.has(defId),
          `seed=${seed} ${ch.name} equipped armor "${defId}" not in pack armor set`,
        ).toBe(true);
      }
    }
  });

  it('PC weapons respect class weapon-proficiency category', () => {
    for (const { seed, result } of battles) {
      for (const ch of Object.values(result.campaign.state.characters)) {
        const classId = ch.classes[0]?.classId;
        if (classId === undefined || classId === 'companion') continue;
        const wId = ch.equipped.mainHand;
        if (wId === undefined) continue;
        const defId = result.campaign.state.itemInstances[wId]?.definitionId;
        if (defId === undefined) continue;
        expect(
          weaponCategoryAllowed(classId, defId),
          `seed=${seed} ${ch.name} (${classId}) equipped non-proficient weapon "${defId}"`,
        ).toBe(true);
      }
    }
  });

  it('every prepared spell is a real pack spell', () => {
    for (const { seed, result } of battles) {
      for (const ch of Object.values(result.campaign.state.characters)) {
        for (const spellId of ch.preparedSpells) {
          expect(
            SPELL_IDS.has(spellId),
            `seed=${seed} ${ch.name} has prepared spell "${spellId}" that's not in pack`,
          ).toBe(true);
        }
      }
    }
  });

  it('two-handed weapon and shield never co-occur', () => {
    for (const { seed, result } of battles) {
      for (const ch of Object.values(result.campaign.state.characters)) {
        const wId = ch.equipped.mainHand;
        const shieldId = ch.equipped.shield;
        if (wId === undefined || shieldId === undefined) continue;
        const wDef = result.campaign.state.itemInstances[wId]?.definitionId;
        if (wDef === undefined) continue;
        expect(
          isTwoHanded(wDef),
          `seed=${seed} ${ch.name} has shield + two-handed weapon "${wDef}"`,
        ).toBe(false);
      }
    }
  });

  it('PC armor is in the class armor-proficiency category (or unarmored)', () => {
    for (const { seed, result } of battles) {
      for (const ch of Object.values(result.campaign.state.characters)) {
        const classId = ch.classes[0]?.classId;
        if (classId === undefined || classId === 'companion') continue;
        const aId = ch.equipped.armor;
        if (aId === undefined) continue;
        const armorDef = result.campaign.state.itemInstances[aId]?.definitionId;
        if (armorDef === undefined) continue;
        const item = STARTER.items.find((i) => i.id === armorDef);
        if (item === undefined || item.itemKind !== 'armor') continue;
        const cat = (item as { category?: string }).category;
        const profs = CLASS_ARMOR_PROFS[classId] ?? [];
        if (cat === undefined) continue;
        expect(
          profs.includes(cat),
          `seed=${seed} ${ch.name} (${classId}) wears "${armorDef}" (${cat}) but class profs are ${JSON.stringify(profs)}`,
        ).toBe(true);
      }
    }
  });
});
