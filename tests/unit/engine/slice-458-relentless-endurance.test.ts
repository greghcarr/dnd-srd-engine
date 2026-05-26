// Slice 458: Orc Relentless Endurance species trait.
//
// RAW (SRD 5.2.1 Orc species): "Relentless Endurance. When you are
// reduced to 0 Hit Points but not killed outright, you can drop to 1
// Hit Point instead. Once you use this trait, you can't do so again
// until you finish a Long Rest."
//
// Wired via new PreventFatalDamageConsumingResource effect kind +
// GrantResource on the Orc species traits. interceptFatalDamage:
// if HP would land <= 0 and the bearer has at least 1 of
// `relentless-endurance` resource, scale damage to land HP at 1 and
// emit ResourceSpent. The trait persists (species-built-in); the per-
// long-rest semantic comes from the resource's recharge cadence.

import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { ResourceSpentEvent } from '../../../src/schemas/events/resources.js';
import { resolveContent } from '../../../src/content/pack.js';
import { interceptFatalDamage } from '../../../src/derive/fatal-damage-intercept.js';

const PACK = loadStarterPack();
const CONTENT = resolveContent([PACK]);

const buildOrc = (currentHp: number, relentlessRemaining = 1): Character =>
  CharacterSchema.parse({
    id: newCharacterId(),
    name: 'Grug',
    speciesId: 'orc',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    hp: { current: currentHp, max: 12, temp: 0 },
    resources: [{ resourceId: 'relentless-endurance', current: relentlessRemaining, max: 1 }],
  });

const setupOrc = (currentHp: number, relentlessRemaining = 1): { campaign: Campaign; orcId: string } => {
  const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
  const orc = buildOrc(currentHp, relentlessRemaining);
  let campaign = engine.createCampaign({ name: 'relentless' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: orc } satisfies CharacterCreatedEvent,
  ]);
  return { campaign, orcId: orc.id };
};

describe('Orc Relentless Endurance (slice 458)', () => {
  it('fatal damage to a fresh orc: drops to 1 HP, resource consumed', () => {
    const { campaign, orcId } = setupOrc(5); // orc at 5 HP, resource current=1
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: orcId,
      mitigatedComponents: [{ amount: 8, type: 'slashing' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
    });
    // Damage scaled to 4 (so 5 - 4 = 1 HP).
    expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(4);
    const spent = out.extraEvents.find((e) => e.type === 'ResourceSpent') as ResourceSpentEvent | undefined;
    expect(spent).toBeDefined();
    expect(spent!.resourceId).toBe('relentless-endurance');
    expect(spent!.amount).toBe(1);
  });

  it('orc with depleted resource: damage passes through unscaled', () => {
    const { campaign, orcId } = setupOrc(5, 0); // resource already at 0
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: orcId,
      mitigatedComponents: [{ amount: 8, type: 'slashing' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
    });
    expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(8); // unscaled
    expect(out.extraEvents.find((e) => e.type === 'ResourceSpent')).toBeUndefined();
  });

  it('non-fatal damage to an orc: no intercept, resource untouched', () => {
    const { campaign, orcId } = setupOrc(12); // full HP
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: orcId,
      mitigatedComponents: [{ amount: 4, type: 'slashing' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
    });
    expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(4); // passthrough
    expect(out.extraEvents.find((e) => e.type === 'ResourceSpent')).toBeUndefined();
  });

  it('after the resource is consumed and committed, a second fatal hit passes through (orc dies)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const orc = buildOrc(5);
    let campaign = engine.createCampaign({ name: 'second-hit' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: orc } satisfies CharacterCreatedEvent,
    ]);
    // First fatal hit: drops to 1 via Relentless Endurance.
    const first = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: orc.id,
      mitigatedComponents: [{ amount: 8, type: 'slashing' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
    });
    const resourceSpent = first.extraEvents.find((e) => e.type === 'ResourceSpent') as ResourceSpentEvent;
    expect(resourceSpent).toBeDefined();
    // Commit a DamageApplied + the ResourceSpent to mutate state.
    campaign = commit(campaign, [
      {
        id: eventId(),
        at: isoTimestamp(),
        type: 'DamageApplied',
        targetId: orc.id,
        components: first.components,
      },
      resourceSpent,
    ]);
    // Orc now at 1 HP, resource depleted (current = 0).
    const orcAfterFirst = campaign.state.characters[orc.id]!;
    expect(orcAfterFirst.hp.current).toBe(1);
    expect(orcAfterFirst.resources.find((r) => r.resourceId === 'relentless-endurance')!.current).toBe(0);
    // Second hit: no intercept (resource depleted), damage passes through.
    const second = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: orc.id,
      mitigatedComponents: [{ amount: 5, type: 'slashing' }],
      causedByEventId: 'e2',
      at: isoTimestamp(),
    });
    expect(second.components.reduce((s, c) => s + c.amount, 0)).toBe(5);
    expect(second.extraEvents.find((e) => e.type === 'ResourceSpent')).toBeUndefined();
  });

  it('control: non-orc character (Human) with the resource manually granted has no intercept (the trait is on the orc species, not the resource)', () => {
    const engine = createEngine({ contentPacks: [PACK], rng: seededRNG(1) });
    const human = CharacterSchema.parse({
      id: newCharacterId(),
      name: 'Alex',
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
      abilityScores: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
      hp: { current: 5, max: 12, temp: 0 },
      resources: [{ resourceId: 'relentless-endurance', current: 1, max: 1 }],
    });
    let campaign = engine.createCampaign({ name: 'control' });
    campaign = commit(campaign, [
      { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: human } satisfies CharacterCreatedEvent,
    ]);
    const out = interceptFatalDamage({
      state: campaign.state,
      content: CONTENT,
      targetId: human.id,
      mitigatedComponents: [{ amount: 8, type: 'slashing' }],
      causedByEventId: 'e1',
      at: isoTimestamp(),
    });
    expect(out.components.reduce((s, c) => s + c.amount, 0)).toBe(8); // passthrough, human dies
    expect(out.extraEvents.find((e) => e.type === 'ResourceSpent')).toBeUndefined();
  });
});
