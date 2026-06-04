// Slice 476: Pack Tactics sweep - Hobgoblin Warrior + Tough +
// Warrior Infantry, the three CR <= 0.5 humanoid pack-fighters
// whose 2024 SRD traits include Pack Tactics but the pack shipped
// them with traits: [].
//
// RAW (SRD 5.2.1, all three): "Pack Tactics. The [hobgoblin /
// tough / warrior] has Advantage on an attack roll against a
// creature if at least one of the [...]'s allies is within 5 feet
// of the creature and the ally doesn't have the Incapacitated
// condition."
//
// Pure content slice; exercises the existing slice-445
// `event.attackerHasAllyAdjacentToTarget` consumer-coordinated fact.
// Each monster carries the same SetAdvantage trait shape as the
// already-wired wolf / kobold-warrior / giant-rat / dire-wolf.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';

const PACK = loadStarterPack();

const SWEEP_IDS = ['hobgoblin-warrior', 'tough', 'warrior-infantry'] as const;
type SweepId = (typeof SWEEP_IDS)[number];

const buildMonster = (statblockId: SweepId): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: statblockId,
    speciesId: 'companion',
    backgroundId: 'companion',
    statblockId,
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 13, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 9 },
    hp: { current: 11, max: 11, temp: 0 },
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Hero',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 12, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe('Pack Tactics sweep (slice 476)', () => {
  it.each(SWEEP_IDS)('%s statblock carries the Pack Tactics SetAdvantage trait', (statblockId) => {
    const m = PACK.monsters.find((m) => m.id === statblockId);
    expect(m).toBeDefined();
    const pt = m!.traits.find(
      (t) => t.kind === 'SetAdvantage' && JSON.stringify(t).includes('attackerHasAllyAdjacentToTarget'),
    );
    expect(pt).toBeDefined();
  });

  it.each(SWEEP_IDS)(
    '%s attack with attackerHasAllyAdjacentToTarget=true rolls with Advantage',
    (statblockId) => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const attacker = buildMonster(statblockId);
      const target = buildTarget();
      const spear = makeItemInstance('spear');
      let campaign = engine.createCampaign({ name: `pack-tactics-${statblockId}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: spear },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: spear.id,
        attackerHasAllyAdjacentToTarget: true,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent;
      expect(attack.used).toBe('advantage');
    },
  );

  it.each(SWEEP_IDS)(
    '%s attack without attackerHasAllyAdjacentToTarget rolls normally (no advantage)',
    (statblockId) => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
      const attacker = buildMonster(statblockId);
      const target = buildTarget();
      const spear = makeItemInstance('spear');
      let campaign = engine.createCampaign({ name: `pack-tactics-${statblockId}-no` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: spear },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: target.id,
        weaponInstanceId: spear.id,
      }).events;
      const attack = events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent;
      expect(attack.used).toBe('none');
    },
  );
});
