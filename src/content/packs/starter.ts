import starterPackJson from './starter-pack.json';
import { loadContentPack, type ContentPack } from '../pack.js';

export const STARTER_PACK_RAW: unknown = starterPackJson;

// Recursively freeze an object graph so accidental in-place mutation throws.
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
};

// Slice 746: `loadContentPack` zod-validates the whole pack (~1.6s), and the
// starter pack is the same static JSON every call. Cache the validated result
// so it's parsed once (per worker under vitest's `isolate: false`) instead of
// once per test file — that per-file validation was the dominant cost of the
// suite. The canonical content pack is immutable, so the cached instance is
// deep-frozen: any accidental in-place mutation throws loudly rather than
// silently leaking across the shared instance.
let cachedStarterPack: ContentPack | undefined;
export const loadStarterPack = (): ContentPack =>
  (cachedStarterPack ??= deepFreeze(loadContentPack(starterPackJson)));
