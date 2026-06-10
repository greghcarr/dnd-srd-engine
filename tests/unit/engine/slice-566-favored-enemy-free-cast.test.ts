// Slice 566: Favored Enemy Hunter's Mark always-prepared + pool-based
// free-cast resource wiring.
//
// RAW (SRD 5.2.1 Ranger L1, Favored Enemy): "You always have the
// Hunter's Mark spell prepared. You can cast it twice without
// expending a spell slot, and you regain all expended uses of this
// ability when you finish a Long Rest."
//
// Pre-slice the pack granted the `hunters-mark` resource (max=2 at
// L1, bumped to 3/4/5/6 at L5/9/13/17) but two RAW arms were
// unwired:
//   1. Hunter's Mark wasn't granted as always-prepared, so the spell
//      was castable only by a Ranger who happened to have it in
//      preparedSpells.
//   2. The `hunters-mark` resource was inert — no engine path
//      consumed it on a Hunter's Mark cast. A `useFreeCast: true`
//      intent on the spell errored because the only free-cast path
//      was `preparation: 'oncePerLongRest'` (slice 486), and Favored
//      Enemy is N-per-LR, not 1-per-LR.
//
// This slice closes both by:
//   (a) Adding `GrantSpell { spellId: 'hunters-mark', preparation:
//       'always-prepared', spellcastingAbility: 'WIS',
//       freeCastResourceId: 'hunters-mark' }` to Favored Enemy L1.
//   (b) Extending the cast-spell `useFreeCast` block to recognize
//       pool-based grants (`freeCastResourceId !== undefined`),
//       validating the named resource has uses remaining, and
//       emitting `ResourceSpent` (amount: 1) on the matched cast
//       instead of `FreeCastUsed`. The slot is bypassed either way.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import { buildEffectStack } from '../../../src/derive/effect-stack.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import type {
  SpellSlotConsumedEvent,
  FreeCastUsedEvent,
} from '../../../src/schemas/events/spellcasting.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildRanger = (level = 1): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Ranger',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'ranger', level, hitDiceRemaining: level }],
    abilityScores: { STR: 12, DEX: 14, CON: 12, INT: 10, WIS: 16, CHA: 10 },
    hp: { current: 11, max: 11, temp: 0 },
    resources: [
      { resourceId: 'hunters-mark', current: 2, max: 2 },
    ],
  });

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Target',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

describe("Favored Enemy Hunter's Mark free-cast wiring (slice 566)", () => {
  describe('pack declaration', () => {
    it('Favored Enemy L1 grants Hunter\'s Mark always-prepared with freeCastResourceId=hunters-mark', () => {
      const ranger = PACK.classes?.find((c) => c.id === 'ranger');
      expect(ranger).toBeDefined();
      const l1 = ranger!.levelTable['1'];
      expect(l1).toBeDefined();
      const fe = l1!.features.find((f) => f.id === 'favored-enemy');
      expect(fe).toBeDefined();
      const grantSpell = fe!.effects.find(
        (e) => e.kind === 'GrantSpell'
          && (e as { spellId?: string }).spellId === 'hunters-mark',
      ) as
        | { spellId: string; preparation: string; spellcastingAbility?: string; freeCastResourceId?: string }
        | undefined;
      expect(grantSpell, 'Favored Enemy should grant hunters-mark').toBeDefined();
      expect(grantSpell!.preparation).toBe('always-prepared');
      expect(grantSpell!.spellcastingAbility).toBe('WIS');
      expect(grantSpell!.freeCastResourceId).toBe('hunters-mark');
    });

    it('Favored Enemy L1 grants the hunters-mark resource max=2 longRest', () => {
      const ranger = PACK.classes?.find((c) => c.id === 'ranger');
      const fe = ranger!.levelTable['1']!.features.find((f) => f.id === 'favored-enemy');
      const grantRes = fe!.effects.find(
        (e) => e.kind === 'GrantResource'
          && (e as { resourceId?: string }).resourceId === 'hunters-mark',
      ) as { resourceId: string; max: number; recharge: string } | undefined;
      expect(grantRes).toBeDefined();
      expect(grantRes!.max).toBe(2);
      expect(grantRes!.recharge).toBe('longRest');
    });
  });

  describe('effect-stack projection', () => {
    it('L1 Ranger has hunters-mark in grantedSpells via the effect stack', () => {
      const ranger = buildRanger();
      const effects = buildEffectStack({
        character: ranger,
        content: CONTENT,
        itemInstances: {},
      });
      const hm = effects.grantedSpells().find((g) => g.spellId === 'hunters-mark');
      expect(hm, "hunters-mark should appear in the Ranger's granted spells").toBeDefined();
      expect(hm!.preparation).toBe('always-prepared');
      expect(hm!.freeCastResourceId).toBe('hunters-mark');
    });
  });

  describe('useFreeCast consumes the resource (pool path), not a slot', () => {
    it('first useFreeCast emits ResourceSpent { hunters-mark, 1 } and NO SpellSlotConsumed', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const ranger = buildRanger();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'fe-hm-free' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: ranger.id,
        spellId: 'hunters-mark',
        slotLevel: 1,
        targetIds: [target.id],
        useFreeCast: true,
      });
      const resourceSpent = events.find((e): e is ResourceSpentEvent =>
        (e as { type: string }).type === 'ResourceSpent');
      expect(resourceSpent).toBeDefined();
      expect(resourceSpent!.resourceId).toBe('hunters-mark');
      expect(resourceSpent!.amount).toBe(1);
      const slotConsumed = events.find((e): e is SpellSlotConsumedEvent =>
        (e as { type: string }).type === 'SpellSlotConsumed');
      expect(slotConsumed, 'pool path bypasses the slot').toBeUndefined();
      // And no FreeCastUsed either — pool path replaces it.
      const freeCastUsed = events.find((e): e is FreeCastUsedEvent =>
        (e as { type: string }).type === 'FreeCastUsed');
      expect(freeCastUsed, 'pool path emits ResourceSpent, not FreeCastUsed').toBeUndefined();
    });

    it('after the 2 free casts, the third useFreeCast throws (resource depleted)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(2) });
      const ranger = buildRanger();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'fe-hm-deplete' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      campaign = commit(
        campaign,
        engine.plan.castSpell(campaign.state, {
          characterId: ranger.id,
          spellId: 'hunters-mark',
          slotLevel: 1,
          targetIds: [target.id],
          useFreeCast: true,
        }).events,
      );
      expect(campaign.state.characters[ranger.id]!.resources.find((r) => r.resourceId === 'hunters-mark')!.current).toBe(1);
      campaign = commit(
        campaign,
        engine.plan.castSpell(campaign.state, {
          characterId: ranger.id,
          spellId: 'hunters-mark',
          slotLevel: 1,
          targetIds: [target.id],
          useFreeCast: true,
        }).events,
      );
      expect(campaign.state.characters[ranger.id]!.resources.find((r) => r.resourceId === 'hunters-mark')!.current).toBe(0);
      expect(() =>
        engine.plan.castSpell(campaign.state, {
          characterId: ranger.id,
          spellId: 'hunters-mark',
          slotLevel: 1,
          targetIds: [target.id],
          useFreeCast: true,
        }),
      ).toThrow(/hunters-mark.*depleted|depleted.*hunters-mark/i);
    });
  });

  describe('cast without useFreeCast uses a slot (existing path)', () => {
    it('useFreeCast=false (default) consumes a spell slot, NOT the hunters-mark resource', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(3) });
      const ranger = buildRanger();
      const target = buildTarget();
      let campaign = engine.createCampaign({ name: 'fe-hm-slot' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.castSpell(campaign.state, {
        characterId: ranger.id,
        spellId: 'hunters-mark',
        slotLevel: 1,
        targetIds: [target.id],
      });
      const slotConsumed = events.find((e): e is SpellSlotConsumedEvent =>
        (e as { type: string }).type === 'SpellSlotConsumed');
      expect(slotConsumed, 'default path consumes a slot').toBeDefined();
      const resourceSpent = events.find((e): e is ResourceSpentEvent =>
        (e as { type: string }).type === 'ResourceSpent');
      expect(resourceSpent, 'default path does NOT touch the hunters-mark resource').toBeUndefined();
    });
  });

  describe('useFreeCast on a spell without a free-cast grant still throws', () => {
    it('useFreeCast=true on a prepared spell with no free-cast grant throws "no oncePerLongRest or pool-based grant"', () => {
      // A Ranger who additionally prepared Cure Wounds (it's on the
      // Ranger spell list) — passes the prep gate so the useFreeCast
      // gate is the one that fires. Cure Wounds has no oncePerLongRest
      // grant and no pool grant, so the slice 486 + 566 path throws.
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(4) });
      const ranger = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Ranger',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'ranger', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 12, DEX: 14, CON: 12, INT: 10, WIS: 16, CHA: 10 },
        hp: { current: 11, max: 11, temp: 0 },
        resources: [{ resourceId: 'hunters-mark', current: 2, max: 2 }],
        preparedSpells: ['cure-wounds'],
      });
      let campaign = engine.createCampaign({ name: 'fe-no-grant' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: ranger } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.castSpell(campaign.state, {
          characterId: ranger.id,
          spellId: 'cure-wounds',
          slotLevel: 1,
          targetIds: [ranger.id],
          useFreeCast: true,
        }),
      ).toThrow(/no oncePerLongRest, per-day, or pool-based grant/i);
    });
  });
});
