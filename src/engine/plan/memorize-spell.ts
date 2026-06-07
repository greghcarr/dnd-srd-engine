import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { PreparedSpellsChangedEvent } from '../../schemas/events/spellcasting.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const WIZARD_CLASS_ID = 'wizard';
const MEMORIZE_SPELL_LEVEL = 5;
const MEMORIZE_SPELL_SOURCE = 'memorize-spell';
const CANTRIP_LEVEL = 0;

export interface MemorizeSpellIntent {
  readonly type: 'MemorizeSpell';
  readonly wizardId: string;
  // The currently-prepared level-1+ spell to put back in the spellbook.
  readonly removeSpellId: string;
  // The level-1+ spellbook spell (in knownSpells, not currently prepared)
  // to prepare in its place.
  readonly addSpellId: string;
  readonly at?: string;
}

// Wizard L5 Memorize Spell (PHB 2024 / SRD 5.2.1): "Whenever you finish a
// Short Rest, you can study your spellbook and replace one of the level 1+
// Wizard spells you have prepared with another level 1+ spell from the
// book."
//
// The engine doesn't enforce prepared-spell COUNTS (the prepared list is
// consumer-managed free state), so this is the mechanical realization of
// the one-for-one swap, validated per RAW: the outgoing spell must be
// currently prepared and level 1+; the incoming spell must be in the
// spellbook (knownSpells), level 1+, and not already prepared. The "on a
// Short Rest" timing is consumer-managed (the consumer invokes this after
// a short rest), matching how other study/preparation steps are driven.
export const planMemorizeSpell = (
  state: CampaignState,
  content: ResolvedContent,
  intent: MemorizeSpellIntent,
): ReadonlyArray<Event> => {
  const wizard = state.characters[intent.wizardId];
  if (!wizard) throw new Error(`Unknown character ${intent.wizardId}`);
  const enrollment = wizard.classes.find((c) => c.classId === WIZARD_CLASS_ID);
  if (enrollment === undefined || enrollment.level < MEMORIZE_SPELL_LEVEL) {
    throw new Error(`${wizard.name} does not have Memorize Spell (requires Wizard level ${MEMORIZE_SPELL_LEVEL})`);
  }
  if (intent.removeSpellId === intent.addSpellId) {
    throw new Error('Memorize Spell must swap to a different spell');
  }

  if (!wizard.preparedSpells.includes(intent.removeSpellId)) {
    throw new Error(`${wizard.name} does not have ${intent.removeSpellId} prepared`);
  }
  const removed = content.spells.get(intent.removeSpellId);
  if (removed === undefined || removed.level <= CANTRIP_LEVEL) {
    throw new Error(`Memorize Spell can only swap level-1+ spells (got ${intent.removeSpellId})`);
  }

  if (!wizard.knownSpells.includes(intent.addSpellId)) {
    throw new Error(`${wizard.name} does not have ${intent.addSpellId} in their spellbook`);
  }
  if (wizard.preparedSpells.includes(intent.addSpellId)) {
    throw new Error(`${wizard.name} already has ${intent.addSpellId} prepared`);
  }
  const added = content.spells.get(intent.addSpellId);
  if (added === undefined || added.level <= CANTRIP_LEVEL) {
    throw new Error(`Memorize Spell can only swap to a level-1+ spell (got ${intent.addSpellId})`);
  }

  const at = intent.at ?? nowIso();
  return [
    {
      id: newEventId() as ULID,
      at,
      type: 'PreparedSpellsChanged',
      characterId: intent.wizardId as ULID,
      removed: intent.removeSpellId,
      added: intent.addSpellId,
      source: MEMORIZE_SPELL_SOURCE,
    } satisfies PreparedSpellsChangedEvent,
  ];
};
