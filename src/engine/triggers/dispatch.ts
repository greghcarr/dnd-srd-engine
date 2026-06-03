import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Character } from '../../schemas/runtime/character.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { Effect } from '../../schemas/effects.js';
import type { Predicate } from '../../schemas/predicate.js';
import type { RNG } from '../../rng/index.js';
import { rollDie, parseDiceExpression } from '../../rng/dice.js';
import { evaluatePredicate } from '../../effects/predicate.js';
import { collectEffectsFromCharacter, buildFormulaContext } from '../../derive/effect-stack.js';
import { evaluateFormula } from '../../effects/formula.js';
import { getCreatureType } from '../../derive/creature-type.js';
import { mitigateDamage } from '../../derive/damage-mitigation.js';
import { isMagicWeaponAttack } from '../../derive/magicality.js';
import { interceptFatalDamage } from '../../derive/fatal-damage-intercept.js';
import { applyAll } from '../apply.js';
import { planConcentrationOnDamage } from '../plan/concentration.js';
import type { AppliedCondition } from '../../schemas/runtime/character.js';
import { newEventId } from '../../ids.js';
import type { ULID } from '../ids-utils.js';
import type {
  ConditionAppliedEvent,
  ConditionRemovedEvent,
  DamageAppliedEvent,
  TempHPGrantedEvent,
} from '../../schemas/events/combat.js';
import { newAppliedConditionId } from '../../ids.js';
import type { ConcentrationBrokenEvent } from '../../schemas/events/concentration.js';
import type { TriggerFiredEvent } from '../../schemas/events/triggers.js';
import {
  buildCunningStrikeEffects,
  cunningStrikeForgoDice,
  type CunningStrikeOption,
} from '../plan/cunning-strike.js';

type OnEventEffect = Extract<Effect, { kind: 'OnEvent' }>;
type AddDamageAction = Extract<OnEventEffect['actions'][number], { kind: 'AddDamage' }>;
type AddDamageToAttackerAction = Extract<OnEventEffect['actions'][number], { kind: 'AddDamageToAttacker' }>;
type ApplyConditionAction = Extract<OnEventEffect['actions'][number], { kind: 'ApplyCondition' }>;
type ApplyConditionToAttackerAction = Extract<OnEventEffect['actions'][number], { kind: 'ApplyConditionToAttacker' }>;
type SpawnCreatureAction = Extract<OnEventEffect['actions'][number], { kind: 'SpawnCreature' }>;

// When an OnEvent rider lives inside a condition that was applied by
// some caster (Hex, Bestow Curse, etc.), the `appliedFrom` argument
// supplies that AppliedCondition. The `event.attackerIsSource` fact
// then resolves to true precisely when the event's attacker matches
// the condition's `sourceCharacterId` — letting a predicate like
// "targetIsSelf && hit && attackerIsSource" express "the warlock who
// hexed me just hit me." Riders not living inside a sourced condition
// (Holy Weapon, ambient class features) get `attackerIsSource: false`.
const buildEventFacts = (
  event: Event,
  characterId: string,
  appliedFrom: AppliedCondition | undefined,
  state: CampaignState,
  content: ResolvedContent,
): Map<string, unknown> => {
  const facts = new Map<string, unknown>([['event.type', event.type]]);
  // Slice 122: bearer-state facts for numeric-comparison predicates
  // on OnEvent riders. `bearer.tempHp` is the bearer's current temp
  // HP — gates Armor of Agathys's retaliation rider on "while you
  // have these Hit Points" (approximated as bearer.hp.temp > 0 since
  // the engine doesn't track temp-HP provenance).
  const bearer = state.characters[characterId];
  if (bearer !== undefined) {
    facts.set('bearer.tempHp', bearer.hp.temp);
  }
  if (event.type === 'AttackRolled') {
    facts.set('event.attackerIsSelf', event.attackerId === characterId);
    facts.set('event.targetIsSelf', event.targetId === characterId);
    facts.set('event.hit', event.hit);
    facts.set('event.critical', event.critical);
    facts.set('event.attackKind', event.attackKind);
    facts.set('event.used', event.used);
    facts.set('event.weaponInstanceId', event.weaponInstanceId);
    // Slice 549: weapon-type facts for Sneak Attack's RAW weapon gate
    // ("Finesse or Ranged weapon"). Reads the weapon's definition via
    // the item-instance lookup. Falls back to false for synthetic /
    // unknown weapons. `event.attackerWeaponHasFinesse` = the weapon
    // declares `finesse` in its properties; `event.attackerWeaponIsRanged`
    // mirrors `event.attackKind === 'ranged'` for parallel use in the
    // sneak-attack `any` term. Future RAW gates on other weapon
    // properties (heavy / light / two-handed) reuse the same pattern.
    if (event.weaponInstanceId !== undefined) {
      const wi = state.itemInstances[event.weaponInstanceId];
      const wdef = wi !== undefined ? content.items.get(wi.definitionId) : undefined;
      const hasFinesse = wdef !== undefined && wdef.itemKind === 'weapon'
        && wdef.properties.includes('finesse');
      const isRanged = wdef !== undefined && wdef.itemKind === 'weapon'
        && wdef.attackKind === 'ranged';
      facts.set('event.attackerWeaponHasFinesse', hasFinesse);
      facts.set('event.attackerWeaponIsRanged', isRanged);
      facts.set('event.attackerWeaponIsFinesseOrRanged', hasFinesse || isRanged);
    } else {
      facts.set('event.attackerWeaponHasFinesse', false);
      facts.set('event.attackerWeaponIsRanged', false);
      facts.set('event.attackerWeaponIsFinesseOrRanged', false);
    }
    facts.set(
      'event.attackerHasAllyAdjacentToTarget',
      event.attackerHasAllyAdjacentToTarget ?? false,
    );
    // Slice 206.
    facts.set('event.isOpportunityAttack', event.isOpportunityAttack === true);
    facts.set(
      'event.attackerIsSource',
      appliedFrom?.sourceCharacterId !== undefined
        && event.attackerId === appliedFrom.sourceCharacterId,
    );
    facts.set(
      'event.targetIsSource',
      appliedFrom?.sourceCharacterId !== undefined
        && event.targetId === appliedFrom.sourceCharacterId,
    );
    const attacker = state.characters[event.attackerId];
    if (attacker !== undefined) {
      facts.set('event.attackerCreatureType', getCreatureType(attacker, content));
    }
    const target = state.characters[event.targetId];
    if (target !== undefined) {
      facts.set('event.targetCreatureType', getCreatureType(target, content));
      // Slice 348: "target is missing any Hit Points" gate (Hunter
      // Colossus Slayer). The AttackRolled trigger dispatch runs on the
      // post-AttackRolled / pre-DamageApplied state, so this reflects
      // the target's HP *before* the current hit's damage, i.e. whether
      // it was already wounded (RAW: the extra die applies to an
      // already-injured target, not one this hit just brought below max).
      facts.set('event.targetMissingHp', target.hp.current < target.hp.max);
    }
  } else if (event.type === 'DamageApplied') {
    facts.set('event.targetIsSelf', event.targetId === characterId);
    // Slice 349: on-kill facts for Dark One's Blessing. The DamageApplied
    // trigger dispatch runs on the post-damage state, so `targetReducedToZero`
    // reflects the target's HP after this damage. `sourceIsSelf` is whether
    // the bearer dealt the damage. (Known edge: an overkill hit on an
    // already-0-HP creature also reads as reduced-to-zero; firing on
    // an already-downed enemy is a documented approximation.)
    facts.set('event.sourceIsSelf', event.sourceCharacterId === characterId);
    const damaged = state.characters[event.targetId];
    if (damaged !== undefined) {
      facts.set('event.targetReducedToZero', damaged.hp.current <= 0);
    }
    // Slice 233: cumulative damage-per-type facts for predicate-gated
    // riders on DamageApplied (Troll Loathsome Limbs needs
    // `event.damageOfType.slashing >= 15`). One fact per damage type
    // that appears in this event's components, summed in case the
    // event carries multiple components of the same type.
    const byType = new Map<string, number>();
    for (const c of event.components) {
      byType.set(c.type, (byType.get(c.type) ?? 0) + c.amount);
    }
    for (const [type, amount] of byType) {
      facts.set(`event.damageOfType.${type}`, amount);
    }
    // Slice 516: surface the source string (spell id for cast-spell
    // damage; weapon id for weapon-attack damage when set) so per-spell
    // predicates can gate on it. Canonical user: Warlock Repelling Blast
    // (`OnEvent DamageApplied condition: eq event.source 'eldritch-blast'`).
    if (event.source !== undefined) {
      facts.set('event.source', event.source);
    }
  }
  return facts;
};

const cadenceAllowsFiring = (
  character: Character,
  triggerId: string,
  oncePer: OnEventEffect['oncePer'],
): boolean => {
  if (oncePer === undefined) return true;
  const counter = character.triggerCounters[triggerId];
  if (counter === undefined) return true;
  switch (oncePer) {
    case 'turn':
      return counter.firedThisTurn !== true;
    case 'round':
      return counter.firedThisRound !== true;
    case 'shortRest':
      return counter.firedThisShortRest !== true;
    case 'longRest':
      return counter.firedThisLongRest !== true;
  }
};

const cadencePayload = (
  oncePer: OnEventEffect['oncePer'],
): TriggerFiredEvent['cadence'] => {
  if (oncePer === undefined) return {};
  switch (oncePer) {
    case 'turn':
      return { firedThisTurn: true };
    case 'round':
      return { firedThisRound: true };
    case 'shortRest':
      return { firedThisShortRest: true };
    case 'longRest':
      return { firedThisLongRest: true };
  }
};

const rollAddDamage = (
  action: AddDamageAction,
  rng: RNG,
  critical: boolean,
  forgoDice: number = 0,
  diceOverride?: string,
): { amount: number; rolls: number[] } => {
  // Slice 390: a per-instance `riderDamageDice` (Absorb Elements' slot-
  // scaled next-hit bonus) replaces the rider's declared dice.
  const parsed = parseDiceExpression(diceOverride ?? action.dice);
  // Cunning Strike forgoes dice "before rolling"; a crit then doubles
  // whatever remains.
  const baseCount = Math.max(0, parsed.count - forgoDice);
  const count = critical ? baseCount * 2 : baseCount;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(parsed.die, rng));
  }
  const amount = rolls.reduce((s, v) => s + v, 0) + parsed.modifier;
  return { amount: Math.max(0, amount), rolls };
};

interface FiredTrigger {
  readonly events: Event[];
  readonly triggerId: string;
  readonly cadence: TriggerFiredEvent['cadence'];
}

// Slice 113. Rider damage now flows through the standard mitigation
// pipeline (resistance / immunity / vulnerability / flat reduction /
// qualifier-aware checks). The dispatcher computes a `sourceIsMagical`
// flag per rider (see `isRiderMagical` below) and hands it to
// mitigateDamage so the resistance qualifier (slice 112) applies
// correctly to riders too.
const fireAddDamage = (
  input: {
    action: AddDamageAction;
    event: Event;
    rng: RNG;
    causedByEventId: string;
    state: CampaignState;
    content: ResolvedContent;
    sourceIsMagical: boolean;
    forgoDice?: number;
    diceOverride?: string;
  },
): Event[] => {
  const { action, event, rng, causedByEventId, state, content, sourceIsMagical } = input;
  if (event.type !== 'AttackRolled') return [];
  const { amount } = rollAddDamage(action, rng, event.critical, input.forgoDice ?? 0, input.diceOverride);
  if (amount <= 0) return [];
  const target = state.characters[event.targetId];
  const rawComponents = [{ amount, type: action.damageType }];
  const mitigatedComponents = target !== undefined
    ? mitigateDamage({
        character: target,
        itemInstances: state.itemInstances,
        content,
        rawComponents,
        characters: state.characters,
        sourceIsMagical,
      })
    : rawComponents;
  // Slice 114: a rider that would drop the target to 0 HP consults
  // interceptFatalDamage just like main-damage emitters. Pairs with
  // the per-rider state advancement in dispatchTriggers below so
  // Death Ward fires correctly on a rider-alone kill.
  const damageAppliedId = newEventId() as ULID;
  const intercept = interceptFatalDamage({
    state,
    content,
    targetId: event.targetId,
    mitigatedComponents,
    causedByEventId: damageAppliedId,
    at: event.at,
    rng,
    critical: event.critical,
  });
  const damageApplied: DamageAppliedEvent = {
    id: damageAppliedId,
    at: event.at,
    type: 'DamageApplied',
    targetId: event.targetId,
    components: intercept.components,
    causedByEventId: causedByEventId as ULID,
  };
  const out: Event[] = [damageApplied, ...intercept.extraEvents];
  // Slice 620: rider DamageApplied is its own source per RAW
  // ("multiple sources, such as an arrow and a dragon's breath, you
  // make a separate saving throw for each source"), so the
  // concentration save fires here just like at the main-damage
  // emission site (slice 601). The L1 fuzz review surfaced the gap:
  // a Hex / Hunter's Mark / Divine Smite rider hitting a
  // concentrating creature wasn't triggering the CON save.
  if (target !== undefined) {
    out.push(
      ...planConcentrationOnDamage(
        applyAll(state, out),
        content,
        rng,
        target,
        intercept.components,
        damageAppliedId,
        event.at,
      ),
    );
  }
  return out;
};

// Retaliation variant: damage goes to event.attackerId (Fire Shield,
// Armor of Agathys). Crits on the triggering attack don't double the
// retaliation dice — RAW says "takes 2d8" not "takes 2d8 doubled on a
// crit against you", so we pass critical=false to rollAddDamage.
const fireAddDamageToAttacker = (
  input: {
    action: AddDamageToAttackerAction;
    event: Event;
    rng: RNG;
    causedByEventId: string;
    state: CampaignState;
    content: ResolvedContent;
    sourceIsMagical: boolean;
  },
): Event[] => {
  const { action, event, rng, causedByEventId, state, content, sourceIsMagical } = input;
  if (event.type !== 'AttackRolled') return [];
  const { amount } = rollAddDamage(
    { kind: 'AddDamage', dice: action.dice, damageType: action.damageType },
    rng,
    false,
  );
  if (amount <= 0) return [];
  const target = state.characters[event.attackerId];
  const rawComponents = [{ amount, type: action.damageType }];
  const mitigatedComponents = target !== undefined
    ? mitigateDamage({
        character: target,
        itemInstances: state.itemInstances,
        content,
        rawComponents,
        characters: state.characters,
        sourceIsMagical,
      })
    : rawComponents;
  // Slice 114: also consult interceptFatalDamage on retaliation
  // damage. If Fire Shield-style damage to the attacker would drop
  // them to 0 HP and they have Death Ward, the ward fires for them.
  const damageAppliedId = newEventId() as ULID;
  const intercept = interceptFatalDamage({
    state,
    content,
    targetId: event.attackerId,
    mitigatedComponents,
    causedByEventId: damageAppliedId,
    at: event.at,
    rng,
    // Retaliation damage to the original attacker isn't itself a crit
    // (it's a counter-strike, not an attack-roll); the crit-exempt arm
    // of Undead Fortitude doesn't apply here.
    critical: false,
  });
  const damageApplied: DamageAppliedEvent = {
    id: damageAppliedId,
    at: event.at,
    type: 'DamageApplied',
    targetId: event.attackerId,
    components: intercept.components,
    causedByEventId: causedByEventId as ULID,
  };
  const out: Event[] = [damageApplied, ...intercept.extraEvents];
  // Slice 620: retaliation damage to the original attacker is a
  // separate damage source for concentration purposes (e.g. an Armor
  // of Agathys cold-on-melee retaliator hits a concentrating attacker
  // → CON save on the attacker for the retaliation damage). Same
  // shape as the forward fireAddDamage wire above.
  if (target !== undefined) {
    out.push(
      ...planConcentrationOnDamage(
        applyAll(state, out),
        content,
        rng,
        target,
        intercept.components,
        damageAppliedId,
        event.at,
      ),
    );
  }
  return out;
};

// Determine whether a fired rider's damage is "magical" for the
// resistance-qualifier check. Two signals:
// 1. The bearing condition (if any) is tracked by an EffectInstance
//    whose spellId is set — the rider is spell-sourced, always magical
//    (smite damage, Spirit Shroud rider, Crusader's Mantle, Hex).
// 2. Otherwise on AttackRolled riders, inherit from the triggering
//    weapon (Sneak Attack on a magic longsword counts as magical;
//    Sneak Attack on a regular longsword does not).
// Class-feature riders on a nonmagical weapon, and riders from
// non-AttackRolled events, default to non-magical.
const isRiderMagical = (
  state: CampaignState,
  content: ResolvedContent,
  event: Event,
  appliedFrom: AppliedCondition | undefined,
): boolean => {
  if (appliedFrom?.sourceEffectInstanceId !== undefined) {
    const inst = state.effectInstances[appliedFrom.sourceEffectInstanceId];
    if (inst?.spellId !== undefined) return true;
  }
  if (event.type === 'AttackRolled' && event.weaponInstanceId !== undefined) {
    const weaponInst = state.itemInstances[event.weaponInstanceId];
    if (weaponInst === undefined) return false;
    const def = content.items.get(weaponInst.definitionId);
    if (def === undefined) return false;
    // Slice 207: unarmed strikes by an Empowered Strikes bearer count
    // as magical. Build a thin effect-stack query just for the marker.
    let attackerHasUnarmedAsMagical = false;
    if (def.id === 'unarmed-strike') {
      const attacker = state.characters[event.attackerId];
      if (attacker !== undefined) {
        const effects = collectEffectsFromCharacter({
          character: attacker,
          content,
          itemInstances: state.itemInstances,
          pendingChoices: state.pendingChoices,
        });
        attackerHasUnarmedAsMagical = effects.some((e) => e.kind === 'GrantUnarmedAsMagical');
      }
    }
    return isMagicWeaponAttack(weaponInst, def, attackerHasUnarmedAsMagical);
  }
  return false;
};

// Fires an ApplyCondition TriggerAction. Targets the event's target
// creature (Spirit Shroud's hit rider: target of the attack that
// triggered the rider). Stamps the bearer's id as `sourceCharacterId`
// so source-relative effects (SetAdvantageVsSource and friends)
// resolve correctly. When both `durationRounds` and `currentRound` are
// available, stamps `expiresOnRound = currentRound + durationRounds`
// so planAdvanceTurn can auto-expire the condition at the start of the
// source's turn in the target round (Spirit Shroud: heal-block lifts
// at the start of the caster's next turn). Outside an active encounter
// `currentRound` is undefined and expiry stays consumer-managed.
const fireApplyCondition = (
  action: ApplyConditionAction,
  event: Event,
  bearerId: string,
  causedByEventId: string,
  currentRound: number | undefined,
  parentEffectInstanceId: string | undefined,
): Event[] => {
  if (event.type !== 'AttackRolled' && event.type !== 'DamageApplied') return [];
  const targetId = event.targetId;
  const expiresOnRound =
    action.durationRounds !== undefined && currentRound !== undefined
      ? currentRound + action.durationRounds
      : undefined;
  const applied: ConditionAppliedEvent = {
    id: newEventId() as ULID,
    at: event.at,
    type: 'ConditionApplied',
    targetId,
    conditionId: action.conditionId,
    appliedConditionId: newAppliedConditionId() as ULID,
    sourceCharacterId: bearerId as ULID,
    ...(expiresOnRound !== undefined ? { expiresOnRound } : {}),
    ...(parentEffectInstanceId !== undefined
      ? { sourceEffectInstanceId: parentEffectInstanceId as ULID }
      : {}),
    causedByEventId: causedByEventId as ULID,
  };
  return [applied];
};

// Retaliation variant of fireApplyCondition: targets the attacker
// of the triggering AttackRolled event instead of the bearer's
// attacker. Holy Aura's RAW "fiend / undead that hits you is
// blinded until the spell ends" rides this shape. Stamps the
// bearer's id as `sourceCharacterId` so slice 102's auto-expiry
// can find it (when `durationRounds` is supplied). Only fires on
// AttackRolled (the only event with an attackerId).
//
// When `action.sourceFromEventTarget` is true (Fighter Studied
// Attacks: bearer-keys-on-victim), the emitted ConditionApplied
// stamps `sourceCharacterId = event.targetId` (the missed creature)
// instead of the bearer. This lets SetAdvantageVsSource on the
// applied condition key against that target so the fighter's next
// attack against the same creature gets advantage.
const fireApplyConditionToAttacker = (
  action: ApplyConditionToAttackerAction,
  event: Event,
  bearerId: string,
  causedByEventId: string,
  currentRound: number | undefined,
  parentEffectInstanceId: string | undefined,
): Event[] => {
  if (event.type !== 'AttackRolled') return [];
  const expiresOnRound =
    action.durationRounds !== undefined && currentRound !== undefined
      ? currentRound + action.durationRounds
      : undefined;
  const sourceCharacterId =
    action.sourceFromEventTarget === true ? event.targetId : (bearerId as ULID);
  const applied: ConditionAppliedEvent = {
    id: newEventId() as ULID,
    at: event.at,
    type: 'ConditionApplied',
    targetId: event.attackerId,
    conditionId: action.conditionId,
    appliedConditionId: newAppliedConditionId() as ULID,
    sourceCharacterId,
    ...(expiresOnRound !== undefined ? { expiresOnRound } : {}),
    ...(parentEffectInstanceId !== undefined
      ? { sourceEffectInstanceId: parentEffectInstanceId as ULID }
      : {}),
    causedByEventId: causedByEventId as ULID,
  };
  return [applied];
};

// Slice 233. Builds a Character snapshot from a monster statblock
// and emits CharacterCreated. Canonical user: Troll's Loathsome
// Limbs spawning a Troll Limb. HP = statblock average; ability
// scores + speed copied; minimal runtime state (no inventory,
// no spells, no equipment). The runtime monster-trait fold in
// `collectMonsterEffects` (slice 129) reads through `statblockId`
// so the spawn picks up its own traits at runtime without further
// content authoring.
const fireSpawnCreature = (
  action: SpawnCreatureAction,
  content: ResolvedContent,
  at: string,
): Event[] => {
  const statblock = content.monsters.get(action.statblockId);
  if (statblock === undefined) return [];
  const count = action.count ?? 1;
  const events: Event[] = [];
  for (let i = 0; i < count; i++) {
    const spawnId = newEventId() as ULID;
    const snapshot: Character = {
      id: spawnId as unknown as Character['id'],
      kind: 'creature',
      name: statblock.name,
      speciesId: 'companion',
      backgroundId: 'companion',
      statblockId: statblock.id,
      classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
      abilityScores: statblock.abilityScores,
      hp: { current: statblock.hp.average, max: statblock.hp.average, temp: 0, maxBonus: 0 },
      deathSaves: { successes: 0, failures: 0, stable: false },
      exhaustion: 0,
      speedFeet: statblock.speed.walk ?? 30,
      armorClass: statblock.ac,
      inventory: [],
      equipped: { attuned: [] },
      resources: [],
      appliedConditions: [],
      knownSpells: [],
      preparedSpells: [],
      spellSlotsUsed: {},
      pactSlotsUsed: 0,
      usedFreeCastSpellIds: [],
      weaponMasteries: [],
      triggerCounters: {},
      featsTaken: [],
      pendingChoiceIds: [],
      breathWeaponExpended: false,
      heroicInspiration: false,
      damageTypesTakenThisTurn: [],
      heroPoints: 0,
      xp: 0,
      moraleBroken: false,
    };
    events.push({
      id: newEventId() as ULID,
      at,
      type: 'CharacterCreated',
      snapshot,
    });
  }
  return events;
};

const fireTrigger = (
  effect: OnEventEffect,
  character: Character,
  triggerId: string,
  event: Event,
  rng: RNG,
  at: string,
  currentRound: number | undefined,
  parentEffectInstanceId: string | undefined,
  state: CampaignState,
  content: ResolvedContent,
  sourceIsMagical: boolean,
  forgoDice: number = 0,
  riderDamageDice?: string,
): FiredTrigger | null => {
  const cadence = cadencePayload(effect.oncePer);
  const triggerFired: TriggerFiredEvent = {
    id: newEventId() as ULID,
    at,
    type: 'TriggerFired',
    characterId: character.id as ULID,
    triggerId,
    cadence,
  };
  const events: Event[] = [triggerFired];

  for (const action of effect.actions) {
    if (action.kind === 'AddDamage') {
      events.push(
        ...fireAddDamage({
          action,
          event,
          rng,
          causedByEventId: triggerFired.id,
          state,
          content,
          sourceIsMagical,
          forgoDice: action.cunningStrikeEligible === true ? forgoDice : 0,
          ...(riderDamageDice !== undefined ? { diceOverride: riderDamageDice } : {}),
        }),
      );
    } else if (action.kind === 'AddDamageToAttacker') {
      events.push(
        ...fireAddDamageToAttacker({
          action,
          event,
          rng,
          causedByEventId: triggerFired.id,
          state,
          content,
          sourceIsMagical,
        }),
      );
    } else if (action.kind === 'ApplyCondition') {
      events.push(
        ...fireApplyCondition(
          action,
          event,
          character.id,
          triggerFired.id,
          currentRound,
          parentEffectInstanceId,
        ),
      );
    } else if (action.kind === 'ApplyConditionToAttacker') {
      events.push(
        ...fireApplyConditionToAttacker(
          action,
          event,
          character.id,
          triggerFired.id,
          currentRound,
          parentEffectInstanceId,
        ),
      );
    } else if (action.kind === 'SpawnCreature') {
      events.push(...fireSpawnCreature(action, content, at));
    } else if (action.kind === 'GrantTempHP') {
      const amount = typeof action.amount === 'number'
        ? action.amount
        : evaluateFormula(action.amount, buildFormulaContext(character));
      if (amount > 0) {
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'TempHPGranted',
          targetId: character.id as ULID,
          amount,
          source: triggerId,
        } satisfies TempHPGrantedEvent);
      }
    } else if (action.kind === 'PushTarget') {
      // Slice 516: emit CreaturePushed targeting the triggering event's
      // target (AttackRolled and DamageApplied both carry `targetId`).
      // The engine doesn't model positions; the event is informational
      // for consumers to apply the position change. Canonical user:
      // Warlock Repelling Blast.
      const targetId = (event as { targetId?: string }).targetId;
      if (targetId !== undefined && action.distanceFeet > 0) {
        events.push({
          id: newEventId() as ULID,
          at,
          type: 'CreaturePushed',
          targetId: targetId as ULID,
          distanceFeet: action.distanceFeet,
          sourceCharacterId: character.id as ULID,
          source: triggerId,
          causedByEventId: triggerFired.id,
        });
      }
    }
  }
  return { events, triggerId, cadence };
};

const triggerIdOf = (effect: OnEventEffect, characterId: string): string => {
  const explicit = (effect as OnEventEffect & { id?: string }).id;
  if (typeof explicit === 'string') return `${characterId}:${explicit}`;
  const filterHash = JSON.stringify(effect.trigger);
  return `${characterId}:${effect.trigger.eventType}:${filterHash}`;
};

// When an OnEvent with `consumeOnTrigger: true` fires, locate the parent
// condition (the one whose effects array contains the OnEvent) and emit
// the right cleanup event. If a concentration effect is tracking the
// applied condition, emit `ConcentrationBroken` (reason: 'used') so the
// existing cascade in `clearConcentrationEffect` lifts the condition for
// us. Otherwise emit a stand-alone `ConditionRemoved`. Used by the
// smite-pattern spells (Searing/Wrathful/Thunderous/Branding Smite, etc.)
// whose RAW says "the spell ends after the next hit".
const buildConsumeEvents = (input: {
  character: Character;
  content: ResolvedContent;
  effectInstances: Readonly<CampaignState['effectInstances']>;
  onEventId: string | undefined;
  triggerFiredId: string;
  at: string;
}): Event[] => {
  const { character, content, effectInstances, onEventId, triggerFiredId, at } = input;
  if (onEventId === undefined) return [];

  const parent = character.appliedConditions.find((applied) => {
    const def = content.conditions.get(applied.conditionId);
    return def?.effects.some((e) => e.kind === 'OnEvent' && e.id === onEventId) === true;
  });
  if (parent === undefined) return [];

  for (const instance of Object.values(effectInstances)) {
    if (instance.casterId !== character.id) continue;
    if (!instance.requiresConcentration) continue;
    if (!instance.conditionsApplied.some((c) => c.appliedConditionId === parent.id)) continue;
    const broken: ConcentrationBrokenEvent = {
      id: newEventId() as ULID,
      at,
      type: 'ConcentrationBroken',
      effectInstanceId: instance.id,
      casterId: character.id as ULID,
      reason: 'used',
      causedByEventId: triggerFiredId as ULID,
    };
    return [broken];
  }

  const removed: ConditionRemovedEvent = {
    id: newEventId() as ULID,
    at,
    type: 'ConditionRemoved',
    targetId: character.id as ULID,
    conditionId: parent.conditionId,
    causedByEventId: triggerFiredId as ULID,
  };
  return [removed];
};

export interface DispatchInput {
  readonly state: CampaignState;
  readonly content: ResolvedContent;
  readonly rng: RNG;
  readonly event: Event;
  readonly at: string;
  // Rogue Cunning Strike: the effects the attacker chose to add to this
  // attack's Sneak Attack. The dispatcher forgoes their combined die cost
  // from the `cunningStrikeEligible` Sneak Attack rider and emits the
  // effects right after the damage. Applies only to the attacker's own
  // sneak-attack trigger.
  readonly cunningStrike?: ReadonlyArray<CunningStrikeOption>;
}

// Locates the AppliedCondition (if any) that contributed the given
// OnEvent effect, so dispatch can populate source-aware facts.
// Returns undefined for OnEvent effects from feats / species / class
// features (anything not flowing through `appliedConditions`).
const findAppliedConditionForOnEvent = (
  character: Character,
  content: ResolvedContent,
  onEventId: string | undefined,
): AppliedCondition | undefined => {
  if (onEventId === undefined) return undefined;
  return character.appliedConditions.find((applied) => {
    const def = content.conditions.get(applied.conditionId);
    return def?.effects.some((e) => e.kind === 'OnEvent' && e.id === onEventId) === true;
  });
};

export const dispatchTriggers = (input: DispatchInput): Event[] => {
  const { state, content, rng, event, at } = input;
  const emitted: Event[] = [];
  // Slice 114: maintain a runningState that incorporates each fired
  // trigger's events before the next trigger is evaluated. Lets per-
  // rider interceptFatalDamage see the target's HP after prior riders
  // applied, so Death Ward (and any future fatal-damage primitive)
  // can intercept a rider-alone kill correctly. Also closes a latent
  // gap where rider-consumed conditions were still visible to later
  // riders on the same character.
  let runningState: CampaignState = state;
  const characterIds = Object.keys(state.characters);
  for (const characterId of characterIds) {
    const character = runningState.characters[characterId];
    if (character === undefined) continue;
    const currentRound = runningState.activeEncounterId
      ? runningState.encounters[runningState.activeEncounterId]?.round
      : undefined;
    const effects = collectEffectsFromCharacter({
      character,
      content,
      itemInstances: runningState.itemInstances,
      pendingChoices: runningState.pendingChoices,
    });
    for (const effect of effects) {
      if (effect.kind !== 'OnEvent') continue;
      if (effect.trigger.eventType !== event.type) continue;
      // Re-resolve the character against the running state so the
      // appliedConditions reflect prior in-dispatch mutations (e.g.
      // a consumeOnTrigger removal earlier in the loop).
      const currentCharacter = runningState.characters[characterId];
      if (currentCharacter === undefined) break;
      const appliedFrom = findAppliedConditionForOnEvent(currentCharacter, content, effect.id);
      const facts = buildEventFacts(event, characterId, appliedFrom, runningState, content);
      const filter = effect.trigger.filter as Predicate | undefined;
      if (filter !== undefined && !evaluatePredicate(filter, { facts })) continue;
      const triggerId = triggerIdOf(effect, characterId);
      if (!cadenceAllowsFiring(currentCharacter, triggerId, effect.oncePer)) continue;
      // Slice 110: if the OnEvent rider lives inside a condition that
      // an EffectInstance is tracking, stamp that instance id onto any
      // ApplyCondition events the rider emits.
      const parentEffectInstanceId = appliedFrom
        ? Object.values(runningState.effectInstances).find((inst) =>
            inst.conditionsApplied.some((c) => c.appliedConditionId === appliedFrom.id),
          )?.id
        : undefined;
      // Slice 113: rider-damage magicality for the mitigation pipeline.
      const sourceIsMagical = isRiderMagical(runningState, content, event, appliedFrom);
      // Rogue Cunning Strike: when the attacker chose effects and this is
      // their own `cunningStrikeEligible` Sneak Attack rider, forgo the
      // chosen effects' combined die cost before rolling, then emit the
      // effects after the damage.
      const cunningStrikeApplies =
        input.cunningStrike !== undefined &&
        input.cunningStrike.length > 0 &&
        event.type === 'AttackRolled' &&
        characterId === event.attackerId &&
        effect.actions.some((a) => a.kind === 'AddDamage' && a.cunningStrikeEligible === true);
      const forgoDice = cunningStrikeApplies ? cunningStrikeForgoDice(input.cunningStrike!) : 0;
      const fired = fireTrigger(
        effect,
        currentCharacter,
        triggerId,
        event,
        rng,
        at,
        currentRound,
        parentEffectInstanceId,
        runningState,
        content,
        sourceIsMagical,
        forgoDice,
        appliedFrom?.riderDamageDice,
      );
      if (fired === null) continue;
      emitted.push(...fired.events);
      runningState = applyAll(runningState, fired.events);
      if (cunningStrikeApplies && event.type === 'AttackRolled') {
        const csEvents = buildCunningStrikeEffects({
          state: runningState,
          content,
          rng,
          at,
          rogue: currentCharacter,
          targetId: event.targetId,
          effects: input.cunningStrike!,
        });
        emitted.push(...csEvents);
        runningState = applyAll(runningState, csEvents);
      }
      if (effect.consumeOnTrigger === true) {
        const triggerFiredId = fired.events[0]?.id;
        if (triggerFiredId !== undefined) {
          const consumeEvents = buildConsumeEvents({
            character: runningState.characters[characterId] ?? currentCharacter,
            content,
            effectInstances: runningState.effectInstances,
            onEventId: effect.id,
            triggerFiredId,
            at,
          });
          emitted.push(...consumeEvents);
          if (consumeEvents.length > 0) {
            runningState = applyAll(runningState, consumeEvents);
          }
        }
      }
    }
  }
  return emitted;
};
