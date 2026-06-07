// Slice 706: the tactical movement policy moved into the package at
// src/ai/tactical-policy.ts (so the browser can import it without
// depending on scripts/). This module is a thin re-export shim so the
// fuzz harness (move-policy.ts, combat-fuzz-core.ts) and its tests keep
// their existing `scripts/tactical/policy.js` import path unchanged.
export * from '../../src/ai/tactical-policy.js';
