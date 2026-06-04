// Shared formatter for a single event row in the Event Inspector.
//
// Categorizes events for color-coding (resolution / encounter /
// state-change), produces a one-line preview (type + key fields), and
// renders the full JSON payload in a collapsed <details> below.

import type { Event } from 'dnd-srd-engine';

export type EventCategory = 'resolution' | 'encounter' | 'state-change';

const RESOLUTION_TYPES = new Set<Event['type']>([
  'AttackRolled',
  'DamageRolled',
  'SaveRolled',
  'AbilityCheckRolled',
  'DeathSaveRolled',
  'InitiativeRolled',
  'HitDieSpent',
]);

const ENCOUNTER_TYPES = new Set<Event['type']>([
  'EncounterCreated',
  'EncounterStarted',
  'EncounterEnded',
  'TurnStarted',
  'TurnEnded',
  'RoundEnded',
]);

export const categorize = (event: Event): EventCategory => {
  if (RESOLUTION_TYPES.has(event.type)) return 'resolution';
  if (ENCOUNTER_TYPES.has(event.type)) return 'encounter';
  return 'state-change';
};

// Slice 608: human-readable label for each event type so observers see
// "Attack roll" instead of "AttackRolled". Falls back to a CamelCase
// split for unmapped types so a newly-added event type still reads as
// English ("WeaponLoaded" → "Weapon loaded") without forcing a sync
// update to this table.
const HUMAN_LABELS: Partial<Record<string, string>> = {
  AttackRolled: 'Attack roll',
  DamageRolled: 'Damage roll',
  DamageApplied: 'Damage applied',
  SaveRolled: 'Saving throw',
  AbilityCheckRolled: 'Ability check',
  DeathSaveRolled: 'Death save',
  InitiativeRolled: 'Initiative',
  HitDieSpent: 'Hit die spent',
  TurnStarted: 'Turn started',
  TurnEnded: 'Turn ended',
  RoundEnded: 'Round ended',
  EncounterCreated: 'Encounter created',
  EncounterStarted: 'Encounter started',
  EncounterEnded: 'Encounter ended',
  ConditionApplied: 'Condition applied',
  ConditionRemoved: 'Condition removed',
  ActionEconomyConsumed: 'Action used',
  CombatantMoved: 'Move',
  CombatantPlaced: 'Placed',
  SpellCastDeclared: 'Spell cast',
  SpellSlotConsumed: 'Slot consumed',
  PactSlotConsumed: 'Pact slot consumed',
  FreeCastUsed: 'Free cast',
  ConcentrationStarted: 'Concentration started',
  ConcentrationBroken: 'Concentration broken',
  CharacterCreated: 'Character joined',
  CreatureDestroyed: 'Creature destroyed',
  ItemAcquired: 'Item acquired',
  ItemEquipped: 'Item equipped',
  ItemUnequipped: 'Item unequipped',
  ItemConsumed: 'Item consumed',
  ResourceSpent: 'Resource spent',
  ResourceRestored: 'Resource restored',
  Healed: 'Healed',
  TempHPGranted: 'Temp HP granted',
  ShieldCast: 'Shield',
  GuidanceUsed: 'Guidance',
  AbsorbElementsCast: 'Absorb Elements',
  HeroicInspirationSpent: 'Heroic Inspiration',
  ShortRestStarted: 'Short rest started',
  ShortRestEnded: 'Short rest ended',
  LongRestStarted: 'Long rest started',
  LongRestEnded: 'Long rest ended',
  OpportunityAvailable: 'Opportunity attack offered',
  ChoiceRequired: 'Choice required',
  ChoiceResolved: 'Choice resolved',
  LevelUpResolved: 'Level up',
};

const splitCamelCase = (s: string): string => {
  const spaced = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

export const humanLabel = (type: string): string => HUMAN_LABELS[type] ?? splitCamelCase(type);

// One-line "what happened" preview. Pulls the most relevant fields for
// the type so the user gets a sense of the event without expanding.
// Truthy-only — if a field is undefined, omit it.
const previewFor = (event: Event): string => {
  const e = event as Record<string, unknown> & { type: string };
  const parts: string[] = [];
  const push = (label: string, value: unknown): void => {
    if (value === undefined || value === null || value === '') return;
    parts.push(`${label}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
  };
  switch (e.type) {
    case 'AttackRolled':
      push('total', e.total);
      push('AC', e.targetAC);
      push('hit', e.hit);
      push('d20', e.d20);
      push('used', e.used);
      break;
    case 'DamageRolled':
      push('total', e.total);
      push('rolls', e.rolls);
      break;
    case 'DamageApplied':
      push('amount', e.amount);
      push('target', e.targetId);
      break;
    case 'Healed':
      push('amount', e.amount);
      break;
    case 'ConditionApplied':
      push('cond', e.conditionId);
      break;
    case 'ConditionRemoved':
      push('cond', e.conditionId);
      break;
    case 'ActionEconomyConsumed':
      push('kind', e.kind);
      break;
    case 'CombatantMoved':
      push('to', e.toPosition);
      push('feet', e.feetTraveled);
      break;
    case 'TurnStarted':
    case 'TurnEnded':
      push('combatant', e.combatantId);
      break;
    case 'InitiativeRolled':
      push('rolls', e.rolls);
      break;
    case 'ItemAcquired': {
      // `ItemAcquired` does NOT name an owner — it just registers an
      // item instance in the campaign's item table. Ownership is set
      // by the character snapshot's `inventory` / `equipped` fields in
      // the subsequent `CharacterCreated` event, or moved at runtime
      // by `ItemEquipped` / `ItemUnequipped`. Surface the definition
      // and instance id so the row makes that clear.
      const instance = e.instance as { id?: string; definitionId?: string } | undefined;
      push('def', instance?.definitionId);
      push('instance', instance?.id);
      parts.push('(no owner; minted into world)');
      break;
    }
    case 'ItemEquipped':
      push('character', e.characterId);
      push('slot', e.slot);
      push('instance', e.instanceId);
      break;
    case 'ItemUnequipped':
      push('character', e.characterId);
      push('slot', e.slot);
      break;
    case 'CharacterCreated': {
      const snapshot = e.snapshot as
        | { name?: string; inventory?: ReadonlyArray<string>; equipped?: { mainHand?: string; armor?: string } }
        | undefined;
      push('name', snapshot?.name);
      push('inventory', snapshot?.inventory?.length ?? 0);
      push('mainHand', snapshot?.equipped?.mainHand);
      push('armor', snapshot?.equipped?.armor);
      break;
    }
    default:
      break;
  }
  return parts.join('  ');
};

export const createEventRow = (event: Event, index: number): HTMLLIElement => {
  const li = document.createElement('li');
  const category = categorize(event);
  li.className = `event-row event-${category}`;
  li.innerHTML = `
    <div class="event-line">
      <span class="event-index"></span>
      <span class="event-type"></span>
      <span class="event-preview"></span>
    </div>
    <details>
      <summary>payload</summary>
      <pre class="event-payload"></pre>
    </details>
  `;
  li.querySelector('.event-index')!.textContent = `#${index}`;
  // Slice 608: human label for primary display; the raw type slug stays
  // available as a tooltip for engine-developer debugging.
  const typeEl = li.querySelector<HTMLElement>('.event-type')!;
  typeEl.textContent = humanLabel(event.type);
  typeEl.title = event.type;
  li.querySelector('.event-preview')!.textContent = previewFor(event);
  li.querySelector('.event-payload')!.textContent = JSON.stringify(event, null, 2);
  return li;
};
