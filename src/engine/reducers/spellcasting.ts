import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Character } from '../../schemas/runtime/character.js';
import type {
  FreeCastUsedEvent,
  PactSlotConsumedEvent,
  SpellCastDeclaredEvent,
  SpellSlotConsumedEvent,
} from '../../schemas/events/spellcasting.js';
import { invariant } from '../../internal/invariants.js';

const requireCharacter = (state: Draft<CampaignState>, id: string): Draft<Character> => {
  const c = state.characters[id];
  invariant(c !== undefined, `Character ${id} not found`);
  return c;
};

export const applySpellCastDeclared = (
  _state: Draft<CampaignState>,
  _event: SpellCastDeclaredEvent,
): void => {
  // Intent event: declares what the caster is doing. Mechanical effects
  // (slot consumption, damage, etc.) come via subsequent events.
};

export const applySpellSlotConsumed = (
  state: Draft<CampaignState>,
  event: SpellSlotConsumedEvent,
): void => {
  const character = requireCharacter(state, event.characterId);
  const key = String(event.slotLevel);
  const previous = character.spellSlotsUsed[key] ?? 0;
  character.spellSlotsUsed[key] = previous + 1;
};

export const applyPactSlotConsumed = (
  state: Draft<CampaignState>,
  event: PactSlotConsumedEvent,
): void => {
  const character = requireCharacter(state, event.characterId);
  character.pactSlotsUsed += 1;
};

// Slice 486: records that the bearer's once-per-long-rest free cast for
// `spellId` has been used. Conditions dedupe by id, so push only when
// absent (defensive; the planner's pre-emit gate already rejects a
// repeat free cast). Cleared by `applyLongRestEnded`.
export const applyFreeCastUsed = (
  state: Draft<CampaignState>,
  event: FreeCastUsedEvent,
): void => {
  const character = requireCharacter(state, event.characterId);
  if (!character.usedFreeCastSpellIds.includes(event.spellId)) {
    character.usedFreeCastSpellIds.push(event.spellId);
  }
};
