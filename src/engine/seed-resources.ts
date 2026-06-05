// Slice 675: helper to seed `character.resources` from the
// effective effect stack's `GrantResource` entries.
//
// Closes the slice-660 documented deferral: pre-675 consumers
// manually populated resources (e.g., `resources: [{ resourceId:
// 'rage', current: 2, max: 2, recharge: 'longRest' }]`) when
// building a Barbarian. Slice 675 walks the effect stack for
// `GrantResource` effects and adds matching resources to the
// character, computing `max` via the formula evaluator and copying
// the grant's `recharge` cadence onto `ResourceState.recharge`.
//
// Idempotent: if the character already has a resource with the
// same `resourceId`, the existing entry is kept (no overwrite).
// Consumers who want to RE-seed should reset `character.resources`
// to `[]` first, then call this helper.
//
// Pure transform: returns a new Character; doesn't mutate.

import { produce } from 'immer';
import type { Character } from '../schemas/runtime/character.js';
import { computeTotalLevel } from '../schemas/runtime/character.js';
import type { ResolvedContent } from '../content/pack.js';
import type { Effect } from '../schemas/effects.js';
import type { Formula } from '../schemas/formula.js';
import { collectEffectsFromCharacter } from '../derive/effect-stack.js';
import { evaluateFormula } from '../effects/formula.js';
import { proficiencyBonus } from '../derive/ability.js';

type GrantResourceEffect = Extract<Effect, { kind: 'GrantResource' }>;

export const seedResourcesFromContent = (
  character: Character,
  content: ResolvedContent,
): Character => {
  const effects = collectEffectsFromCharacter({
    character,
    content,
    itemInstances: {},
    pendingChoices: {},
  });
  const grants = effects.filter((e): e is GrantResourceEffect => e.kind === 'GrantResource');
  if (grants.length === 0) return character;

  // Per-resource: take the HIGHEST `max` across multiple grants of
  // the same resourceId (matches the engine's per-feature-id dedupe
  // pattern — the highest-level grant wins). Recharge: take the
  // accompanying grant's recharge.
  const seedByResourceId = new Map<string, { max: number; recharge: GrantResourceEffect['recharge']; diceSize?: number }>();
  for (const grant of grants) {
    let evaluatedMax: number;
    if (typeof grant.max === 'number') {
      evaluatedMax = grant.max;
    } else {
      evaluatedMax = evaluateFormula(grant.max as Formula, {
        abilityScores: character.abilityScores,
        proficiencyBonus: proficiencyBonus(computeTotalLevel(character)),
        classLevels: new Map(character.classes.map((c) => [c.classId, c.level])),
        totalLevel: computeTotalLevel(character),
      });
    }
    const prior = seedByResourceId.get(grant.resourceId);
    if (prior === undefined || evaluatedMax > prior.max) {
      seedByResourceId.set(grant.resourceId, {
        max: evaluatedMax,
        recharge: grant.recharge,
        ...(grant.diceSize !== undefined ? { diceSize: grant.diceSize } : {}),
      });
    }
  }

  return produce(character, (draft) => {
    for (const [resourceId, seed] of seedByResourceId) {
      const existing = draft.resources.find((r) => r.resourceId === resourceId);
      if (existing !== undefined) continue;
      draft.resources.push({
        resourceId,
        current: seed.max,
        max: seed.max,
        recharge: seed.recharge,
        ...(seed.diceSize !== undefined ? { diceSize: seed.diceSize } : {}),
      });
    }
  });
};
