// Slice 749: golden determinism + behavior test for the auto-reaction
// layer. Mirrors s-tactical-movement's discipline over whole fuzz battles:
// the reacting log replays to the same state, two same-seed runs are
// identical (modulo volatile ids/timestamps), the damage-mitigation
// reactions fire on deterministic anchors, and the default reactions:'none'
// path emits none of them.

import { describe, expect, it } from 'vitest';
import { loadStarterPack } from '../../src/starter-pack.js';
import { runBattle } from '../../scripts/combat-fuzz-core.js';
import { replay } from '../../src/engine/replay.js';
import { normalizeEvents } from '../fixtures/index.js';

const STARTER = loadStarterPack();
const LEVEL = 7;
const SEEDS = [1, 2, 7, 10, 12, 14, 16];

const has = (r: ReturnType<typeof runBattle>, type: string): boolean =>
  r.campaign.events.some((e) => e.type === type);

describe('golden: auto reactions (slice 749)', () => {
  it('the reacting event log replays to the same state, every seed', () => {
    for (const seed of SEEDS) {
      for (const teamSize of [1, 2]) {
        const r = runBattle({ seed, pack: STARTER, level: LEVEL, teamSize, reactions: 'auto' });
        expect(
          JSON.stringify(replay(r.campaign.events)),
          `replay mismatch seed=${seed} teamSize=${teamSize}`,
        ).toBe(JSON.stringify(r.campaign.state));
      }
    }
  });

  it('two same-seed reacting runs are identical (normalized)', () => {
    for (const seed of [2, 10, 14]) {
      const a = runBattle({ seed, pack: STARTER, level: LEVEL, teamSize: 1, reactions: 'auto' });
      const b = runBattle({ seed, pack: STARTER, level: LEVEL, teamSize: 1, reactions: 'auto' });
      expect(normalizeEvents(a.campaign.events)).toEqual(normalizeEvents(b.campaign.events));
    }
  });

  it('Uncanny Dodge fires on its deterministic anchor (seed 10, L7, 1v1 PC)', () => {
    const r = runBattle({ seed: 10, pack: STARTER, level: LEVEL, teamSize: 1, vs: 'pc', reactions: 'auto' });
    expect(has(r, 'UncannyDodgeUsed'), 'anchor produced no Uncanny Dodge').toBe(true);
    // The compensating Healed that nets the halved damage must accompany it.
    expect(has(r, 'Healed'), 'Uncanny Dodge emitted no compensating Healed').toBe(true);
  });

  it('Deflect Attacks fires on its deterministic anchor (seed 2, L7, 1v1 PC)', () => {
    const r = runBattle({ seed: 2, pack: STARTER, level: LEVEL, teamSize: 1, vs: 'pc', reactions: 'auto' });
    expect(has(r, 'DeflectAttacksUsed'), 'anchor produced no Deflect Attacks').toBe(true);
  });

  it('default reactions:"none" emits none of the reaction events', () => {
    for (const seed of SEEDS) {
      const r = runBattle({ seed, pack: STARTER, level: LEVEL, teamSize: 2 });
      expect(has(r, 'UncannyDodgeUsed')).toBe(false);
      expect(has(r, 'DeflectAttacksUsed')).toBe(false);
    }
  });
});

// Slice 750: the pre-damage reaction window (Shield + Cutting Words).
describe('golden: pre-damage reactions (slice 750)', () => {
  it('Shield prevents a hit on a deterministic anchor (seed 6, L5, 2v2 PC): no damage to the caster on the shielded swing', () => {
    const r = runBattle({ seed: 6, pack: STARTER, level: 5, teamSize: 2, vs: 'pc', reactions: 'auto' });
    const events = r.campaign.events;
    expect(JSON.stringify(replay(events))).toBe(JSON.stringify(r.campaign.state));
    let preventedAndClean = 0;
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i]!;
      if (e.type !== 'ShieldCast' || (e as { preventedHit?: boolean }).preventedHit !== true) continue;
      const casterId = (e as { casterId: string }).casterId;
      const atkIdx = events.findIndex((x) => x.id === (e as { triggeringAttackEventId: string }).triggeringAttackEventId);
      const damaged = events
        .slice(atkIdx + 1, i)
        .some((x) => x.type === 'DamageApplied' && (x as { targetId: string }).targetId === casterId);
      if (!damaged) preventedAndClean += 1;
    }
    expect(preventedAndClean, 'anchor produced no clean Shield prevention').toBeGreaterThan(0);
  });

  it('Cutting Words fires on a deterministic anchor (seed 7, L3, 2v2 PC): a reaction paired with a Bardic Inspiration spend', () => {
    const events = runBattle({ seed: 7, pack: STARTER, level: 3, teamSize: 2, vs: 'pc', reactions: 'auto' })
      .campaign.events;
    let fired = 0;
    for (let i = 0; i < events.length - 1; i += 1) {
      const a = events[i]!;
      const b = events[i + 1]!;
      if (
        a.type === 'ActionEconomyConsumed'
        && (a as { kind?: string }).kind === 'reaction'
        && b.type === 'ResourceSpent'
        && (b as { resourceId?: string }).resourceId === 'bardic-inspiration'
        && (a as { combatantId: string }).combatantId === (b as { characterId: string }).characterId
      ) {
        fired += 1;
      }
    }
    expect(fired, 'anchor produced no Cutting Words').toBeGreaterThan(0);
  });
});
