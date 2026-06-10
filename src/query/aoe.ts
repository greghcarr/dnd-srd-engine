// The public `creaturesInSpellArea` read query — the canonical AoE
// rasterizer ("who's in the cone/sphere/line/cube/cylinder/emanation?").
//
// The implementation lives in the engine layer (`engine/plan/_spell-area.ts`)
// so a planner can call it without an engine→query layering inversion
// (cast-spell's slice-787 `aim` enforcement uses it directly). This module is
// the read-layer re-export, surfaced on the query barrel + `engine.query`.
export { creaturesInSpellArea, type SpellAreaQuery } from '../engine/plan/_spell-area.js';
