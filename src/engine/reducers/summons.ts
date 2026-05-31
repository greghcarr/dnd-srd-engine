import type { Draft } from 'immer';
import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { Character } from '../../schemas/runtime/character.js';
import type {
  CompanionSummonedEvent,
  CompanionDismissedEvent,
} from '../../schemas/events/summons.js';
import { invariant } from '../../internal/invariants.js';

// Default ability scores for a summoned companion when the spell
// mechanic doesn't supply them. 2024 RAW summon statblocks all
// publish their own scores, but the engine doesn't need them to
// resolve the spell event chain — the companion exists primarily so
// the consumer can drive attacks / saves via the standard planners
// using the companion as the actor. Mid-range defaults keep
// downstream derivations sane.
const DEFAULT_COMPANION_ABILITIES = {
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
} as const;

export const applyCompanionSummoned = (
  state: Draft<CampaignState>,
  event: CompanionSummonedEvent,
): void => {
  invariant(
    state.characters[event.controllerId] !== undefined,
    `Controller ${event.controllerId} not found`,
  );
  invariant(
    state.characters[event.companionId] === undefined,
    `Companion ${event.companionId} already exists`,
  );
  const companion: Character = {
    id: event.companionId,
    kind: 'creature',
    name: event.name,
    speciesId: 'companion',
    backgroundId: 'companion',
    classes: [{ classId: 'companion', level: 1, hitDiceRemaining: 1 }],
    abilityScores: DEFAULT_COMPANION_ABILITIES,
    hp: { current: event.hp, max: event.hp, temp: 0, maxBonus: 0 },
    deathSaves: { successes: 0, failures: 0, stable: false },
    exhaustion: 0,
    speedFeet: event.speedFeet,
    armorClass: event.ac,
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
    summonSource: {
      controllerId: event.controllerId,
      spellId: event.spellId,
      slotLevel: event.slotLevel,
      ...(event.effectInstanceId !== undefined
        ? { effectInstanceId: event.effectInstanceId }
        : {}),
    },
  };
  state.characters[event.companionId] = companion;
};

export const applyCompanionDismissed = (
  state: Draft<CampaignState>,
  event: CompanionDismissedEvent,
): void => {
  // Tolerant: silently no-op on missing companion. A companion can
  // be dismissed via concentration cleanup before an explicit
  // CompanionDismissed reaches the reducer.
  delete state.characters[event.companionId];
};
