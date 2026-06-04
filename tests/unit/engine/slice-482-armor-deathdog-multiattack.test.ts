// Slice 482: Animated Armor + Death Dog Multiattacks - two more
// two-of-same-weapon iconic CR 1 monsters.
//
// RAW (SRD 5.2.1):
// - Animated Armor (CR 1): "Multiattack. The armor makes two Slam
//   attacks. Slam: 1d6 bludgeoning."
// - Death Dog (CR 1): "Multiattack. The death dog makes two Bite
//   attacks. Bite: 1d4 piercing + complex CON-save-disease arm."
//   Disease arm stays deferred; base bite ships.
//
// Both shapes mirror Hippogriff Multiattack (slice 478) and Black
// Bear Multiattack (slice 480).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { runtimeMultiattackFromStatblock } from '../../../src/derive/multiattack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 80, max: 80, temp: 0 },
  });

const SWEEP: ReadonlyArray<{
  statblockId: string;
  weaponId: string;
  damageDice: string;
  damageType: string;
  expectedPattern: { name: string; attacks: ReadonlyArray<{ weaponId: string; count: number }> };
}> = [
  {
    statblockId: 'animated-armor',
    weaponId: 'animated-armor-slam',
    damageDice: '1d6',
    damageType: 'bludgeoning',
    expectedPattern: { name: 'Animated Armor Multiattack', attacks: [{ weaponId: 'animated-armor-slam', count: 2 }] },
  },
  {
    statblockId: 'death-dog',
    weaponId: 'death-dog-bite',
    damageDice: '1d4',
    damageType: 'piercing',
    expectedPattern: { name: 'Death Dog Multiattack', attacks: [{ weaponId: 'death-dog-bite', count: 2 }] },
  },
];

describe('Animated Armor + Death Dog Multiattacks (slice 482)', () => {
  it.each(SWEEP)('$weaponId is a $damageDice $damageType natural weapon', ({ weaponId, damageDice, damageType }) => {
    const w = PACK.items.find((i) => i.id === weaponId);
    expect(w).toBeDefined();
    expect(w && w.itemKind === 'weapon' ? w.damageDice : undefined).toBe(damageDice);
    expect(w && w.itemKind === 'weapon' ? w.damageType : undefined).toBe(damageType);
  });

  it.each(SWEEP)('$statblockId statblock declares the expected Multiattack pattern', ({ statblockId, expectedPattern }) => {
    const m = PACK.monsters.find((m) => m.id === statblockId);
    expect(m?.multiattack).toEqual(expectedPattern);
  });

  it.each(SWEEP)('engine.plan.multiattack on a $statblockId emits 2 AttackRolled events', ({ statblockId, weaponId }) => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const statblock = PACK.monsters.find((m) => m.id === statblockId)!;
    const weapon = makeItemInstance(weaponId);
    const pattern = runtimeMultiattackFromStatblock(statblock.multiattack!, {
      [weaponId]: weapon.id,
    });
    const attacker: Character = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: statblockId,
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId,
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 12, CON: 13, INT: 3, WIS: 6, CHA: 3 },
      hp: { current: 30, max: 30, temp: 0 },
      multiattack: pattern,
    });
    const target = buildTarget();
    let campaign: Campaign = engine.createCampaign({ name: `${statblockId}-multi` });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: weapon },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.multiattack(campaign.state, {
      attackerId: attacker.id,
      targetId: target.id,
    }).events;
    const attacks = events.filter((e) => e.type === 'AttackRolled') as AttackRolledEvent[];
    expect(attacks.length).toBe(2);
  });
});
