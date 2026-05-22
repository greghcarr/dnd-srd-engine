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

## Id-collision policy

Ids share a global namespace per category and packs merge in array order. `resolveContent` (called by `createEngine`) **throws** on any within-pack duplicate id or any cross-pack collision, so a local pack can't silently clobber an SRD entry. To intentionally replace an SRD entry (a houserule), declare its id in your pack's `overrides`:

```jsonc
{ "id": "my-houserules", "overrides": ["fireball"], "spells": [ { "id": "fireball", /* your version */ } ] }
```

Run `validatePacks([starter, yourPack])` while authoring to catch collisions and dangling references early.
