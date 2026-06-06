// Slice 695: the tactical MovePolicy — engine orchestration around the
// pure decision logic in policy.ts. Not pure (it commits move / disengage
// / opportunity-attack events), so it lives apart from planTacticalMove.
//
// makeTacticalMovePolicy captures the resolved content once (so the budget
// query getEffectiveSpeed is right and content is resolved only in
// tactical mode), and returns a MovePolicy: per turn, classify the active
// combatant, ask planTacticalMove for a destination, optionally Disengage,
// commit the move, and resolve any opportunity attacks it provoked.

import { commit, type Campaign } from '../../src/engine/commit.js';
import { getEffectiveSpeed } from '../../src/derive/speed.js';
import type { ResolvedContent, ContentPack } from '../../src/content/pack.js';
import type { Event } from '../../src/schemas/events/index.js';
import type { OpportunityAvailableEvent } from '../../src/schemas/events/movement.js';
import type { Door } from '../../src/schemas/runtime/location.js';
import type { Engine, MovePolicy, MovePolicyContext, Combatant } from '../combat-fuzz-core.js';
import { classifyTacticalRole, planTacticalMove } from './policy.js';

const NO_DOORS: ReadonlyArray<Door> = [];

// The reactor's main-hand weapon instance id IF it can make a melee
// opportunity attack. A purely ranged weapon (bow) cannot, so the OA is
// skipped — the correct ruling, not an error to swallow.
const meleeWeaponInstanceFor = (
  pack: ContentPack,
  combatant: Combatant | undefined,
): string | undefined => {
  if (combatant === undefined) return undefined;
  const instance = combatant.built.weaponInstance;
  const def = pack.items.find((i) => i.id === instance.definitionId);
  if (def?.itemKind !== 'weapon') return undefined;
  return (def as { attackKind: string }).attackKind === 'melee' ? instance.id : undefined;
};

// Resolve every opportunity attack a committed move provoked. Scans the
// move's emitted events for OpportunityAvailable in array order (so the
// multi-reactor 2v2 RNG stream is stable) and resolves each via the
// engine's opportunity-attack planner with a deterministic reactor policy:
// the reactor takes the OA when able. Tactical-only RNG use.
export const resolveOpportunityAttacks = (args: {
  readonly engine: Engine;
  readonly campaign: Campaign;
  readonly moveEvents: ReadonlyArray<Event>;
  readonly meleeWeaponInstanceFor: (reactorId: string) => string | undefined;
}): Campaign => {
  let campaign = args.campaign;
  for (const event of args.moveEvents) {
    if (event.type !== 'OpportunityAvailable') continue;
    const oa = event as OpportunityAvailableEvent;
    const weaponInstanceId = args.meleeWeaponInstanceFor(oa.reactorId);
    if (weaponInstanceId === undefined) continue; // no melee OA available
    try {
      const { events } = args.engine.plan.opportunityAttack(campaign.state, {
        reactorId: oa.reactorId,
        targetId: oa.moverId,
        weaponInstanceId,
      });
      campaign = commit(campaign, events);
    } catch {
      // Reactor ineligible (reaction already used, incapacitated, Addled) —
      // skip this OA.
    }
  }
  return campaign;
};

export const makeTacticalMovePolicy = (deps: { readonly content: ResolvedContent }): MovePolicy =>
  (ctx: MovePolicyContext): Campaign => {
    const { engine, pack, encounterId, active, opponent, combatants } = ctx;
    let campaign = ctx.campaign;
    const activeId = active.built.character.id;
    const enemyId = opponent.built.character.id;
    const state = campaign.state;

    const locationId = state.characterLocations[activeId];
    const map = locationId !== undefined ? state.locations[locationId]?.map : undefined;
    if (map === undefined) return campaign;

    const encounter = state.encounters[encounterId];
    const self = encounter?.combatants.find((c) => c.combatantId === activeId);
    const enemy = encounter?.combatants.find((c) => c.combatantId === enemyId);
    if (self?.position === undefined || enemy?.position === undefined) return campaign;

    const character = state.characters[activeId];
    if (character === undefined) return campaign;
    const speedFeet = getEffectiveSpeed({
      character,
      content: deps.content,
      itemInstances: state.itemInstances,
      pendingChoices: state.pendingChoices,
    });
    if (speedFeet <= 0) return campaign;

    const occupiedFeet = encounter!.combatants
      .filter((c) => c.combatantId !== activeId && c.position !== undefined)
      .map((c) => c.position!);

    const { role, effectiveRangeFeet, reachFeet } = classifyTacticalRole(
      pack,
      active.built.weaponInstance.definitionId,
      active.built.build.cantrips,
    );

    const decision = planTacticalMove({
      map,
      doors: NO_DOORS,
      fromFeet: self.position,
      enemyFeet: enemy.position,
      occupiedFeet,
      speedFeet,
      role,
      effectiveRangeFeet,
      reachFeet,
      hpFraction: character.hp.current / Math.max(1, character.hp.max),
      round: encounter!.round,
    });
    if (decision === null) return campaign;

    // Flee disengages first (it won't attack this turn anyway) so the
    // retreat provokes no OA. Kiting accepts the OA — which is what
    // exercises the OA-resolution path.
    if (decision.disengage) {
      try {
        campaign = commit(
          campaign,
          engine.plan.disengage(campaign.state, { combatantId: activeId }).events,
        );
      } catch {
        // Couldn't disengage (action already used) — accept the OA.
      }
    }

    try {
      const moveResult = engine.plan.move(campaign.state, { combatantId: activeId, to: decision.to });
      campaign = commit(campaign, moveResult.events);
      campaign = resolveOpportunityAttacks({
        engine,
        campaign,
        moveEvents: moveResult.events,
        meleeWeaponInstanceFor: (reactorId) => meleeWeaponInstanceFor(pack, combatants[reactorId]),
      });
    } catch {
      // Move blocked (frightened toward source, over budget, collision) —
      // degrade to stay-put.
    }

    return campaign;
  };
