// Slice 580: Deafened auto-fails ability checks that require hearing.
//
// RAW (SRD 5.2.1 Deafened): "A deafened creature can't hear and
// automatically fails any ability check that requires hearing."
//
// Pre-slice the deafened condition shipped with empty effects — the
// auto-fail arm wasn't enforced anywhere. Slice 580 wires it via:
//   - A new predicate-gated SetAdvantage on the Deafened condition:
//     `{ on: { kind: 'check' }, mode: 'auto-fail', condition: event.sense ==
//     'hearing' }`.
//   - `AbilityCheckResult.hasAutoFail` exposes the flag from the
//     effect stack (mirror of slice 576's SaveResult.hasAutoFail).
//   - `planAbilityCheck` forces `success = false` when the bearer is
//     Deafened AND the consumer supplies `sense: 'hearing'`. Breakdown
//     gains an 'auto-fail' source entry.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { computeAbilityCheck } from '../../../src/derive/ability-check.js';
import { newAppliedConditionId, newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { AbilityCheckRolledEvent } from '../../../src/schemas/events/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildVictim = (deafened: boolean): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Victim',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 20, DEX: 20, CON: 20, INT: 20, WIS: 20, CHA: 20 },
    hp: { current: 50, max: 50, temp: 0 },
    ...(deafened
      ? {
        appliedConditions: [{
          id: newAppliedConditionId(),
          conditionId: 'deafened',
          appliedAt: isoTimestamp(),
        }],
      }
      : {}),
  });

describe('Deafened auto-fail hearing checks (slice 580)', () => {
  describe('pack declaration', () => {
    it('deafened ships with a hearing-gated SetAdvantage auto-fail on checks', () => {
      const cond = PACK.conditions?.find((c) => c.id === 'deafened');
      expect(cond).toBeDefined();
      expect(cond?.effects).toHaveLength(1);
      const setAdv = cond?.effects[0] as {
        kind: string;
        on: { kind: string };
        mode: string;
        condition: { kind: string; path: string; value: string };
      };
      expect(setAdv.kind).toBe('SetAdvantage');
      expect(setAdv.on.kind).toBe('check');
      expect(setAdv.mode).toBe('auto-fail');
      expect(setAdv.condition.path).toBe('event.sense');
      expect(setAdv.condition.value).toBe('hearing');
    });
  });

  describe('derive hasAutoFail', () => {
    it('Deafened bearer + sense=hearing → hasAutoFail = true', () => {
      const r = computeAbilityCheck({
        character: buildVictim(true),
        itemInstances: {},
        content: CONTENT,
        ability: 'WIS',
        sense: 'hearing',
      });
      expect(r.hasAutoFail).toBe(true);
    });

    it('Deafened bearer + sense=sight → hasAutoFail = false (sense-specific gate)', () => {
      const r = computeAbilityCheck({
        character: buildVictim(true),
        itemInstances: {},
        content: CONTENT,
        ability: 'WIS',
        sense: 'sight',
      });
      expect(r.hasAutoFail).toBe(false);
    });

    it('Deafened bearer + no sense supplied → hasAutoFail = false (default)', () => {
      const r = computeAbilityCheck({
        character: buildVictim(true),
        itemInstances: {},
        content: CONTENT,
        ability: 'WIS',
      });
      expect(r.hasAutoFail).toBe(false);
    });

    it('non-Deafened bearer + sense=hearing → hasAutoFail = false', () => {
      const r = computeAbilityCheck({
        character: buildVictim(false),
        itemInstances: {},
        content: CONTENT,
        ability: 'WIS',
        sense: 'hearing',
      });
      expect(r.hasAutoFail).toBe(false);
    });
  });

  describe('planAbilityCheck forces success = false', () => {
    it('Deafened character + sense=hearing + DC fails despite high ability', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const victim = buildVictim(true);
      let campaign = engine.createCampaign({ name: 'deafened-hearing-fail' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      // WIS 20 = +5, L5 prof bonus = +3, no skill = total +5 (no prof on
      // WIS for Fighter — but ability score is 20). DC 5 should pass for
      // a healthy character; Deafened + hearing forces failure.
      const { events } = engine.plan.abilityCheck(campaign.state, {
        characterId: victim.id,
        ability: 'WIS',
        sense: 'hearing',
        dc: 5,
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check).toBeDefined();
      expect(check!.success).toBe(false);
      expect(check!.breakdown?.some((b) => b.source === 'auto-fail')).toBe(true);
    });

    it('Deafened character + sense=sight + DC 5 passes (sense mismatch)', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const victim = buildVictim(true);
      let campaign = engine.createCampaign({ name: 'deafened-sight-pass' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.abilityCheck(campaign.state, {
        characterId: victim.id,
        ability: 'WIS',
        sense: 'sight',
        dc: 5,
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check!.success).toBe(true);
    });

    it('non-Deafened character + sense=hearing + DC 5 passes', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const victim = buildVictim(false);
      let campaign = engine.createCampaign({ name: 'healthy-hearing' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.abilityCheck(campaign.state, {
        characterId: victim.id,
        ability: 'WIS',
        sense: 'hearing',
        dc: 5,
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      expect(check!.success).toBe(true);
    });

    it('Deafened character + sense=hearing + no DC → no success field but still emits with breakdown auto-fail', () => {
      const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
      const victim = buildVictim(true);
      let campaign = engine.createCampaign({ name: 'deafened-no-dc' });
      campaign = commit(campaign, [
        { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: victim } satisfies CharacterCreatedEvent,
      ]);
      const { events } = engine.plan.abilityCheck(campaign.state, {
        characterId: victim.id,
        ability: 'WIS',
        sense: 'hearing',
      });
      const check = events.find((e): e is AbilityCheckRolledEvent =>
        (e as { type: string }).type === 'AbilityCheckRolled');
      // No DC means no success field, but the breakdown still carries
      // the 'auto-fail' annotation for transcript visibility.
      expect(check?.success).toBeUndefined();
      expect(check?.breakdown?.some((b) => b.source === 'auto-fail')).toBe(true);
    });
  });
});
