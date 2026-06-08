// Golden scenario: Monk L6 Empowered Strikes (slice 207; re-wired to SRD
// 5.2.1 in slice 735).
//
// RAW (SRD 5.2.1): "Whenever you deal damage with your Unarmed Strike, it
// can deal your choice of Force damage or its normal damage type."
//
// Sequence:
//   1. Monk L6 (Kai) faces a Stoneskinned target (Warded). Stoneskin
//      grants resistance to nonmagical Bludgeoning/Piercing/Slashing.
//   2. Kai punches Warded, choosing Force damage (`unarmedStrikeAsForce`,
//      enabled by the `GrantUnarmedForceOption` marker). The strike's
//      damage type becomes Force, which Stoneskin's B/P/S-only resistance
//      doesn't cover.
//   3. The DamageApplied component is Force and carries no `mitigation`
//      flag — choosing Force sidestepped the resistance.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../src/engine/index.js';
import { seededRNG } from '../../src/rng/seeded.js';
import { throwOnCallRNG } from '../../src/rng/throw.js';
import { replay } from '../../src/engine/replay.js';
import { commit, type Campaign } from '../../src/engine/commit.js';
import { loadStarterPack } from '../../src/content/packs/starter.js';
import { resolveContent } from '../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../src/schemas/runtime/item-instance.js';
import {
  newCharacterId,
  newItemInstanceId,
  newAppliedConditionId,
} from '../../src/ids.js';
import { eventId, isoTimestamp } from '../fixtures/index.js';
import { formatTranscript } from '../transcript.js';
import type { CharacterCreatedEvent } from '../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent, DamageAppliedEvent } from '../../src/schemas/events/combat.js';
import type { AttackRolledEvent } from '../../src/schemas/events/attack.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildMonk = (strikeId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Kai',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'monk', level: 6, hitDiceRemaining: 6 }],
    abilityScores: { STR: 14, DEX: 18, CON: 14, INT: 10, WIS: 16, CHA: 8 },
    hp: { current: 50, max: 50, temp: 0 },
    featsTaken: [],
    inventory: [strikeId],
    equipped: { mainHand: strikeId, attuned: [] },
  });

const buildWardedTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Warded',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 8, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 50, max: 50, temp: 0 },
    featsTaken: [],
  });

describe('golden: Monk L6 Empowered Strikes', () => {
  it("choosing Force damage on an unarmed strike sidesteps Stoneskin's B/P/S resistance", async () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed + 5000) });
      const strike = ItemInstanceSchema.parse({ id: newItemInstanceId(), definitionId: 'unarmed-strike' }) as ItemInstance;
      const kai = buildMonk(strike.id);
      const warded = buildWardedTarget();
      let campaign: Campaign = engine.createCampaign({ name: `empowered-${seed}` });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: strike },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: kai } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: warded } satisfies CharacterCreatedEvent,
        {
          id: eventId(),
          at: isoTimestamp(),
          type: 'ConditionApplied',
          targetId: warded.id,
          conditionId: 'stoneskin-active',
          appliedConditionId: newAppliedConditionId(),
        } satisfies ConditionAppliedEvent,
      ]);

      const attack = engine.plan.attack(campaign.state, {
        attackerId: kai.id,
        targetId: warded.id,
        weaponInstanceId: strike.id,
        unarmedStrikeAsForce: true,
      });
      const rolled = attack.events.find((e): e is AttackRolledEvent => e.type === 'AttackRolled');
      if (rolled?.hit !== true) continue;
      campaign = commit(campaign, attack.events);

      const damage = attack.events.find(
        (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.targetId === warded.id,
      )!;
      expect(damage.components[0]!.type).toBe('force');
      expect(damage.components[0]!.mitigation).toBeUndefined();

      const replayed = replay(campaign.events);
      expect(JSON.stringify(replayed)).toBe(JSON.stringify(campaign.state));
      void throwOnCallRNG();
      expect(() => replay(campaign.events)).not.toThrow();

      await expect(
        formatTranscript(campaign.events, CONTENT, {
          title: 'Empowered Strikes (Monk L6): Force-damage choice sidesteps Stoneskin',
        }),
      ).toMatchFileSnapshot('./transcripts/s207-empowered-strikes.transcript.md');
      return;
    }
    throw new Error('no hit landed in 80 seeds');
  });
});
