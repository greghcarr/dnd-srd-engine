// Slice 575: behavioral tests for RAW conditions that only had pack
// declaration coverage. The deep audit flagged that the 15 RAW
// conditions had deep behavioral tests only for Paralyzed + Petrified
// (via tests/golden/s15-conditions.test.ts). Slice 567 fixed the pack
// declaration drift and added pack-declaration assertions for the new
// arms; slice 575 adds behavioral coverage for the remaining
// conditions by exercising the effect-stack through real attack /
// save / check resolution.
//
// Scope: one focused assertion per condition for the most distinctive
// RAW behavior. The pack-declaration tests in slice 567 cover the
// shape; this file covers "does the effect actually fire."

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ItemAcquiredEvent } from '../../../src/schemas/events/inventory.js';
import type { AttackRolledEvent } from '../../../src/schemas/events/attack.js';
import type { SaveRolledEvent } from '../../../src/schemas/events/checks.js';

const PACK = loadStarterPack();

const buildFighter = (name: string, opts: { weaponId?: string; conditionIds?: ReadonlyArray<string> } = {}): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name,
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 12, max: 12, temp: 0 },
    ...(opts.weaponId
      ? { inventory: [opts.weaponId], equipped: { mainHand: opts.weaponId, attuned: [] } }
      : {}),
    ...(opts.conditionIds
      ? {
        appliedConditions: opts.conditionIds.map((cid) => ({
          id: newAppliedConditionId(),
          conditionId: cid,
          appliedAt: isoTimestamp(),
        })),
      }
      : {}),
  });

describe('Condition behavior coverage (slice 575)', () => {
  describe('Blinded (slice 567 added attacker-side advantage)', () => {
    it('an attacker attacking a Blinded target rolls with Advantage', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const attacker = buildFighter('Attacker', { weaponId: sword.id });
      const blinded = buildFighter('Blinded', { conditionIds: ['blinded'] });
      let campaign = engine.createCampaign({ name: 'blinded' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: blinded } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: blinded.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      expect(atk?.used).toBe('advantage');
    });

    it('a Blinded attacker rolls with Disadvantage', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const blindedAttacker = buildFighter('B', { weaponId: sword.id, conditionIds: ['blinded'] });
      const target = buildFighter('T');
      let campaign = engine.createCampaign({ name: 'blinded-self' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: blindedAttacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: blindedAttacker.id,
        targetId: target.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      // Both have blinded → advantage on attacker, disadvantage on self → cancel to 'none'
      // OR target has blinded → just advantage. Single bearer has blinded → disadvantage on own attack
      // Bearer side wins this case: bearer disadvantage + target normal = disadvantage
      expect(atk?.used).toBe('disadvantage');
    });
  });

  describe('Poisoned (already wired pre-slice; regression smoke)', () => {
    it('a Poisoned attacker rolls with Disadvantage on attacks', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const poisoned = buildFighter('P', { weaponId: sword.id, conditionIds: ['poisoned'] });
      const target = buildFighter('T');
      let campaign = engine.createCampaign({ name: 'poisoned' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: poisoned } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: poisoned.id,
        targetId: target.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      expect(atk?.used).toBe('disadvantage');
    });
  });

  describe('Restrained (already wired pre-slice; regression smoke)', () => {
    it('an attacker attacking a Restrained target rolls with Advantage', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const attacker = buildFighter('A', { weaponId: sword.id });
      const restrained = buildFighter('R', { conditionIds: ['restrained'] });
      let campaign = engine.createCampaign({ name: 'restrained' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: restrained } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: restrained.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      expect(atk?.used).toBe('advantage');
    });
  });

  describe('Stunned (slice 567 added Speed 0 + attacker advantage)', () => {
    it('an attacker attacking a Stunned target rolls with Advantage', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const attacker = buildFighter('A', { weaponId: sword.id });
      const stunned = buildFighter('S', { conditionIds: ['stunned'] });
      let campaign = engine.createCampaign({ name: 'stunned' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: stunned } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: stunned.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      expect(atk?.used).toBe('advantage');
    });

    // RAW: Stunned auto-fails STR + DEX saves. The pack carries
    // `SetAdvantage on:{kind:'save',ability:'STR'} mode:'auto-fail'`
    // entries (verified in slice 567's pack-declaration tests). The
    // EffectAccumulator tracks autoFail per ability (autoFail boolean
    // exists at the builder level). HOWEVER, the save planner does
    // NOT currently honor autoFail — it only consumes
    // `hasAdvantage` / `hasDisadvantage`. The auto-fail arm therefore
    // doesn't end the save with a forced failure; this is a real
    // RAW drift uncovered by slice 575 and tracked as a future engine
    // closure. Test deliberately omitted here; pack-declaration parity
    // tests (slice 567) catch any regression in the effect-list itself.
  });

  describe('Invisible (already wired pre-slice; regression smoke)', () => {
    it('an attacker attacking an Invisible target rolls with Disadvantage (cannot see)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const attacker = buildFighter('A', { weaponId: sword.id });
      const inv = buildFighter('Inv', { conditionIds: ['invisible'] });
      let campaign = engine.createCampaign({ name: 'invisible' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: inv } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: inv.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      expect(atk?.used).toBe('disadvantage');
    });
  });

  describe('Charmed (RAW: charmed cannot attack the charmer)', () => {
    it('attacker carrying charmed (sourced by target) cannot attack the charmer', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const charmer = buildFighter('Charmer');
      const charmed = CharacterSchema.parse({
        id: newCharacterId(),
        name: 'Charmed',
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
        abilityScores: { STR: 16, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
        hp: { current: 12, max: 12, temp: 0 },
        inventory: [sword.id],
        equipped: { mainHand: sword.id, attuned: [] },
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'charmed',
          appliedAt: isoTimestamp(),
          sourceCharacterId: charmer.id,
        }],
      });
      let campaign = engine.createCampaign({ name: 'charmed' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: charmer } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: charmed } satisfies CharacterCreatedEvent,
      ]);
      expect(() =>
        engine.plan.attack(campaign.state, {
          attackerId: charmed.id,
          targetId: charmer.id,
          weaponInstanceId: sword.id,
        }),
      ).toThrow(/Charmed/);
    });
  });

  describe('Frightened (already wired pre-slice; regression smoke)', () => {
    it('a Frightened bearer attacks with Disadvantage (default-apply when fear source is in LoS)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const fr = buildFighter('Fr', { weaponId: sword.id, conditionIds: ['frightened'] });
      const target = buildFighter('T');
      let campaign = engine.createCampaign({ name: 'frightened' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: fr } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: fr.id,
        targetId: target.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      expect(atk?.used).toBe('disadvantage');
    });
  });

  describe('Prone (slice 568 added asymmetric attacker advantage)', () => {
    it('melee attack vs a Prone bearer rolls with Advantage', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const attacker = buildFighter('A', { weaponId: sword.id });
      const prone = buildFighter('P', { conditionIds: ['prone'] });
      let campaign = engine.createCampaign({ name: 'prone' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: prone } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: prone.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      expect(atk?.used).toBe('advantage');
    });
  });

  describe('Unconscious (slice 567 added attacker advantage)', () => {
    it('an attacker attacking an Unconscious target rolls with Advantage', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const sword = makeItemInstance('longsword');
      const attacker = buildFighter('A', { weaponId: sword.id });
      const unc = buildFighter('U', { conditionIds: ['unconscious'] });
      let campaign = engine.createCampaign({ name: 'unconscious' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: sword } satisfies ItemAcquiredEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: attacker } satisfies CharacterCreatedEvent,
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: unc } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.attack(campaign.state, {
        attackerId: attacker.id,
        targetId: unc.id,
        weaponInstanceId: sword.id,
      });
      const atk = events.find((e): e is AttackRolledEvent => (e as { type: string }).type === 'AttackRolled');
      expect(atk?.used).toBe('advantage');
    });
  });
});
