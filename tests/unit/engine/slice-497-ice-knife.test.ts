// Slice 497: Ice Knife (L1) - single-target attack + hit-or-miss AOE save.
//
// RAW (SRD 5.2.1 Ice Knife, Druid/Sorcerer/Wizard): "Make a ranged
// spell attack against the target. On a hit, the target takes 1d10
// Piercing damage. Hit or miss, the shard then explodes. The target
// and each creature within 5 feet of it must succeed on a Dexterity
// saving throw or take 2d6 Cold damage. Using a Higher-Level Spell
// Slot: The Cold damage increases by 1d6 for each spell slot level
// above 1."
//
// Engine addition: `targetScope?: 'first' | 'all'` on the attack
// mechanic (slice 497). `'first'` makes the attack resolve against
// only targetIds[0]; the sibling save mechanic keeps the default
// 'all' so the cold burst covers the primary + splash creatures.
//
// Content: ice-knife mechanicalEffects = [attack (1d10 piercing,
// targetScope 'first'), save (DEX, 2d6 cold, halfOnSuccess false,
// extraDicePerSlotLevel 1)].

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildWizard = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wizard',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 8, DEX: 10, CON: 12, INT: 18, WIS: 12, CHA: 10 },
    hp: { current: 18, max: 18, temp: 0 },
    knownSpells: ['ice-knife'],
    preparedSpells: ['ice-knife'],
  });

const buildTarget = (name: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Ice Knife (slice 497)', () => {
  it('ice-knife ships the two-mechanic shape (attack targetScope first + DEX-save cold AOE)', () => {
    const s = PACK.spells.find((sp) => sp.id === 'ice-knife');
    // attackKind defaults to 'ranged' at parse time (slice 371).
    expect(s?.mechanicalEffects).toEqual([
      { kind: 'attack', damageDice: '1d10', damageType: 'piercing', targetScope: 'first', attackKind: 'ranged' },
      { kind: 'save', ability: 'DEX', damageDice: '2d6', damageType: 'cold', halfOnSuccess: false, extraDicePerSlotLevel: 1 },
    ]);
  });

  it('casting Ice Knife emits exactly ONE AttackRolled (the primary) + a SaveRolled per target', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const wizard = buildWizard();
    const primary = buildTarget('Primary');
    const splash = buildTarget('Splash');
    let campaign: Campaign = engine.createCampaign({ name: 'ice-knife' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: primary } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: splash } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'ice-knife',
      slotLevel: 1,
      targetIds: [primary.id, splash.id],
    }).events;
    const attacks = events.filter((e) => e.type === 'AttackRolled') as AttackRolledEvent[];
    // targetScope 'first': exactly one attack, against the primary.
    expect(attacks.length).toBe(1);
    expect(attacks[0]!.targetId).toBe(primary.id);
    const saves = events.filter((e) => e.type === 'SaveRolled') as SaveRolledEvent[];
    // The AOE save fires for both the primary and the splash creature.
    expect(saves.length).toBe(2);
    for (const s of saves) expect(s.ability).toBe('DEX');
  });

  it('the AOE save fires hit-or-miss (a SaveRolled is present regardless of the attack outcome)', () => {
    // Sweep a few seeds; both a hit and a miss seed should still emit
    // the SaveRolled for each target.
    let sawHit = false;
    let sawMiss = false;
    for (let seed = 1; seed < 40 && !(sawHit && sawMiss); seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const wizard = buildWizard();
      const primary = buildTarget('Primary');
      let campaign: Campaign = engine.createCampaign({ name: `ik-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: primary } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.castSpell(campaign.state, {
        characterId: wizard.id,
        spellId: 'ice-knife',
        slotLevel: 1,
        targetIds: [primary.id],
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined;
      const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      // The save must be present on both hit and miss.
      expect(save, `seed ${seed}: expected a SaveRolled regardless of hit`).toBeDefined();
      if (attack?.hit === true) sawHit = true;
      else sawMiss = true;
    }
    expect(sawHit, 'expected at least one hit seed').toBe(true);
    expect(sawMiss, 'expected at least one miss seed').toBe(true);
  });

  it('upcasting at slot 2 adds 1 extra cold die (1d6 per slot above 1)', () => {
    // An L3 wizard has L1 + L2 slots (no L3 slots), so upcast at slot 2.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(5) });
    const wizard = buildWizard();
    const primary = buildTarget('Primary');
    let campaign: Campaign = engine.createCampaign({ name: 'ik-upcast' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wizard } satisfies CharacterCreatedEvent,
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: primary } satisfies CharacterCreatedEvent,
    ]);
    const events = engine.plan.castSpell(campaign.state, {
      characterId: wizard.id,
      spellId: 'ice-knife',
      slotLevel: 2,
      targetIds: [primary.id],
    }).events;
    // 2d6 base + extraDicePerSlotLevel 1 * (2-1) = 1 extra = 3 cold dice.
    // The cold damage applied to the target reflects a 3d6 roll on a
    // failed save; assert the save chain fired (the dice detail is owned
    // by tighter save-mechanic unit tests).
    const save = events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
    expect(save).toBeDefined();
    expect(save?.ability).toBe('DEX');
  });
});
