import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { ActionEconomyConsumedEvent } from '../../schemas/events/action-economy.js';
import type { CombatantMovedEvent } from '../../schemas/events/movement.js';
import type { Position } from '../../schemas/runtime/encounter.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import { chebyshevDistance } from './movement.js';
import { buildEffectStack } from '../../derive/effect-stack.js';
import type { ULID } from '../ids-utils.js';

const TREE_STRIDE_RANGE_FEET = 60;

export interface TreeStrideIntent {
  readonly type: 'TreeStride';
  readonly casterId: string;
  readonly to: Position;
  readonly at?: string;
}

// Slice 820: the Dryad's Tree Stride Bonus Action.
//
// RAW (SRD 5.2.1 Dryad): "If within 5 feet of a Large or bigger tree, the
// dryad teleports to an unoccupied space within 5 feet of a second Large or
// bigger tree that is within 60 feet of the previous tree."
//
// The trees are TERRAIN the engine doesn't model (it tracks positions;
// terrain features are consumer-managed — docs/engine-scope.md), so the two
// "within 5 ft of a Large+ tree" constraints are consumer-validated. The
// engine enforces the parts it owns: the bearer has Tree Stride
// (`GrantTreeStride`), it's their turn with a Bonus Action free, the
// destination is within 60 ft (Chebyshev, matching planMistyStep) and
// unoccupied. No resource — Tree Stride is at-will given suitable trees.
// Emits ActionEconomyConsumed(bonusAction) + CombatantMoved (teleport,
// feetTraveled 0 so it doesn't drain normal movement).
export const planTreeStride = (
  state: CampaignState,
  content: ResolvedContent,
  intent: TreeStrideIntent,
): ReadonlyArray<Event> => {
  const caster = state.characters[intent.casterId];
  if (!caster) throw new Error(`Unknown character ${intent.casterId}`);
  const hasTreeStride = buildEffectStack({
    character: caster,
    content,
    itemInstances: state.itemInstances,
    pendingChoices: state.pendingChoices,
  }).hasTreeStride();
  if (!hasTreeStride) {
    throw new Error(`${caster.name} does not have Tree Stride`);
  }

  const activeEncounterId = state.activeEncounterId;
  if (activeEncounterId === undefined) {
    throw new Error('Tree Stride can only be used in an active encounter');
  }
  const encounter = state.encounters[activeEncounterId];
  const active = encounter?.combatants[encounter.activeIndex];
  if (!active || active.combatantId !== intent.casterId) {
    throw new Error(`${caster.name} is not the active combatant`);
  }
  if (active.turnUsage.bonusActionUsed) {
    throw new Error(`${caster.name} has already used their bonus action this turn`);
  }
  if (active.position === undefined) {
    throw new Error('Combatant has no position set');
  }
  const distance = chebyshevDistance(active.position, intent.to);
  if (distance > TREE_STRIDE_RANGE_FEET) {
    throw new Error(`Tree Stride destination is ${distance}ft away (max ${TREE_STRIDE_RANGE_FEET}ft)`);
  }
  const blocker = encounter?.combatants.find(
    (c) =>
      c.combatantId !== intent.casterId &&
      c.position !== undefined &&
      c.position.x === intent.to.x &&
      c.position.y === intent.to.y,
  );
  if (blocker !== undefined) {
    const occupier = state.characters[blocker.combatantId];
    throw new Error(
      `Tree Stride destination (${intent.to.x},${intent.to.y}) is occupied by ${occupier?.name ?? blocker.combatantId}`,
    );
  }

  const at = intent.at ?? nowIso();
  return [
    {
      id: newEventId() as ULID,
      at,
      type: 'ActionEconomyConsumed',
      encounterId: activeEncounterId,
      combatantId: intent.casterId,
      kind: 'bonusAction',
    } satisfies ActionEconomyConsumedEvent,
    {
      id: newEventId() as ULID,
      at,
      type: 'CombatantMoved',
      encounterId: activeEncounterId,
      combatantId: intent.casterId as ULID,
      fromPosition: { ...active.position },
      toPosition: { ...intent.to },
      feetTraveled: 0,
    } satisfies CombatantMovedEvent,
  ];
};
