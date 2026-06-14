// Slice 857 — `graze-hardcodes-str`.
//
// Graze damage ("the target takes damage equal to the ability modifier you
// used to make the attack") was computed from the RAW SNAPSHOT Strength —
// `abilityModifier(attacker.abilityScores.STR)` — instead of the EFFECTIVE
// score. So a Greatsword wielder with Gauntlets of Ogre Power (STR set to 19)
// dealt Graze damage from their unmodified STR, not the boosted 19. The
// weapon-mastery save DC (`masterySaveDC`, used by Topple) had the same
// base-STR bug (a pattern-check sibling).
//
// Both now read the EFFECTIVE STR modifier via the effect stack
// (`effectiveAbilityScore` + the ability-score floor / increase), the same
// derivation the attack planner uses. Every in-scope Graze weapon (Greatsword,
// Greataxe... actually Greataxe is Cleave; Greatsword is the Graze weapon) is
// Heavy / non-Finesse, so the ability used is always STR.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

// A L5 Fighter (PB +3) with a DUMP Strength of 8 (−1). Equips `weaponDef`
// (mastered) and optionally attunes Gauntlets of Ogre Power (STR → 19, +4).
const setup = (weaponDef: string, withGauntlets: boolean) => {
  const weapon = makeItemInstance(weaponDef);
  const gauntlets = makeItemInstance('gauntlets-of-ogre-power');
  const attacker: Character = CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Weakling',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 44, max: 44, temp: 0 },
    weaponMasteries: [weaponDef],
    inventory: withGauntlets ? [weapon.id, gauntlets.id] : [weapon.id],
    equipped: withGauntlets
      ? { mainHand: weapon.id, attuned: [gauntlets.id] as never }
      : { mainHand: weapon.id },
  });
  const target: Character = CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'criminal',
    classes: [{ classId: 'rogue', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
  let campaign: Campaign = engine.createCampaign({ name: 'graze' });
  const events = [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired' as const, instance: weapon },
    ...(withGauntlets ? [{ id: eventId(), at: isoTimestamp(), type: 'ItemAcquired' as const, instance: gauntlets }] : []),
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ];
  campaign = commit(campaign, events);
  return { engine, campaign, attacker, target, weapon };
};

describe('slice 857: Graze (and the mastery save DC) read effective STR, not base', () => {
  it('a STR-8 Greatsword wielder with Gauntlets of Ogre Power deals 4 Graze damage (effective STR 19)', () => {
    const { engine, campaign, attacker, target, weapon } = setup('greatsword', true);
    const events = engine.plan.weaponMastery(campaign.state, {
      mastery: 'Graze',
      attackerId: attacker.id,
      targetId: target.id,
      weaponInstanceId: weapon.id,
    }).events;
    const dmg = events.find((e) => e.type === 'DamageApplied') as DamageAppliedEvent | undefined;
    expect(dmg).toBeDefined();
    expect(dmg!.components[0]!.amount).toBe(4); // +4 from STR 19, NOT −1→0 from base STR 8
  });

  it('without the Gauntlets, the same STR-8 wielder deals no Graze damage (base −1 clamps to 0)', () => {
    const { engine, campaign, attacker, target, weapon } = setup('greatsword', false);
    const events = engine.plan.weaponMastery(campaign.state, {
      mastery: 'Graze',
      attackerId: attacker.id,
      targetId: target.id,
      weaponInstanceId: weapon.id,
    }).events;
    expect(events.some((e) => e.type === 'DamageApplied')).toBe(false);
  });

  it('the Topple save DC also reads effective STR (Gauntlets raise DC 10 → 15)', () => {
    const withDC = (() => {
      const { engine, campaign, attacker, target, weapon } = setup('maul', true);
      const events = engine.plan.weaponMastery(campaign.state, {
        mastery: 'Topple',
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: weapon.id,
      }).events;
      return (events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent).dc;
    })();
    const withoutDC = (() => {
      const { engine, campaign, attacker, target, weapon } = setup('maul', false);
      const events = engine.plan.weaponMastery(campaign.state, {
        mastery: 'Topple',
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: weapon.id,
      }).events;
      return (events.find((e) => e.type === 'SaveRolled') as SaveRolledEvent).dc;
    })();
    expect(withoutDC).toBe(10); // 8 + PB 3 + base STR mod −1
    expect(withDC).toBe(15); // 8 + PB 3 + effective STR mod +4
  });
});
