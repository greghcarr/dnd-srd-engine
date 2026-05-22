import extrasPackJson from './phb-2024-extras.json';
import { loadContentPack, type ContentPack } from '../pack.js';

// The non-SRD companion to the starter pack: 2024 PHB / XGE / TCE
// backgrounds, feats, and spells whose names fall outside the SRD 5.2.1
// CC-BY-4.0 envelope. Kept separate so `loadStarterPack()` stays purely
// SRD-derived (and 100% drift-audited). Load alongside the starter pack
// when you want the broader character-creation surface:
// `createEngine({ contentPacks: [loadStarterPack(), loadPhbExtrasPack()] })`.
// See docs/content-attribution.md for the per-entry rationale.
export const PHB_EXTRAS_PACK_RAW: unknown = extrasPackJson;

export const loadPhbExtrasPack = (): ContentPack => loadContentPack(extrasPackJson);
