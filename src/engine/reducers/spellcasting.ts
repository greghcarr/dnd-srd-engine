import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Character } from '../../schemas/runtime/character.js';
import type {
  FreeCastUsedEvent,
  PactSlotConsumedEvent,
  PactSlotsRegainedEvent,
  PreparedSpellsChangedEvent,
  SpellCastDeclaredEvent,
  SpellSlotConsumedEvent,
  SpellSlotsRegainedEvent,
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

// Slice 637: Magical Cunning (Warlock L2) regains expended Pact Magic
// slots mid-rest. Clamps at 0 so an over-credit (planner bug or a
// hand-authored event with too-large `count`) can't produce negative
// expended slots.
export const applyPactSlotsRegained = (
  state: Draft<CampaignState>,
  event: PactSlotsRegainedEvent,
): void => {
  const character = requireCharacter(state, event.characterId);
  character.pactSlotsUsed = Math.max(0, character.pactSlotsUsed - event.count);
};

// Slice 721: regain expended standard slots of a level (Druid Wild
// Resurgence). Decrements `spellSlotsUsed[slotLevel]`, clamped at 0 so an
// over-credit can't bank slots above max.
export const applySpellSlotsRegained = (
  state: Draft<CampaignState>,
  event: SpellSlotsRegainedEvent,
): void => {
  const character = requireCharacter(state, event.characterId);
  const key = String(event.slotLevel);
  const previous = character.spellSlotsUsed[key] ?? 0;
  character.spellSlotsUsed[key] = Math.max(0, previous - event.count);
};

// Slice 724: Wizard Memorize Spell swaps one prepared spell. Remove the
// outgoing spell and add the incoming one (idempotent on the add).
export const applyPreparedSpellsChanged = (
  state: Draft<CampaignState>,
  event: PreparedSpellsChangedEvent,
): void => {
  const character = requireCharacter(state, event.characterId);
  character.preparedSpells = character.preparedSpells.filter((s) => s !== event.removed);
  if (!character.preparedSpells.includes(event.added)) {
    character.preparedSpells.push(event.added);
  }
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
