// Slice 419: encounter / combat-state view model (read layer).
//
// The surface a combat tracker renders: the initiative order with each
// combatant's HP, AC, active conditions, and per-turn action-economy
// usage, plus the round and whose turn it is. Pure assembly over the
// encounter + character state and the existing AC derivation; invents no
// rules. Combatants (both PCs and monsters) are `Character` entities; a
// combatant's `combatantId` is its character id, and `combatants` is
// stored in initiative order with `activeIndex` indexing it directly.
import type { CampaignState } from '../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../content/pack.js';
import { computeAC } from '../derive/ac.js';

export interface CombatantConditionView {
  readonly id: string;
  /** The condition's display name, else the id when the pack lacks a definition. */
  readonly name: string;
}

export interface CombatantTurnView {
  readonly actionUsed: boolean;
  readonly bonusActionUsed: boolean;
  readonly reactionUsed: boolean;
  readonly feetMoved: number;
}

export interface CombatantView {
  readonly combatantId: string;
  readonly name: string;
  readonly initiative: number;
  /** True for the combatant whose turn it is (only while the encounter is active). */
  readonly isActive: boolean;
  readonly hp: { readonly current: number; readonly max: number; readonly temp: number };
  readonly ac: number;
  readonly exhaustion: number;
  readonly conditions: ReadonlyArray<CombatantConditionView>;
  /** Current HP at or below 0. */
  readonly defeated: boolean;
  readonly turn: CombatantTurnView;
}

export interface EncounterView {
  readonly encounterId: string;
  readonly name?: string;
  readonly status: 'planning' | 'active' | 'ended';
  readonly round: number;
  /** The active combatant's id while the encounter is active, else undefined. */
  readonly activeCombatantId?: string;
  /** Combatants in initiative order. */
  readonly combatants: ReadonlyArray<CombatantView>;
}

/**
 * The combat-tracker view of an encounter, or undefined when the id is
 * unknown. Combatants whose character is missing from state are skipped.
 */
export const buildEncounterView = (
  state: CampaignState,
  content: ResolvedContent,
  encounterId: string,
): EncounterView | undefined => {
  const encounter = state.encounters[encounterId];
  if (encounter === undefined) return undefined;
  const active = encounter.status === 'active';

  const combatants: CombatantView[] = [];
  encounter.combatants.forEach((combatant, index) => {
    const character = state.characters[combatant.combatantId];
    if (character === undefined) return;
    const ac = computeAC({
      character,
      itemInstances: state.itemInstances,
      content,
      characters: state.characters,
    });
    combatants.push({
      combatantId: combatant.combatantId,
      name: character.name,
      initiative: combatant.initiative,
      isActive: active && index === encounter.activeIndex,
      hp: { current: character.hp.current, max: character.hp.max, temp: character.hp.temp },
      ac: ac.total,
      exhaustion: character.exhaustion,
      conditions: character.appliedConditions.map((c) => ({
        id: c.conditionId,
        name: content.conditions.get(c.conditionId)?.name ?? c.conditionId,
      })),
      defeated: character.hp.current <= 0,
      turn: {
        actionUsed: combatant.turnUsage.actionUsed,
        bonusActionUsed: combatant.turnUsage.bonusActionUsed,
        reactionUsed: combatant.turnUsage.reactionUsedThisRound,
        feetMoved: combatant.turnUsage.feetMovedThisTurn,
      },
    });
  });

  const activeCombatantId = active
    ? encounter.combatants[encounter.activeIndex]?.combatantId
    : undefined;

  return {
    encounterId: encounter.id,
    ...(encounter.name !== undefined ? { name: encounter.name } : {}),
    status: encounter.status,
    round: encounter.round,
    ...(activeCombatantId !== undefined ? { activeCombatantId } : {}),
    combatants,
  };
};
