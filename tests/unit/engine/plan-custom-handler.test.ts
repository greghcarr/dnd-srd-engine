// Slice 406 - plugin API phase 1: the custom-action seam.
//
// Wires the previously-inert handler registry into a live extension point.
// A consumer registers an ActionHandler under `handlers.action[id]` and
// invokes it via `engine.plan.custom`. The handler runs at PLAN time,
// consumes ctx.rng, and bakes its rolls into the (existing-typed) events it
// returns, so apply()/replay never re-run it. See docs/plugin-api-design.md.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { HANDLER_API_VERSION } from '../../../src/handlers/index.js';
import type { ActionHandler, HandlerContext } from '../../../src/handlers/index.js';
import { seededRNG } from '../../../src/rng/seeded.js';
import { commit, type Campaign } from '../../../src/engine/commit.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';
import { CharacterSchema, type Character } from '../../../src/schemas/runtime/character.js';
import { newCharacterId } from '../../../src/ids.js';
import type { CharacterCreatedEvent } from '../../../src/schemas/events/progression.js';
import type { DamageAppliedEvent } from '../../../src/schemas/events/combat.js';
import { eventId, isoTimestamp } from '../../fixtures/index.js';

const PACK = loadStarterPack();

const buildTarget = (): Character =>
  CharacterSchema.parse({
    id: newCharacterId(), name: 'Dummy', speciesId: 'human', backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    hp: { current: 30, max: 30, temp: 0 },
  });

// A homebrew "arcane zap": 2d6 fire damage, rolled in the handler and baked
// into the emitted DamageApplied. Captures the apiVersion it saw so the test
// can assert the context shape.
let seenApiVersion = -1;
const arcaneZap: ActionHandler = {
  plan(ctx: HandlerContext, params: unknown): readonly DamageAppliedEvent[] {
    seenApiVersion = ctx.apiVersion;
    const { targetId } = params as { targetId: string };
    const roll = ctx.rollExpression('2d6');
    return [
      {
        id: ctx.newEventId(),
        at: ctx.at,
        type: 'DamageApplied',
        targetId: targetId as never,
        components: [{ amount: roll.total, type: 'fire' }],
        source: 'arcane-zap (homebrew plugin)',
      },
    ];
  },
};

const setup = (seed: number): { engine: ReturnType<typeof createEngine>; campaign: Campaign; targetId: string } => {
  const engine = createEngine({
    contentPacks: [PACK],
    rng: seededRNG(seed),
    handlers: { action: { 'arcane-zap': arcaneZap } },
  });
  const target = buildTarget();
  let campaign: Campaign = engine.createCampaign({ name: 'plugin' });
  campaign = commit(campaign, [
    { id: eventId(), at: isoTimestamp(), type: 'CharacterCreated', snapshot: target } satisfies CharacterCreatedEvent,
  ]);
  return { engine, campaign, targetId: target.id };
};

describe('slice 406: engine.plan.custom dispatches to a registered action handler', () => {
  it('invokes the handler, bakes the roll into a DamageApplied, and exposes the API version', () => {
    const { engine, campaign, targetId } = setup(7);
    const { events } = engine.plan.custom(campaign.state, { handlerId: 'arcane-zap', params: { targetId } });
    const dmg = events.find((e): e is DamageAppliedEvent => e.type === 'DamageApplied');
    expect(dmg).toBeDefined();
    const amount = dmg!.components.reduce((s, c) => s + c.amount, 0);
    expect(amount).toBeGreaterThanOrEqual(2);
    expect(amount).toBeLessThanOrEqual(12);
    expect(seenApiVersion).toBe(HANDLER_API_VERSION);
  });

  it('the baked events replay deterministically (handler runs at plan time only)', () => {
    const { engine, campaign, targetId } = setup(7);
    const { events } = engine.plan.custom(campaign.state, { handlerId: 'arcane-zap', params: { targetId } });
    const after = commit(campaign, events);
    // Replaying the committed event stream reproduces the same state without
    // re-running the handler (no RNG at apply time).
    expect(engine.replay(after.events).characters[targetId]!.hp.current)
      .toBe(after.state.characters[targetId]!.hp.current);
    // And it actually dealt the damage.
    expect(after.state.characters[targetId]!.hp.current).toBeLessThan(30);
  });

  it('throws a clear error for an unregistered handlerId', () => {
    const { engine, campaign, targetId } = setup(1);
    expect(() => engine.plan.custom(campaign.state, { handlerId: 'no-such', params: { targetId } }))
      .toThrow(/No custom action handler registered for 'no-such'/);
  });
});
