import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Position } from '../../schemas/runtime/encounter.js';
import type { Door } from '../../schemas/runtime/location.js';
import { DEFAULT_CELL_SIZE_FEET } from '../../schemas/runtime/location.js';
import { coveredCells } from '../../derive/aoe.js';
import { feetToCell } from '../../derive/pathing.js';
import { hasLineOfEffect } from '../../derive/terrain.js';
import { parseSpellRange } from './_spatial-gates.js';

const RADIAL_SHAPES = new Set(['sphere', 'cylinder', 'emanation']);

export interface SpellAreaQuery {
  readonly encounterId: string;
  readonly casterId: string;
  readonly spellId: string;
  /**
   * The aimed point, in FEET (the same coordinate space as combatant
   * positions). For a directional shape (Cone/Line/Cube) it fixes the
   * direction; for a placed radial shape (a ranged Sphere/Cylinder, e.g.
   * Fireball) it is the burst centre. Ignored for a Self-origin radial
   * shape / Emanation, which centre on the caster.
   */
  readonly aim: Position;
}

// The canonical "who's in the area" computation. Given a spell with an
// authored `targeting` (shape + size), the caster, and an aim point, returns
// the combatant ids whose cell the template covers AND that have line of
// effect from the point of origin (a creature behind Total Cover inside the
// radius isn't hit). This is the shared rasterizer the [L7 audit] `aoe-shape-
// coverage` blocker calls for: one answer, so consumers stop hand-rolling
// geometry that an expert's template disagrees with.
//
// Lives in the engine layer (not query/) so a planner can use it without the
// engine→query layering inversion: `cast-spell` calls it directly for the
// opt-in `aim` enforcement (slice 787); `query/aoe.ts` re-exports it as the
// public `creaturesInSpellArea` read query.
//
// AoEs hit friend and foe alike (RAW): no allegiance filter — Fireball
// catches your own party.
//
// Returns [] when the spell has no area (`targeting` absent), or when the
// scene isn't positioned (no map, or the caster has no position) — the same
// graceful-degradation seam every spatial query uses.
export const creaturesInSpellArea = (
  state: CampaignState,
  content: ResolvedContent,
  query: SpellAreaQuery,
): string[] => {
  const spell = content.spells.get(query.spellId);
  if (spell?.targeting === undefined) return [];

  const encounter = state.encounters[query.encounterId];
  const caster = encounter?.combatants.find((c) => c.combatantId === query.casterId);
  const locationId = state.characterLocations[query.casterId];
  const map = locationId !== undefined ? state.locations[locationId]?.map : undefined;
  if (encounter === undefined || map === undefined || caster?.position === undefined) return [];

  const cellSize = map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const doors = (state.locations[locationId!]?.doorIds ?? [])
    .map((id) => state.doors[id])
    .filter((d): d is Door => d !== undefined);

  const casterCell = feetToCell(caster.position, cellSize);
  const aimCell = feetToCell(query.aim, cellSize);
  const { shape, size } = spell.targeting;

  // A placed radial shape (ranged Sphere/Cylinder) originates at the aim;
  // a Self radial / Emanation and every directional shape originate at the
  // caster, with the aim fixing direction for the directional ones.
  const radial = RADIAL_SHAPES.has(shape);
  const placed = radial && parseSpellRange(spell.range).kind === 'feet';
  const origin = placed ? aimCell : casterCell;
  const aim = radial ? undefined : aimCell;

  const cells = coveredCells({ shape, sizeFeet: size, origin, aim, cellSizeFeet: cellSize });
  const covered = new Set(cells.map((c) => `${c.x},${c.y}`));

  const hits: string[] = [];
  for (const combatant of encounter.combatants) {
    if (combatant.position === undefined) continue;
    const cell = feetToCell(combatant.position, cellSize);
    if (!covered.has(`${cell.x},${cell.y}`)) continue;
    if (!hasLineOfEffect(map, doors, origin, cell)) continue;
    hits.push(combatant.combatantId);
  }
  hits.sort();
  return hits;
};
