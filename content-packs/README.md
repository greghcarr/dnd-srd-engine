# Local content packs (untracked)

The engine ships **SRD 5.2.1 content only** (the `loadStarterPack()` pack, CC-BY-4.0). Anything outside that scope, the full 2024 PHB / DMG / MM, third-party content, your campaign's homebrew, lives here as **untracked, locally-supplied packs**. Everything in this folder is gitignored except this README; the engine bundles none of it.

This keeps the distributed package purely SRD-derived (see [docs/content-attribution.md](../docs/content-attribution.md)) while letting you run the engine against whatever content you have the rights to use. Authoring or sourcing that content, and confirming you may use it, is the consumer's responsibility.

## Pack shape

A pack is a single JSON object matching `ContentPackSchema` ([src/content/pack.ts](../src/content/pack.ts)). Minimal skeleton:

```jsonc
{
  "id": "my-campaign",
  "name": "My Campaign Content",
  "version": "1.0.0",
  "overrides": [],          // ids this pack intentionally replaces from an earlier-loaded pack
  "spells": [],
  "feats": [],
  "backgrounds": [],
  "conditions": [],
  "items": [],
  "monsters": [],
  "species": [],
  "classes": [],
  "subclasses": []
}
```

The full per-entity field reference and the effect-primitive vocabulary are in [docs/authoring-content-packs.md](../docs/authoring-content-packs.md). The SRD starter pack ([src/content/packs/starter-pack.json](../src/content/packs/starter-pack.json)) is the most complete worked example.

## Loading a local pack

The engine takes an array of packs and merges them. Load the SRD pack first, then your local packs:

```ts
import { readFileSync } from 'node:fs';
import { createEngine, loadStarterPack, loadContentPack, validatePacks } from 'dnd-srd-engine';

const myPack = loadContentPack(JSON.parse(readFileSync('content-packs/my-campaign.json', 'utf8')));

// Recommended: validate before loading (reports every id collision +
// dangling cross-reference at once).
const issues = validatePacks([loadStarterPack(), myPack]);
if (issues.length > 0) throw new Error(JSON.stringify(issues, null, 2));

const engine = createEngine({ contentPacks: [loadStarterPack(), myPack] });
```

## Bundling behavior with the pack (single module)

Most content is data-only and ships as JSON (above). But a pack with **bespoke mechanics** the existing effect-vocabulary can't express needs *code* (an `ActionHandler`), which JSON can't carry. Keep the data and its behavior together as one **`ContentBundle`** in a single module:

```ts
// my-campaign.ts  (one module: data + behavior)
import { loadContentPack, type ContentBundle, type ActionHandler } from 'dnd-srd-engine';
import packJson from './my-campaign.json' assert { type: 'json' }; // portable JSON data
// (or inline the data as an object literal here for a literally-single file)

const arcaneZap: ActionHandler = {
  plan(ctx, params) {
    const { targetId } = params as { targetId: string };
    return [{ id: ctx.newEventId(), at: ctx.at, type: 'DamageApplied',
      targetId: targetId as never, components: [{ amount: ctx.rollExpression('2d6').total, type: 'fire' }] }];
  },
};

export const myCampaign: ContentBundle = {
  pack: loadContentPack(packJson),
  handlers: { action: { 'arcane-zap': arcaneZap } },
};
```

Then the consumer feeds bundles to the engine as single units:

```ts
import { createEngine, loadStarterPack } from 'dnd-srd-engine';
import { myCampaign } from './my-campaign.js';

const engine = createEngine({ bundles: [{ pack: loadStarterPack() }, myCampaign] });
engine.plan.custom(state, { handlerId: 'arcane-zap', params: { targetId } });
```

A bundle's `pack` joins the content; its `handlers` register the behavior. Handler-id collisions across bundles **throw** (mirroring the pack id policy below), so two bundles can't silently clobber each other. Keep the data as a portable JSON import (recommended: still loadable/diffable elsewhere) or inline it in the module for a literally-single file when portability doesn't matter. Handlers run at plan time, consume `ctx.rng`, and bake their rolls into the events they return; see [docs/plugin-api-design.md](../docs/plugin-api-design.md) for the full `HandlerContext` surface and the determinism contract.

## Id-collision policy

Ids share a global namespace per category and packs merge in array order. `resolveContent` (called by `createEngine`) **throws** on any within-pack duplicate id or any cross-pack collision, so a local pack can't silently clobber an SRD entry. To intentionally replace an SRD entry (a houserule), declare its id in your pack's `overrides`:

```jsonc
{ "id": "my-houserules", "overrides": ["fireball"], "spells": [ { "id": "fireball", /* your version */ } ] }
```

Run `validatePacks([starter, yourPack])` while authoring to catch collisions and dangling references early.
