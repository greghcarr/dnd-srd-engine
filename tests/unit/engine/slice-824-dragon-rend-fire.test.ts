// Slice 824: dragon-rend-no-elemental-rider. The Young Red Dragon's Rend
// was missing its RAW +1d6 Fire on-hit rider (every other chromatic
// wyrmling/young Rend was wired). Verifying the SRD caught that the audit's
// "Dragon Rend weapons" (plural) was too broad: in 2024 the CHROMATIC
// dragons carry the Rend elemental rider at all ages, but METALLIC dragons
// gain it only at Adult+ — so the in-scope metallic wyrmling/young Rends
// correctly have NO rider (wiring one would be edition drift). This pins the
// fix and that exact split as a durable guard.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { Event } from '../../../src/schemas/events/index.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();

// The SRD-verified Rend elemental rider per in-pack dragon: the chromatic
// wyrmling + young Rends carry it; the metallic wyrmling + young Rends do
// NOT (only Adult+ metallics do, which are out of scope).
const EXPECT: Record<string, string | null> = {
  'black-dragon-wyrmling-rend': 'acid',
  'blue-dragon-wyrmling-rend': 'lightning',
  'green-dragon-wyrmling-rend': 'poison',
  'red-dragon-wyrmling-rend': 'fire',
  'white-dragon-wyrmling-rend': 'cold',
  'young-white-dragon-rend': 'cold',
  'young-black-dragon-rend': 'acid',
  'young-green-dragon-rend': 'poison',
  'young-blue-dragon-rend': 'lightning',
  'young-red-dragon-rend': 'fire',
  'bronze-dragon-wyrmling-rend': null,
  'silver-dragon-wyrmling-rend': null,
  'gold-dragon-wyrmling-rend': null,
  'young-brass-dragon-rend': null,
  'young-copper-dragon-rend': null,
  'young-bronze-dragon-rend': null,
  'young-silver-dragon-rend': null,
  'young-gold-dragon-rend': null,
};

const elementalRider = (weaponId: string): string | null => {
  const w = PACK.items.find((i) => i.id === weaponId) as { onHit?: Array<{ dice?: string; damageType?: string }> };
  const rider = (w.onHit ?? []).find((r) => r.dice !== undefined && r.damageType !== undefined);
  return rider?.damageType ?? null;
};

describe('dragon Rend elemental riders (slice 824)', () => {
  it('every in-pack dragon Rend carries exactly its RAW elemental rider (metallic young/wyrmling: none)', () => {
    for (const [id, element] of Object.entries(EXPECT)) {
      expect(elementalRider(id), id).toBe(element);
    }
  });

  it("the Young Red Dragon's Rend deals its +1d6 Fire damage on a hit", () => {
    const stat = PACK.monsters.find((m) => m.id === 'young-red-dragon')!;
    for (let seed = 1; seed < 80; seed += 1) {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(seed) });
      const dragon = CharacterSchema.parse({
        id: newCharacterId(), name: 'Young Red Dragon', speciesId: 'human', backgroundId: 'soldier',
        statblockId: 'young-red-dragon', classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: stat.abilityScores, hp: { current: 150, max: 150, temp: 0 },
      });
      const target = CharacterSchema.parse({
        id: newCharacterId(), name: 'Target', speciesId: 'human', backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 10, DEX: 6, CON: 10, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 300, max: 300, temp: 0 }, armorClass: 3,
      });
      const rend = makeItemInstance('young-red-dragon-rend');
      let campaign: Campaign = engine.createCampaign({ name: 'rend' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: rend },
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: dragon } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const events = engine.plan.attack(campaign.state, {
        attackerId: dragon.id, targetId: target.id, weaponInstanceId: rend.id, advantage: 'advantage',
      }).events as ReadonlyArray<Event>;
      const hit = (events.find((e) => e.type === 'AttackRolled') as AttackRolledEvent | undefined)?.hit === true;
      if (!hit) continue;
      const fire = events.some(
        (e): e is DamageAppliedEvent => e.type === 'DamageApplied' && e.components.some((c) => c.type === 'fire'),
      );
      expect(fire).toBe(true);
      return;
    }
    throw new Error('no hitting seed');
  });
});
