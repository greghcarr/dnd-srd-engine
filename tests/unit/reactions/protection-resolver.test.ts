// Slice 753 / 755: deterministic correctness gate for the positional
// Protection branch of the pre-damage reaction resolver. Random tactical
// fuzz almost never lines up (a shield-bearing ally with the Protection
// fighting style adjacent to an attacked ally), so this constructs the
// scenario directly: two allies 5 ft apart, the protector with Protection +
// a shield, an enemy hitting the other ally. Asserts the reaction fires and
// the damage is dropped exactly when the disadvantage reroll flips the hit
// to a miss, and that an out-of-range protector does NOT react.
//
// Slice 755: the resolver now takes an attack INTENT and plans the roll via
// the engine two-phase API (engine.plan.attackRoll / attackDamage) rather
// than receiving synthesized events. So the attacker makes a real ranged
// attack on its turn; the test reads the actual AttackRolled + ProtectionUsed
// from the committed log and asserts the prevent-iff-flip invariant against
// the real rolls.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { resolveAttackWithReactions } from '../../../scripts/reactions/pre-damage-policy.js';
import { disadvantageFlipsHit } from '../../../src/ai/reactions.js';
import { replay } from '../../../src/engine/replay.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import type { Event } from '../../../src/schemas/events/index.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance, loadPhbExtrasTestPack } from '../../fixtures/index.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const PACK = loadStarterPack();
const EXTRAS = loadPhbExtrasTestPack();

// Seed chosen so the attacker's real shortbow attack hits the target (the
// precondition for the Protection window to open); asserted in the test.
const SEED = 7;

const fighter = (
  name: string,
  opts: { shieldId?: string; weaponId?: string; protection?: boolean; dex?: number } = {},
): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 3, hitDiceRemaining: 3 }],
    abilityScores: { STR: 16, DEX: opts.dex ?? 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 28, max: 28, temp: 0 },
    featsTaken: opts.protection === true ? ['fighting-style-protection'] : [],
    inventory: [
      ...(opts.shieldId !== undefined ? [opts.shieldId] : []),
      ...(opts.weaponId !== undefined ? [opts.weaponId] : []),
    ],
    equipped: { ...(opts.shieldId !== undefined ? { shield: opts.shieldId } : {}), attuned: [] },
  });

const activeCombatantId = (campaign: Campaign, encounterId: string): string => {
  const enc = campaign.state.encounters[encounterId]!;
  return enc.combatants[enc.activeIndex]!.combatantId;
};

// Build a started, positioned encounter (protector, target, attacker),
// advance to the attacker's turn, and run the resolver with the attacker's
// shortbow attack intent on the target.
const run = (protectorPos: { x: number; y: number }): {
  campaign: Campaign;
  targetId: string;
  attackRolled: AttackRolledEvent | undefined;
} => {
  const engine = createEngine({ contentPacks: [PACK, EXTRAS], rng: seededRNG(SEED) });
  const shield = makeItemInstance('shield');
  const bow = makeItemInstance('shortbow');
  const protector = fighter('Shielder', { shieldId: shield.id, protection: true });
  const target = fighter('Ally');
  const attacker = fighter('Archer', { weaponId: bow.id, dex: 18 });

  let campaign = engine.createCampaign({ name: 'protection' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: shield },
    { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: bow },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: protector },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target },
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker },
  ] as Event[]);

  // Attacker 35 ft from the target — within shortbow normal range (80 ft, no
  // long-range disadvantage) and not adjacent to anyone (no ranged-in-melee
  // disadvantage), so the roll is a clean single d20 (the Protection gate).
  const enc = engine.plan.createEncounter(campaign.state, {
    name: 'arena',
    combatants: [
      { characterId: protector.id, position: protectorPos },
      { characterId: target.id, position: { x: 5, y: 0 } },
      { characterId: attacker.id, position: { x: 40, y: 0 } },
    ],
  });
  campaign = commit(campaign, enc.events);
  campaign = commit(campaign, engine.plan.rollInitiative(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.startEncounter(campaign.state, { encounterId: enc.encounterId }).events);
  campaign = commit(campaign, engine.plan.beginFirstTurn(campaign.state, { encounterId: enc.encounterId }).events);

  // Advance to the attacker's turn so its attack is action-economy-legal.
  let guard = 0;
  while (activeCombatantId(campaign, enc.encounterId) !== attacker.id) {
    campaign = commit(campaign, engine.plan.advanceTurn(campaign.state, { encounterId: enc.encounterId }).events);
    if ((guard += 1) > 10) throw new Error('attacker never became the active combatant');
  }

  const after = resolveAttackWithReactions({
    engine,
    campaign,
    encounterId: enc.encounterId,
    attackIntent: { attackerId: attacker.id, targetId: target.id, weaponInstanceId: bow.id },
    defenderTeam: [protector.id, target.id],
    isTactical: true,
  });
  const attackRolled = after.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
  return { campaign: after, targetId: target.id, attackRolled };
};

const damageAppliedTo = (events: ReadonlyArray<Event>, targetId: string): boolean =>
  events.some((e) => e.type === 'DamageApplied' && (e as { targetId: string }).targetId === targetId);

describe('Protection resolver (slice 753/755)', () => {
  it('an adjacent shield-protector reacts; damage is dropped exactly when the reroll flips the hit', () => {
    const { campaign, targetId, attackRolled } = run({ x: 0, y: 0 }); // 5 ft from the target
    // Precondition: the attack must hit for the Protection window to open.
    expect(attackRolled?.hit, 'the constructed attack did not hit (pick a hitting seed)').toBe(true);
    const used = campaign.events.find((e) => e.type === 'ProtectionUsed');
    expect(used, 'Protection did not fire for the adjacent protector').toBeDefined();
    const newD20 = (used as { newD20: number }).newD20;
    const flipped = disadvantageFlipsHit(
      attackRolled!.d20[0]!,
      newD20,
      attackRolled!.attackBonus,
      attackRolled!.targetAC,
    );
    expect(damageAppliedTo(campaign.events, targetId), 'damage should be dropped iff the hit flipped to a miss')
      .toBe(!flipped);
    // The committed log must rebuild the exact state.
    expect(JSON.stringify(replay(campaign.events))).toBe(JSON.stringify(campaign.state));
  });

  it('a protector more than 5 ft away does not react', () => {
    const { campaign, targetId, attackRolled } = run({ x: 60, y: 0 }); // 55 ft from the target
    expect(attackRolled?.hit, 'the constructed attack did not hit (pick a hitting seed)').toBe(true);
    expect(campaign.events.some((e) => e.type === 'ProtectionUsed'), 'Protection fired out of range').toBe(false);
    expect(damageAppliedTo(campaign.events, targetId), 'the unprotected hit should land').toBe(true);
  });
});
