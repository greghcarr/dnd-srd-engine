// Slice 685: shared spatial gates for plan.attack and plan.castSpell.
//
// Both planners enforce RAW range + line-of-sight ONLY when:
//   1. The attacker/caster is a combatant in the active encounter
//      with a `position` set.
//   2. The target is a combatant in the same active encounter with
//      a `position` set.
//   3. The character's location has a map (positionless / map-less
//      encounters skip enforcement, preserving pre-slice-685 behavior).
//
// When any condition fails, the gate is a no-op. Most pre-685 test
// fixtures use positionless encounters; the no-op fallback keeps them
// passing without changes.

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { LocationMap, Door } from '../../schemas/runtime/location.js';
import type { Position } from '../../schemas/runtime/encounter.js';
import { DEFAULT_CELL_SIZE_FEET } from '../../schemas/runtime/location.js';
import {
  chebyshevDistanceFeet,
  hasLineOfSight,
  hasLineOfEffect,
} from '../../derive/terrain.js';
import { feetToCell } from '../../derive/pathing.js';

export interface SpatialContext {
  readonly map: LocationMap;
  readonly doors: ReadonlyArray<Door>;
  readonly fromCell: Position;
  readonly toCell: Position;
  readonly distanceFeet: number;
}

// Resolves the spatial context for an actor + target pair. Returns
// null when ANY precondition for enforcement fails (no positions,
// missing encounter, missing map). Calling planners treat null as
// "skip the spatial gate."
export const resolveSpatialContext = (
  state: CampaignState,
  actorId: string,
  targetId: string,
): SpatialContext | null => {
  const encounterId = state.activeEncounterId;
  if (encounterId === undefined) return null;
  const encounter = state.encounters[encounterId];
  if (encounter === undefined) return null;
  const actor = encounter.combatants.find((c) => c.combatantId === actorId);
  const target = encounter.combatants.find((c) => c.combatantId === targetId);
  if (actor === undefined || target === undefined) return null;
  if (actor.position === undefined || target.position === undefined) return null;
  const locationId = state.characterLocations[actorId];
  if (locationId === undefined) return null;
  const location = state.locations[locationId];
  if (location === undefined) return null;
  const map = location.map;
  if (map === undefined) return null;
  const cellSize = map.cellSizeFeet ?? DEFAULT_CELL_SIZE_FEET;
  const fromCell = feetToCell(actor.position, cellSize);
  const toCell = feetToCell(target.position, cellSize);
  const doors = location.doorIds
    .map((id) => state.doors[id])
    .filter((d): d is NonNullable<typeof d> => d !== undefined);
  const distanceFeet = chebyshevDistanceFeet(fromCell, toCell, cellSize);
  return { map, doors, fromCell, toCell, distanceFeet };
};

// LoS-only assertion for the attack site. Range is already gated by
// the weapon-aware `assertWeaponInRange` helper in attack.ts (which
// honors reach property, rangeNormal/rangeLong, etc.); this only adds
// the LoS check. No-op when the spatial context can't be resolved.
export const assertLineOfSightForAttack = (
  state: CampaignState,
  actorId: string,
  targetId: string,
  attackerName: string,
  weaponLabel: string,
): void => {
  const ctx = resolveSpatialContext(state, actorId, targetId);
  if (ctx === null) return;
  if (!hasLineOfSight(ctx.map, ctx.doors, ctx.fromCell, ctx.toCell)) {
    throw new Error(
      `${attackerName} cannot attack with ${weaponLabel}: line of sight blocked`,
    );
  }
};

// Combined range + LoE gate for spell casting. Caller passes the
// already-parsed range in feet (parseSpellRange handles the string
// → number conversion + sentinel detection). No-op when the spatial
// context can't be resolved.
export const assertWithinSpellRange = (
  state: CampaignState,
  casterId: string,
  targetId: string,
  rangeFeet: number,
  casterName: string,
  spellLabel: string,
): void => {
  const ctx = resolveSpatialContext(state, casterId, targetId);
  if (ctx === null) return;
  if (ctx.distanceFeet > rangeFeet) {
    throw new Error(
      `${casterName} cannot cast ${spellLabel}: target is ${ctx.distanceFeet} ft away (spell range ${rangeFeet} ft)`,
    );
  }
  if (!hasLineOfEffect(ctx.map, ctx.doors, ctx.fromCell, ctx.toCell)) {
    throw new Error(
      `${casterName} cannot cast ${spellLabel}: line of effect blocked`,
    );
  }
};

// Parses a spell's `range` string into one of four shapes:
//   - 'self'       → spell targets only the caster; range gate skipped.
//   - 'touch'      → 5 feet (one melee reach).
//   - 'feet'       → finite feet number.
//   - 'unenforced' → any RAW shape the engine can't gate spatially
//                    ('Special', 'Sight', '1 mile', 'Unlimited').
//                    Consumers handle out-of-band.
export type SpellRangeKind =
  | { kind: 'feet'; feet: number }
  | { kind: 'self' }
  | { kind: 'touch' }
  | { kind: 'unenforced' };

const TOUCH_REACH_FEET = 5;

export const parseSpellRange = (rangeStr: string): SpellRangeKind => {
  const normalized = rangeStr.trim().toLowerCase();
  if (normalized === 'self' || normalized.startsWith('self ')) {
    return { kind: 'self' };
  }
  if (normalized === 'touch') {
    return { kind: 'touch' };
  }
  const feetMatch = normalized.match(/^(\d+)\s*(?:foot|feet|ft)\b/);
  if (feetMatch !== null) {
    return { kind: 'feet', feet: Number(feetMatch[1]) };
  }
  return { kind: 'unenforced' };
};

// Resolves the enforceable range in feet from a parsed SpellRangeKind,
// or undefined when the spell range should not gate spatially (self,
// unenforced).
export const enforceableSpellRangeFeet = (kind: SpellRangeKind): number | undefined => {
  switch (kind.kind) {
    case 'self':
      return undefined;
    case 'unenforced':
      return undefined;
    case 'touch':
      return TOUCH_REACH_FEET;
    case 'feet':
      return kind.feet;
  }
};
