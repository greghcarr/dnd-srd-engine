// Slice 456: Zombie Undead Fortitude (save-gated fatal-damage intercept).
//
// RAW (SRD 5.2.1 Zombie): "Undead Fortitude. If damage reduces the
// zombie to 0 Hit Points, it makes a Constitution saving throw (DC 5
// plus the damage taken) unless the damage is Radiant or from a
// Critical Hit. On a successful save, the zombie drops to 1 Hit Point
// instead."
//
// Wired via new PreventFatalDamageOnSave effect kind on the zombie's
// monster traits. interceptFatalDamage rolls the save in-line and emits
// SaveRolled in its extraEvents; on success it scales damage so HP
// lands at 1 (does not consume the trait — Undead Fortitude is
// always-on, not a one-shot like Death Ward).

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';
import { resolveContent } from '../../../src/content/pack.js';
import { interceptFatalDamage } from '../../../src/derive/fatal-damage-intercept.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildZombie = (currentHp: number): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: 'Zombie',
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId: 'zombie',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 13, DEX: 6, CON: 16, INT: 3, WIS: 6, CHA: 5 },
    hp: { current: currentHp, max: 15, temp: 0 },
  });

const setupCampaign = (zombieHp = 5): { campaign: Campaign; zombieId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const zombie = buildZombie(zombieHp);
  let campaign = engine.createCampaign({ name: 'undead-fortitude' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: zombie } satisfies CharacterCreatedEvent,
  ]);
  return { campaign, zombieId: zombie.id };
};

describe('Zombie Undead Fortitude (slice 456)', () => {
  it('non-fatal damage: no save triggered (intercept passthroughs)', () => {
    const { campaign, zombieId } = setupCampaign(15); // full HP
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: zombieId,
      mitigatedComponents: [{ amount: 5, type: 'slashing' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
      rng: seededRNG(1),
    });
    expect(out.components[0]!.amount).toBe(5); // passthrough
    expect(out.extraEvents.find((e) => e.type === 'SaveRolled')).toBeUndefined();
  });

  it('fatal non-radiant non-crit damage: save rolls; on success damage scales to land HP at 1', () => {
    // Zombie at 5 HP takes 8 slashing (would drop to -3). Save DC = 5 + 8 = 13.
    // Zombie CON +3, so save needs d20 >= 10. Try seeds until success rolls.
    let proven = false;
    let attempts = 0;
    while (attempts < 40 && !proven) {
      attempts += 1;
      const { campaign, zombieId } = setupCampaign(5);
      const out = interceptFatalDamage({
        state: campaign.state,
        content: CONTENT,
        targetId: zombieId,
        mitigatedComponents: [{ amount: 8, type: 'slashing' }],
        causedByEventId: 'e1',
        at: isoTimestamp(),
        rng: seededRNG(attempts),
      });
      const save = out.extraEvents.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      expect(save).toBeDefined();
      expect(save!.dc).toBe(13);
      expect(save!.ability).toBe('CON');
      if (save!.success) {
        // Damage scaled so HP lands at 1: zombie at 5 HP, target = 4 damage.
        expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(4);
        proven = true;
      }
    }
    expect(proven, `no save success in ${attempts} seeds`).toBe(true);
  });

  it('fatal save failure: damage passes through unscaled (zombie dies)', () => {
    // Find a seed where the save fails.
    let proven = false;
    let attempts = 0;
    while (attempts < 40 && !proven) {
      attempts += 1;
      const { campaign, zombieId } = setupCampaign(5);
      const out = interceptFatalDamage({
        state: campaign.state,
        content: CONTENT,
        targetId: zombieId,
        mitigatedComponents: [{ amount: 8, type: 'slashing' }],
        causedByEventId: 'e1',
        at: isoTimestamp(),
        rng: seededRNG(attempts + 100),
      });
      const save = out.extraEvents.find((e) => e.type === 'SaveRolled') as SaveRolledEvent | undefined;
      if (save !== undefined && !save.success) {
        expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(8); // unscaled
        proven = true;
      }
    }
    expect(proven, `no save failure in ${attempts} seeds`).toBe(true);
  });

  it('fatal radiant damage: no save rolled (exempt damage type)', () => {
    const { campaign, zombieId } = setupCampaign(5);
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: zombieId,
      mitigatedComponents: [{ amount: 8, type: 'radiant' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
      rng: seededRNG(1),
    });
    expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(8); // passthrough, zombie dies
    expect(out.extraEvents.find((e) => e.type === 'SaveRolled')).toBeUndefined();
  });

  it('fatal damage with mixed components including radiant: no save rolled (exempt fires on any component)', () => {
    const { campaign, zombieId } = setupCampaign(5);
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: zombieId,
      mitigatedComponents: [
        { amount: 4, type: 'slashing' },
        { amount: 4, type: 'radiant' },
      ],
      causedByEventId: 'e1',
      at: isoTimestamp(),
      rng: seededRNG(1),
    });
    expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(8);
    expect(out.extraEvents.find((e) => e.type === 'SaveRolled')).toBeUndefined();
  });

  it('fatal critical hit damage: no save rolled (crit exempt)', () => {
    const { campaign, zombieId } = setupCampaign(5);
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: zombieId,
      mitigatedComponents: [{ amount: 8, type: 'slashing' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
      rng: seededRNG(1),
      critical: true,
    });
    expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(8);
    expect(out.extraEvents.find((e) => e.type === 'SaveRolled')).toBeUndefined();
  });

  it('non-zombie target with PreventFatalDamageOnSave-absent: no save triggered (control)', () => {
    // A wolf (no PreventFatalDamageOnSave trait) at 5 HP takes 8 dmg.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const wolf = CharacterSchema.parse({
      id: newCharacterId(),
      kind: 'creature',
      name: 'Wolf',
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId: 'wolf',
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6 },
      hp: { current: 5, max: 11, temp: 0 },
    });
    let campaign = engine.createCampaign({ name: 'control' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wolf } satisfies CharacterCreatedEvent,
    ]);
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: wolf.id,
      mitigatedComponents: [{ amount: 8, type: 'slashing' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
      rng: seededRNG(1),
    });
    expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(8); // passthrough, wolf dies
    expect(out.extraEvents.find((e) => e.type === 'SaveRolled')).toBeUndefined();
  });
});
