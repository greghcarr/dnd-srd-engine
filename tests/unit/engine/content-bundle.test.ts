// Slice 409 - ContentBundle: a pack + its handlers as one unit.
//
// Lets a consumer author a pack and its bespoke-mechanic handlers in a
// single module and feed it to the engine as one input
// (createEngine({ bundles: [...] })) instead of threading contentPacks and
// handlers separately. Handler-id collisions across bundles throw, mirroring
// the pack id-collision policy. See docs/plugin-api-design.md.
import { describe, expect, it } from 'vitest';
import { createEngine } from '../../../src/engine/index.js';
import { mergeHandlerRegistries, type ActionHandler, type ContentBundle } from '../../../src/handlers/index.js';
import { loadContentPack } from '../../../src/content/pack.js';
import { loadStarterPack } from '../../../src/content/packs/starter.js';

const miniPack = (id: string) => loadContentPack({ id, name: id, version: '0.0.1' });

let zapCalls = 0;
const zap: ActionHandler = { plan() { zapCalls += 1; return []; } };

describe('slice 409: ContentBundle feeds pack + handlers to createEngine as one unit', () => {
  it('a bundle joins its pack to content and registers its handlers', () => {
    zapCalls = 0;
    const homebrew: ContentBundle = { pack: miniPack('homebrew'), handlers: { action: { zap } } };
    const engine = createEngine({ bundles: [{ pack: loadStarterPack() }, homebrew] });
    // Bundle pack merged into content (the SRD bundle's classes are present).
    expect(engine.content.classes.size).toBeGreaterThanOrEqual(12);
    // Bundle handler is live.
    const campaign = engine.createCampaign({ name: 'b' });
    engine.plan.custom(campaign.state, { handlerId: 'zap' });
    expect(zapCalls).toBe(1);
  });

  it('opts.handlers and bundle handlers both register (merged)', () => {
    zapCalls = 0;
    let bonkCalls = 0;
    const bonk: ActionHandler = { plan() { bonkCalls += 1; return []; } };
    const engine = createEngine({
      contentPacks: [loadStarterPack()],
      bundles: [{ pack: miniPack('hb'), handlers: { action: { zap } } }],
      handlers: { action: { bonk } },
    });
    const c = engine.createCampaign({ name: 'm' });
    engine.plan.custom(c.state, { handlerId: 'zap' });
    engine.plan.custom(c.state, { handlerId: 'bonk' });
    expect(zapCalls).toBe(1);
    expect(bonkCalls).toBe(1);
  });

  it('throws on a handlerId collision across bundles', () => {
    expect(() =>
      createEngine({
        bundles: [
          { pack: miniPack('a'), handlers: { action: { zap } } },
          { pack: miniPack('b'), handlers: { action: { zap } } },
        ],
      }),
    ).toThrow(/Duplicate action handler 'zap'/);
  });

  it('still throws on a cross-bundle entry-id collision (slice-400 policy)', () => {
    const packWithCond = (packId: string) =>
      loadContentPack({ id: packId, name: packId, version: '0.0.1', conditions: [{ id: 'shared', name: 'Shared' }] });
    expect(() =>
      createEngine({ bundles: [{ pack: packWithCond('a') }, { pack: packWithCond('b') }] }),
    ).toThrow(/"shared".*collides with pack "a"/);
  });
});

describe('slice 409: mergeHandlerRegistries', () => {
  it('merges distinct registries and throws on a duplicate id', () => {
    const a: ActionHandler = { plan: () => [] };
    const b: ActionHandler = { plan: () => [] };
    const merged = mergeHandlerRegistries([{ action: { a } }, { action: { b } }, undefined]);
    expect(Object.keys(merged.action ?? {}).sort()).toEqual(['a', 'b']);
    expect(() => mergeHandlerRegistries([{ action: { a } }, { action: { a } }])).toThrow(/Duplicate action handler 'a'/);
  });
});
