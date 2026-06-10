// Slice 804: Armor Training penalties (Area 6 divergence
// `untrained-armor-penalty`). RAW equipment.md "Armor Training": "If you
// wear Light, Medium, or Heavy armor and lack training with it, you have
// Disadvantage on any D20 Test that involves Strength or Dexterity, and
// you can't cast spells." and "You gain the Armor Class benefit of a
// Shield only if you have training with it." The class `armorProficiencies`
// arrays were authored but never read.
//
// A Wizard (no armor training) in Chain Mail exercises the untrained
// path; a Fighter (trained with all armor + shields) is the trained
// control.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { computeAC } from '../../../src/derive/ac.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

interface Gear { armor?: string; shield?: string; mainHand?: string }
const build = (classId: string, gear: Gear = {}): { character: Character; itemInstances: Record<string, ReturnType<typeof ItemInstanceSchema.parse>> } => {
  const itemInstances: Record<string, ReturnType<typeof ItemInstanceSchema.parse>> = {};
  const slot = (defId?: string): string | undefined => {
    if (defId === undefined) return undefined;
    const inst = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: defId });
    itemInstances[inst.id] = inst;
    return inst.id;
  };
  const armor = slot(gear.armor), shield = slot(gear.shield), mainHand = slot(gear.mainHand);
  const character = CharacterSchema.parse({
    id: newCharacterId(), name: classId, speciesId: 'human', backgroundId: 'sage',
    classes: [{ classId, level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    knownSpells: ['fire-bolt'], preparedSpells: ['fire-bolt'],
    equipped: {
      ...(armor !== undefined ? { armor } : {}),
      ...(shield !== undefined ? { shield } : {}),
      ...(mainHand !== undefined ? { mainHand } : {}),
      attuned: [],
    },
  });
  return { character, itemInstances };
};

const check = (c: ReturnType<typeof build>, ability: 'STR' | 'DEX' | 'CON' | 'INT') =>
  computeAbilityCheck({ character: c.character, itemInstances: c.itemInstances, content: CONTENT, ability });
const save = (c: ReturnType<typeof build>, ability: 'STR' | 'DEX' | 'CON') =>
  computeSavingThrow({ character: c.character, itemInstances: c.itemInstances, content: CONTENT, ability });
const ac = (c: ReturnType<typeof build>) =>
  computeAC({ character: c.character, itemInstances: c.itemInstances, content: CONTENT }).total;

describe('Untrained armor penalties (slice 804)', () => {
  it('untrained body armor → Disadvantage on STR and DEX checks, but not other abilities', () => {
    const wiz = build('wizard', { armor: 'chain-mail' }); // Wizard has no armor training
    expect(check(wiz, 'STR').hasDisadvantage).toBe(true);
    expect(check(wiz, 'DEX').hasDisadvantage).toBe(true);
    expect(check(wiz, 'INT').hasDisadvantage).toBe(false); // not a STR/DEX test
  });

  it('a trained wearer (Fighter) gets no check penalty in the same armor', () => {
    const ftr = build('fighter', { armor: 'chain-mail' });
    expect(check(ftr, 'STR').hasDisadvantage).toBe(false);
    expect(check(ftr, 'DEX').hasDisadvantage).toBe(false);
  });

  it('untrained body armor → Disadvantage on STR/DEX saves, not CON', () => {
    const wiz = build('wizard', { armor: 'chain-mail' });
    expect(save(wiz, 'STR').hasDisadvantage).toBe(true);
    expect(save(wiz, 'DEX').hasDisadvantage).toBe(true);
    expect(save(wiz, 'CON').hasDisadvantage).toBe(false);
    expect(save(build('fighter', { armor: 'chain-mail' }), 'DEX').hasDisadvantage).toBe(false);
  });

  it('an untrained Shield grants no AC; a trained one grants +2', () => {
    const wizNoShield = ac(build('wizard'));
    const wizShield = ac(build('wizard', { shield: 'shield' }));
    expect(wizShield).toBe(wizNoShield); // untrained → no benefit
    const ftrNoShield = ac(build('fighter'));
    const ftrShield = ac(build('fighter', { shield: 'shield' }));
    expect(ftrShield).toBe(ftrNoShield + 2); // trained → +2
  });

  it('cannot cast spells while wearing untrained armor', () => {
    const wiz = build('wizard', { armor: 'chain-mail' });
    const target = build('fighter');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(804) });
    let campaign: Campaign = engine.createCampaign({ name: 'no-cast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wiz.character } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target.character } satisfies CharacterCreatedEvent,
    ]);
    // The wizard's chain-mail instance must be in state for the gate to see it.
    const armorInst = Object.values(wiz.itemInstances)[0]!;
    campaign = commit(campaign, [{ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armorInst }]);
    expect(() => engine.plan.castSpell(campaign.state, {
      characterId: wiz.character.id, spellId: 'fire-bolt', slotLevel: 0, targetIds: [target.character.id],
    })).toThrow(/armor/i);
  });

  it('untrained body armor → Disadvantage on weapon attack rolls', () => {
    const attacker = build('wizard', { armor: 'chain-mail', mainHand: 'dagger' });
    const target = build('fighter');
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(805) });
    let campaign: Campaign = engine.createCampaign({ name: 'untrained-attack' });
    const weaponInst = Object.values(attacker.itemInstances).find((i) => i.definitionId === 'dagger')!;
    const armorInst = Object.values(attacker.itemInstances).find((i) => i.definitionId === 'chain-mail')!;
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weaponInst },
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: armorInst },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker.character } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target.character } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: attacker.character.id, targetId: target.character.id, weaponInstanceId: weaponInst.id,
    }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled')!;
    expect(rolled.used).toBe('disadvantage');
    expect(rolled.d20).toHaveLength(2);
  });
});
