// Slice 805: a creature at 0 HP (synthetic Unconscious) now gets the
// Unconscious condition's mechanical arms applied consistently (Area 4
// divergence `drop-to-0-no-unconscious-arms`). The engine already gave
// the within-5-ft auto-crit synthetically (HP <= 0) but NOT the
// "attackers have Advantage" or "auto-fail STR/DEX saves" arms — those
// live on the `unconscious` condition's effects, which the HP-drop path
// never applies. Both are now keyed on HP <= 0 too, matching the auto-crit.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { computeSavingThrow } from '../../../src/derive/save.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { ItemInstanceSchema } from '../../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildPC = (name: string, hpCurrent: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name, speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: hpCurrent, max: 40, temp: 0 },
  });

describe('Unconscious arms on a 0-HP drop (slice 805)', () => {
  it('attacks against a target at 0 HP have Advantage (two d20s)', () => {
    const attacker = buildPC('Attacker', 40);
    const downed = buildPC('Downed', 0); // unconscious
    const sword = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(805) });
    let campaign: Campaign = engine.createCampaign({ name: 'unconscious-adv' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: downed } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'ItemEquipped', characterId: attacker.id, instanceId: sword.id, slot: 'mainHand' },
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: attacker.id, targetId: downed.id, weaponInstanceId: sword.id,
    }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled')!;
    expect(rolled.used).toBe('advantage');
    expect(rolled.d20).toHaveLength(2);
  });

  it('a conscious target grants no such advantage (control)', () => {
    const attacker = buildPC('Attacker', 40);
    const healthy = buildPC('Healthy', 40);
    const sword = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'longsword' });
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(806) });
    let campaign: Campaign = engine.createCampaign({ name: 'conscious' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: healthy } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'ItemEquipped', characterId: attacker.id, instanceId: sword.id, slot: 'mainHand' },
    ]);
    const events = engine.plan.attack(campaign.state, {
      attackerId: attacker.id, targetId: healthy.id, weaponInstanceId: sword.id,
    }).events;
    const rolled = events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled')!;
    expect(rolled.used).toBe('none');
  });

  it('a creature at 0 HP auto-fails STR and DEX saves, but not CON', () => {
    const downed = buildPC('Downed', 0);
    const strSave = computeSavingThrow({ character: downed, itemInstances: {}, content: CONTENT, ability: 'STR' });
    const dexSave = computeSavingThrow({ character: downed, itemInstances: {}, content: CONTENT, ability: 'DEX' });
    const conSave = computeSavingThrow({ character: downed, itemInstances: {}, content: CONTENT, ability: 'CON' });
    expect(strSave.hasAutoFail).toBe(true);
    expect(dexSave.hasAutoFail).toBe(true);
    expect(conSave.hasAutoFail).toBe(false); // CON saves are not auto-failed
  });

  it('a conscious creature auto-fails nothing (control)', () => {
    const healthy = buildPC('Healthy', 40);
    for (const ability of ['STR', 'DEX', 'CON'] as const) {
      expect(computeSavingThrow({ character: healthy, itemInstances: {}, content: CONTENT, ability }).hasAutoFail).toBe(false);
    }
  });
});
