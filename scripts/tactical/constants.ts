// Slice 706: the tactical tunables moved into the package at
// src/ai/tactical-constants.ts (so the browser can import the policy
// without depending on scripts/). This module is a thin re-export shim so
// the fuzz harness (arena.ts, combat-fuzz-core.ts) and its tests keep
// their existing `scripts/tactical/constants.js` import path unchanged.
export * from '../../src/ai/tactical-constants.js';
