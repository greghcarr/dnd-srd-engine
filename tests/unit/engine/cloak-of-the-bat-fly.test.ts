// Slice 289 — Cloak of the Bat fly-speed Toggle wire.
//
// RAW (SRD 5.2.1): "While wearing this cloak in an area of dim
// light or darkness, you can use a Magic action to gain a Fly
// Speed of 40 feet for 1 hour. The cloak can't be used this way
// again until the next dawn."
//
// Pre-289 the fly-speed arm was deferred (slice 227 row half a
// pending the activate-as-action wire; half b — the bearer.lightLevel
// fact — landed in slice 279; the non-walk speed derive landed in
// slice 288). This slice composes all three: 1 charge / dawn
// recharge, onUse ApplyCondition `cloak-of-the-bat-active`, the
// condition carries ModifySpeed fly 40, getEffectiveFlySpeed
// surfaces the result. The dim-light activation gate stays
// consumer-managed (same shape as Pipes of Haunting's 30-ft
// scope); once applied, the buff persists for the hour.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { resolveContent } from '../../../src/content/pack.js';
import { getEffectiveFlySpeed } from '../../../src/engine/plan/_actor-state.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ConditionAppliedEvent } from '../../../src/schemas/events/combat.js';
import type { ItemUsedEvent } from '../../../src/schemas/events/inventory.js';
import type { ItemChargeConsumedEvent } from '../../../src/schemas/events/charges.js';
import { eventId, isoTimestamp, makeItemInstance } from '../../fixtures/index.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildWearer = (cloakId: string): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Wearer',
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 5, hitDiceRemaining: 5 }],
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 16, WIS: 12, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
    inventory: [cloakId],
    equipped: { attuned: [cloakId] as never },
  });

describe('slice 289: Cloak of the Bat fly-speed Toggle wire', () => {
  it('using the cloak emits ItemChargeConsumed + ConditionApplied(cloak-of-the-bat-active) + ItemUsed', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(289) });
    const cloak = makeItemInstance('cloak-of-the-bat', { chargesRemaining: 1, maxCharges: 1 });
    const wearer = buildWearer(cloak.id);
    let campaign: Campaign = engine.createCampaign({ name: 'cloak-of-the-bat' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: cloak },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wearer } satisfies CharacterCreatedEvent,
    ]);
    const { events } = engine.plan.useItem(campaign.state, {
      characterId: wearer.id,
      instanceId: cloak.id,
    });
    const charge = events.find((e) => e.type === 'ItemChargeConsumed') as ItemChargeConsumedEvent | undefined;
    const condApplied = events.find(
      (e) => e.type === 'ConditionApplied' && (e as ConditionAppliedEvent).conditionId === 'cloak-of-the-bat-active',
    ) as ConditionAppliedEvent | undefined;
    const used = events.find((e) => e.type === 'ItemUsed') as ItemUsedEvent | undefined;
    expect(charge).toBeDefined();
    expect(charge!.amount).toBe(1);
    expect(condApplied).toBeDefined();
    expect(condApplied!.targetId).toBe(wearer.id);
    expect(condApplied!.sourceCharacterId).toBe(wearer.id);
    expect(used).toBeDefined();
  });

  it('after using the cloak, the wearer has fly speed 40 (composes slice 288 non-walk derive + slice 240 Toggle UseAction)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(289) });
    const cloak = makeItemInstance('cloak-of-the-bat', { chargesRemaining: 1, maxCharges: 1 });
    const wearer = buildWearer(cloak.id);
    let campaign: Campaign = engine.createCampaign({ name: 'cloak-of-the-bat-fly' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: cloak },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wearer } satisfies CharacterCreatedEvent,
    ]);
    // Before: no fly speed
    expect(
      getEffectiveFlySpeed({
        character: campaign.state.characters[wearer.id]!,
        content: CONTENT,
        itemInstances: campaign.state.itemInstances,
      }),
    ).toBe(0);
    // Use the cloak
    campaign = commit(
      campaign,
      engine.plan.useItem(campaign.state, {
        characterId: wearer.id,
        instanceId: cloak.id,
      }).events,
    );
    // After: fly speed 40
    expect(
      getEffectiveFlySpeed({
        character: campaign.state.characters[wearer.id]!,
        content: CONTENT,
        itemInstances: campaign.state.itemInstances,
      }),
    ).toBe(40);
  });

  it('after using the cloak, the charge is consumed; second use in the same dawn throws', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(289) });
    const cloak = makeItemInstance('cloak-of-the-bat', { chargesRemaining: 1, maxCharges: 1 });
    const wearer = buildWearer(cloak.id);
    let campaign: Campaign = engine.createCampaign({ name: 'cloak-of-the-bat-charge' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: cloak },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wearer } satisfies CharacterCreatedEvent,
    ]);
    campaign = commit(
      campaign,
      engine.plan.useItem(campaign.state, {
        characterId: wearer.id,
        instanceId: cloak.id,
      }).events,
    );
    expect(campaign.state.itemInstances[cloak.id]!.chargesRemaining).toBe(0);
    expect(() =>
      engine.plan.useItem(campaign.state, {
        characterId: wearer.id,
        instanceId: cloak.id,
      }),
    ).toThrow(/0 charges remaining/);
  });

  it('Stealth advantage arm (slice 279) still works independently of the fly-speed activation', () => {
    // Slice 279 wired the Stealth advantage on the cloak's passive
    // effects array; slice 289 wired the fly speed on onUse. The two
    // arms are independent — the wearer gets the Stealth advantage
    // from the passive effects without activating the cloak. Pin the
    // independence as a regression check.
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(289) });
    const cloak = makeItemInstance('cloak-of-the-bat', { chargesRemaining: 1, maxCharges: 1 });
    const wearer = buildWearer(cloak.id);
    let campaign: Campaign = engine.createCampaign({ name: 'cloak-of-the-bat-stealth' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'ItemAcquired', instance: cloak },
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: wearer } satisfies CharacterCreatedEvent,
    ]);
    // Without activating, the wearer has no cloak-of-the-bat-active
    // condition and therefore no fly speed.
    expect(
      campaign.state.characters[wearer.id]!.appliedConditions.some(
        (c) => c.conditionId === 'cloak-of-the-bat-active',
      ),
    ).toBe(false);
    expect(
      getEffectiveFlySpeed({
        character: campaign.state.characters[wearer.id]!,
        content: CONTENT,
        itemInstances: campaign.state.itemInstances,
      }),
    ).toBe(0);
  });
});
