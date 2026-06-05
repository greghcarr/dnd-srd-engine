// Slice 669: Dragon's Breath exhalation action.
//
// RAW (SRD 5.2.1 Dragon's Breath L2): "You touch a willing creature
// and imbue it with the power to spew magical energy. Until the
// spell ends, the target can take a Magic action to exhale energy
// in a 15-foot Cone. Each creature in that Cone must make a
// Dexterity saving throw, taking 3d6 damage of the type you chose
// when you cast this spell on a failed save or half as much damage
// on a successful one. Using a Higher-Level Spell Slot: The damage
// increases by 1d6 for each spell slot level above 2."
//
// Slice 669 wires the buffed creature's action via a dedicated
// planner (sibling of planFrenzy / planCuttingWords / etc.). The
// buffed creature must carry the `dragons-breath-<type>-active`
// condition; the planner reads the type from the intent (the
// consumer knows which condition is on the creature) and verifies
// the marker. The slot level scales damage via the concentration
// EffectInstance's slotLevel.

import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { DamageAppliedEvent } from '../../schemas/events/combat.js';
import type { RNG } from '../../rng/index.js';
import { rollDie } from '../../rng/dice.js';
import { rollSaveAgainstDC } from './_save-roll.js';
import { computeSpellSaveDC } from '../../derive/spell-dc.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { applyAll } from '../apply.js';
import { planConcentrationOnDamage } from './concentration.js';
import { newEventId } from '../../ids.js';
import { nowIso } from '../../internal/clock.js';
import type { ULID } from '../ids-utils.js';

const BASE_DICE = 3;
const DIE_FACES = 6;
const DICE_PER_SLOT_ABOVE_BASE = 1;
const BASE_SPELL_LEVEL = 2;
const DRAGONS_BREATH_SOURCE = 'dragons-breath-exhale';

const DRAGONS_BREATH_TYPES = ['acid', 'cold', 'fire', 'lightning', 'poison'] as const;
type DragonsBreathType = (typeof DRAGONS_BREATH_TYPES)[number];

const conditionIdFor = (t: DragonsBreathType): string => `dragons-breath-${t}-active`;

export interface ExhaleDragonsBreathIntent {
  readonly type: 'ExhaleDragonsBreath';
  readonly characterId: string;
  readonly damageType: DragonsBreathType;
  readonly targetIds: ReadonlyArray<string>;
  readonly at?: string;
}

export const planExhaleDragonsBreath = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: ExhaleDragonsBreathIntent,
): ReadonlyArray<Event> => {
  const character = state.characters[intent.characterId];
  if (!character) throw new Error(`Unknown character ${intent.characterId}`);
  if (!DRAGONS_BREATH_TYPES.includes(intent.damageType)) {
    throw new Error(`Invalid Dragon's Breath damage type: ${intent.damageType}`);
  }
  const marker = conditionIdFor(intent.damageType);
  const carriedMarker = character.appliedConditions.find((c) => c.conditionId === marker);
  if (!carriedMarker) {
    throw new Error(
      `${character.name} cannot exhale Dragon's Breath: no '${marker}' condition active`,
    );
  }

  // The caster of Dragon's Breath is the creature concentrating on
  // the spell — read from the marker's sourceCharacterId (the buff
  // mechanic populates it).
  const casterId = carriedMarker.sourceCharacterId ?? intent.characterId;
  const caster = state.characters[casterId];
  if (!caster) throw new Error(`Dragon's Breath caster ${casterId} not found`);
  const casterConcEffectId = caster.concentrationEffectId;
  const casterConcEffect = casterConcEffectId !== undefined ? state.effectInstances[casterConcEffectId] : undefined;
  const slotLevel = casterConcEffect?.slotLevel ?? BASE_SPELL_LEVEL;
  const slotsAbove = Math.max(0, slotLevel - BASE_SPELL_LEVEL);
  const totalDice = BASE_DICE + slotsAbove * DICE_PER_SLOT_ABOVE_BASE;

  // Spell save DC of the caster. RAW: targets save against the
  // caster's spell save DC, not the buffed creature's.
  const casterClass = caster.classes[0]?.classId ?? '';
  const dcResult = computeSpellSaveDC({
    character: caster,
    itemInstances: state.itemInstances,
    content,
    classId: casterClass,
    characters: state.characters,
    castingAbility: 'CHA', // fallback; the actual casting ability is encoded on the spell
  });
  const dc = dcResult.total;

  const at = intent.at ?? nowIso();
  const events: Event[] = [];

  for (const targetId of intent.targetIds) {
    const target = state.characters[targetId];
    if (!target) continue;
    const saveResult = rollSaveAgainstDC({
      state,
      content,
      targetId,
      ability: 'DEX',
      dc,
      sourceIsMagical: true,
      rng,
      at,
    });
    if (saveResult === undefined) continue;
    events.push(saveResult.event);

    let rolled = 0;
    for (let i = 0; i < totalDice; i += 1) {
      rolled += rollDie(DIE_FACES, rng);
    }
    const finalDamage = saveResult.success ? Math.floor(rolled / 2) : rolled;
    if (finalDamage <= 0) continue;

    const mitigated = mitigateDamage({
      character: target,
      itemInstances: state.itemInstances,
      content,
      rawComponents: [{ amount: finalDamage, type: intent.damageType }],
      characters: state.characters,
      sourceIsMagical: true,
    });
    const intercept = interceptFatalDamage({
      state: applyAll(state, events),
      content,
      targetId,
      mitigatedComponents: mitigated,
      causedByEventId: saveResult.event.id,
      at,
      rng,
    });
    const damageApplied: DamageAppliedEvent = {
      id: newEventId() as ULID,
      at,
      type: 'DamageApplied',
      targetId: targetId as ULID,
      components: intercept.components,
      causedByEventId: saveResult.event.id,
      sourceCharacterId: intent.characterId as ULID,
      source: DRAGONS_BREATH_SOURCE,
    };
    events.push(damageApplied);
    events.push(...intercept.extraEvents);
    events.push(
      ...planConcentrationOnDamage(
        state,
        content,
        rng,
        target,
        intercept.components,
        damageApplied.id,
        at,
      ),
    );
  }
  return events;
};
