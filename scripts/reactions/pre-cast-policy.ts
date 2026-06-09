// Slice 751: the spell-cast reaction window (Counterspell) for the
// combat-fuzz driver. Sibling of pre-damage-policy.ts (attack window).
//
// The fuzz plans a spell but does NOT commit it; it hands the planned
// (uncommitted) events here. We find the SpellCastDeclared and, for a
// leveled spell, let an eligible enemy Counterspell it. planCounterspell
// rolls the original caster's CON save vs the counter-caster's DC; on a
// failed save it emits SpellCountered and we commit the spell's
// declaration MINUS its effects. On a successful save the spell resolves
// (the counter-caster still spent slot + reaction, RAW).
//
// We pass originalSpellLevel: 0 so Counterspell does NOT re-emit the
// original caster's slot loss — the planned spell already carries its own
// SpellSlotConsumed, which we keep. This avoids a double slot consumption
// and works uniformly for standard and pact slots.

import { commit, type Campaign } from '../../src/engine/commit.js';
import type { Event } from '../../src/schemas/events/index.js';
import type { SpellCastDeclaredEvent } from '../../src/schemas/events/spellcasting.js';
import type { Character } from '../../src/schemas/runtime/character.js';
import type { ResolvedContent } from '../../src/content/pack.js';
import { computeAvailableSpellSlots } from '../../src/derive/spell-slots.js';
import { shouldCounterspell } from '../../src/ai/reactions.js';
import { SHIELD_CASTER_CLASS_IDS } from '../../src/ai/reaction-constants.js';
import { reactionAvailable } from './reaction-policy.js';
import type { Engine } from '../combat-fuzz-core.js';

const COUNTERSPELL_SLOT_LEVEL = 3;

// Keep the spell's pre-effect events (declaration + caster action-economy +
// its own slot/free-cast), dropping the effects. planCastSpell front-loads
// those before any effect event, so the first event that isn't one of these
// is the effect boundary.
const PRE_EFFECT_TYPES = new Set([
  'SpellCastDeclared',
  'ActionEconomyConsumed',
  'SpellSlotConsumed',
  'PactSlotConsumed',
  'FreeCastUsed',
  'ResourceSpent',
]);
const keepDeclaration = (events: ReadonlyArray<Event>): Event[] => {
  const firstEffect = events.findIndex((e) => !PRE_EFFECT_TYPES.has(e.type));
  return firstEffect === -1 ? [...events] : events.slice(0, firstEffect);
};

const hasThirdLevelSlot = (character: Character, content: ResolvedContent): boolean =>
  (computeAvailableSpellSlots(character, content.classes).standardByLevel[COUNTERSPELL_SLOT_LEVEL - 1] ?? 0) >= 1;

// The counter-caster's arcane class (the one that prepares Counterspell),
// used by the planner to compute the spell save DC.
const arcaneClassId = (character: Character): string | undefined =>
  character.classes.find((c) => SHIELD_CASTER_CLASS_IDS.includes(c.classId))?.classId
  ?? character.classes[0]?.classId;

// Run the spell-cast reaction window over a planned (uncommitted) spell and
// commit the result. A non-leveled spell (cantrip) or no eligible
// counter-caster commits the full spell unchanged.
export const resolveCastWithCounterspell = (args: {
  readonly engine: Engine;
  readonly content: ResolvedContent;
  readonly campaign: Campaign;
  readonly encounterId: string;
  readonly spellEvents: ReadonlyArray<Event>;
  /** Character ids on the caster's enemy team — scanned for a counter-caster. */
  readonly opposingTeam: ReadonlyArray<string>;
}): Campaign => {
  const { engine, content, campaign, encounterId, spellEvents, opposingTeam } = args;
  const declared = spellEvents.find(
    (e): e is SpellCastDeclaredEvent => e.type === 'SpellCastDeclared',
  );
  if (declared === undefined || declared.slotLevel < 1) {
    return commit(campaign, [...spellEvents]);
  }

  const counterCasterId = opposingTeam.find((id) => {
    const c = campaign.state.characters[id];
    return c !== undefined
      && reactionAvailable(campaign.state, encounterId, id)
      && shouldCounterspell(c, declared.slotLevel)
      && hasThirdLevelSlot(c, content);
  });
  if (counterCasterId === undefined) {
    return commit(campaign, [...spellEvents]);
  }

  const castingClassId = arcaneClassId(campaign.state.characters[counterCasterId]!);
  if (castingClassId === undefined) return commit(campaign, [...spellEvents]);

  let counterEvents: ReadonlyArray<Event>;
  try {
    counterEvents = engine.plan.counterspell(campaign.state, {
      counterCasterId,
      targetCasterId: declared.characterId,
      originalSpellEventId: declared.id,
      spellId: declared.spellId,
      castingClassId,
      slotLevelToConsume: COUNTERSPELL_SLOT_LEVEL,
      // 0 so Counterspell doesn't re-emit the original caster's slot loss —
      // the planned spell already carries its own SpellSlotConsumed.
      originalSpellLevel: 0,
    }).events;
  } catch {
    return commit(campaign, [...spellEvents]);
  }

  const countered = counterEvents.some((e) => e.type === 'SpellCountered');
  const finalEvents = countered
    ? [...keepDeclaration(spellEvents), ...counterEvents]
    : [...spellEvents, ...counterEvents];
  return commit(campaign, finalEvents);
};
