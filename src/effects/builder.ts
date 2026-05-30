import type { Effect, ModifierTarget, RollTarget } from '../schemas/effects.js';
import type { AbilityScore, DamageType, Sense, Skill, WeaponMastery } from '../schemas/primitives.js';
import type { Predicate } from '../schemas/predicate.js';
import { evaluatePredicate } from './predicate.js';
import { evaluateFormula, type FormulaContext } from './formula.js';

const modifierKey = (target: ModifierTarget): string => {
  if (typeof target === 'string') return target;
  switch (target.kind) {
    case 'save':
      // Slice 299: `save:*` wildcard mirrors slice-266 RollTarget.
      return `save:${target.ability ?? '*'}`;
    case 'check':
      return `check:${target.ability ?? '*'}`;
    case 'skill':
      return `skill:${target.skill}`;
  }
};

// Slice 299: mirror of `wildcardKeyFor` (RollTarget) for ModifierTarget.
// Returns the wildcard key (`save:*` / `check:*`) when querying a
// specific-ability save/check, so unconditional + wildcard entries
// merge at sum time. Returns undefined for non-wildcard targets and
// for queries already at the wildcard level.
const modifierWildcardKeyFor = (target: ModifierTarget): string | undefined => {
  if (typeof target === 'string') return undefined;
  if (target.kind === 'save' && target.ability !== undefined) return 'save:*';
  if (target.kind === 'check' && target.ability !== undefined) return 'check:*';
  return undefined;
};

const rollKey = (target: RollTarget): string => {
  if (typeof target === 'string') return target;
  switch (target.kind) {
    case 'save':
      // Slice 266: `save:*` is the wildcard key (no ability specified).
      // Stored under that key; queried as part of any specific-ability
      // save lookup via `wildcardKeyFor`.
      return `save:${target.ability ?? '*'}`;
    case 'check':
      return `check:${target.ability ?? '*'}`;
    case 'skill':
      return `skill:${target.skill}`;
  }
};

// Slice 266: when querying advantage for a specific-ability save or
// check, ALSO look up the wildcard `save:*` / `check:*` entries so a
// no-ability SetAdvantage (poisoned: disadvantage on any check;
// Mantle of Spell Resistance: advantage on any save vs spells)
// applies to every per-ability query. Returns undefined for queries
// that don't have a wildcard form (attack, damage, initiative,
// skill, or queries already at the wildcard level).
const wildcardKeyFor = (target: RollTarget): string | undefined => {
  if (typeof target === 'string') return undefined;
  if (target.kind === 'save' && target.ability !== undefined) return 'save:*';
  if (target.kind === 'check' && target.ability !== undefined) return 'check:*';
  return undefined;
};

export interface BonusDieContribution {
  readonly source: string;
  readonly dice: string;
  readonly subtract: boolean;
  readonly predicate?: Predicate;
}

export interface ModifierContribution {
  readonly source: string;
  readonly value: number;
  // Slice 115: optional gating predicate. When set, the modifier
  // only contributes if the predicate evaluates true against the
  // caller-supplied facts at query time (Archery's +2 attack only
  // applies on ranged attacks). Unset = always contributes.
  readonly predicate?: Predicate;
}

export interface AdvantageState {
  advantage: boolean;
  disadvantage: boolean;
  autoCrit: boolean;
  autoFail: boolean;
}

const emptyAdvantage = (): AdvantageState => ({
  advantage: false,
  disadvantage: false,
  autoCrit: false,
  autoFail: false,
});

export interface ACOverride {
  readonly base: number | 'dex' | 'con' | 'wis';
  readonly abilityModifiers: ReadonlyArray<AbilityScore>;
  readonly dexCap: number | undefined;
  readonly priority: number;
  readonly source: string;
}

export interface ResourceGrant {
  readonly resourceId: string;
  readonly max: number;
  readonly recharge: string;
  readonly source: string;
}

export class EffectAccumulator {
  private readonly modifiers = new Map<string, ModifierContribution[]>();
  // Slice 330: per-roll bonus dice (AddBonusDie), keyed like `modifiers`.
  private readonly bonusDice = new Map<string, BonusDieContribution[]>();
  private readonly advantages = new Map<string, AdvantageState>();
  // Slice 258: SetAdvantage entries that carry a predicate (e.g. Mantle
  // of Spell Resistance's "advantage on saves vs spells" gated on
  // `event.isSpellSave === true`). Kept distinct from the unpredicated
  // `advantages` map so the existing fast path (no predicate) doesn't
  // pay any evaluation cost. `advantageFor()` merges both: unpredicated
  // state plus filtered-by-fact predicated entries. Same shape used by
  // `conditionImmunities` (slice 66) and `disadvantageOnAttackersEntries`
  // (slice 91).
  private readonly predicatedAdvantages = new Map<
    string,
    Array<{ mode: 'advantage' | 'disadvantage' | 'auto-crit' | 'auto-fail'; predicate: Predicate }>
  >();
  // Per-source advantage overrides indexed by `${rollKey}::${sourceCharacterId}`.
  // Recorded by `SetAdvantageVsSource` effects (Bestow Curse's attack-
  // disadvantage variant); queried by consumers that know the relevant
  // counterparty id (the attack planner with the target's id).
  private readonly advantagesVsSource = new Map<string, AdvantageState>();
  // Slice 231: bearer-side advantage that applies when the roll's
  // counterparty carries a specified condition with sourceCharacterId
  // equal to the bearer. Indexed by rollKey; the entry carries the
  // conditionId and mode. The consumer (planAttack) reads the entries
  // for the relevant roll target, checks the counterparty's
  // appliedConditions, and folds the advantage in when the 3-way join
  // matches. Canonical user: Ranger L17 Precise Hunter via
  // `hunters-mark-active`.
  private readonly advantagesVsBearersOfMyCondition = new Map<
    string,
    Array<{ conditionId: string; mode: AdvantageState }>
  >();
  // Slice 112: per-type resistance entries with optional qualifier.
  // No qualifier means the resistance always applies. A 'nonmagical'
  // qualifier means the resistance applies only when the incoming
  // damage source is non-magical (Stoneskin in SRD form, the common
  // monster "resistance to B/P/S from nonmagical attacks" trait).
  // A 'magical' qualifier means the resistance applies only when the
  // source IS magical. Resistance from multiple entries stacks via
  // any-match semantics: if any matching entry fires, the damage is
  // halved (resistance doesn't compound).
  //
  // Slice 262: optional `predicate` on each entry, evaluated against
  // caller-supplied facts at hasResistance() time. Same plumbing
  // shape as slice 258's SetAdvantage predicates. 0 pack entries set
  // `condition` on GrantResistance today; this closes the audit gap
  // categorically (pattern-check applied per the slice-261 norm).
  private readonly resistances = new Map<DamageType | 'all', Array<{ qualifier?: 'nonmagical' | 'magical'; predicate?: Predicate }>>();
  private readonly immunities = new Set<DamageType | 'all'>();
  private readonly vulnerabilities = new Set<DamageType>();
  // Per-condition lists of immunity entries. Entries with no predicate
  // grant immunity unconditionally (Aura of Courage's Frightened
  // immunity, Freedom of Movement's paralyzed immunity). Entries with
  // a predicate grant immunity only when the predicate evaluates true
  // against the caller-supplied source facts (Protection from Evil and
  // Good's charmed / frightened arm gated on the source being one of
  // the six warded creature types).
  private readonly conditionImmunities = new Map<string, Array<{ predicate?: Predicate }>>();
  private readonly acOverrides: ACOverride[] = [];
  private readonly acFloors: { value: number; source: string }[] = [];
  private readonly abilityScoreFloors = new Map<AbilityScore, { value: number; source: string }[]>();
  // Slice 308. Additive ability-score increases (Ioun Stones, Belt of
  // Dwarvenkind Toughness). Multiple sources on the same ability sum
  // their amounts and cap at the lowest `max` (the realistic case is
  // a single +2-to-max-20 stone; summing handles the rare stack).
  private readonly abilityScoreIncreases = new Map<AbilityScore, { amount: number; max: number }[]>();
  private readonly regenerationEntries: Array<{ perTurn: number; suppressedBy: DamageType[] }> = [];
  private readonly resourceGrants: ResourceGrant[] = [];
  // Slice 502: 2024 Weapon Mastery grants. `weaponMasterySlotMax` is the
  // largest slot count any grant confers (the number of weapon kinds the
  // character may choose; single-class case = that class's count).
  // `grantedMasteries` is the union of mastery properties the grants make
  // available (every martial class grants all 8 today, but a future
  // restricted-pool grant would narrow it). The selection planner reads
  // both to validate a choice; the gate keys on the chosen weapon ids.
  private weaponMasterySlotMax = 0;
  private readonly grantedMasteries = new Set<WeaponMastery>();
  // Slice 127: granted senses (darkvision / blindsight / tremorsense /
  // truesight). Stored as sense -> max-range (feet) where multiple
  // grants of the same sense take the larger range (RAW: a dwarf
  // with 60 ft darkvision who multiclasses into Warlock and gains
  // Devil's Sight 120 ft keeps the 120 ft figure, not the sum).
  // Mirror Image and similar vision-gated effects query this.
  private readonly senseGrants = new Map<Sense, number>();
  private readonly proficiencies = new Map<string, 'half' | 'proficient' | 'expertise'>();
  private readonly actionEconomyMods = new Map<'extraAttack' | 'extraAction' | 'extraBonusAction', number>();
  // Slice 262: predicated ModifyActionEconomy entries, evaluated at
  // actionEconomyTotal() time. Kept distinct from the unconditional
  // map so the existing fast path pays no evaluation cost. Mirror of
  // slice 258's `predicatedAdvantages` shape.
  private readonly predicatedActionEconomy = new Map<
    'extraAttack' | 'extraAction' | 'extraBonusAction',
    Array<{ count: number; predicate: Predicate }>
  >();
  private readonly flatDamageReductions = new Map<DamageType, number>();
  private critThresholdValue: number = 20;
  private halfProficiencyBonusFloorFlag: boolean = false;
  private healingBoostFlat: number = 0;
  private healingBoostPerSpellLevel: number = 0;
  private evasionFlag: boolean = false;
  private potentCantripFlag: boolean = false;
  // Slice 505: Wizard L1 Ritual Adept presence marker.
  private ritualAdeptFlag: boolean = false;
  private uncannyDodgeFlag: boolean = false;
  private innateSorcerySpendAlternativeFlag: boolean = false;
  private selfRestorationFlag: boolean = false;
  private maxHealingDiceFlag: boolean = false;
  private unarmedAsMagicalFlag: boolean = false;
  private divineInterventionWishFlag: boolean = false;
  private auraRangeBonusTotal: number = 0;
  private grantedSpellEntries: Array<{
    spellId: string;
    preparation: 'always-prepared' | 'prepared' | 'known' | 'at-will' | 'oncePerLongRest' | 'oncePerShortRest';
    spellcastingAbility?: AbilityScore;
  }> = [];
  // Slice 119: marker for the Two-Weapon Fighting Fighting Style.
  // When set, planOffHandAttack adds the wielder's ability mod to
  // off-hand damage even when positive (RAW: only negative mods
  // apply by default).
  private twoWeaponFightingFlag: boolean = false;
  // Slice 120: marker for the Protection Fighting Style. When set,
  // planProtection lets the bearer spend their reaction to impose
  // disadvantage on an attack against a nearby ally (shield required;
  // engine doesn't enforce position).
  private protectionFightingStyleFlag: boolean = false;
  // Slice 121: marker for the Great Weapon Fighting Fighting Style.
  // When set, planAttack replaces any 1 or 2 on the weapon damage
  // dice with 3, gated on a two-handed melee wield.
  private greatWeaponFightingFlag: boolean = false;

  addModifier(target: ModifierTarget, value: number, source: string, predicate?: Predicate): void {
    const key = modifierKey(target);
    let list = this.modifiers.get(key);
    if (list === undefined) {
      list = [];
      this.modifiers.set(key, list);
    }
    list.push(predicate !== undefined ? { source, value, predicate } : { source, value });
  }

  // Slice 330: per-roll bonus dice (Bless / Bane via AddBonusDie). Stored
  // unrolled; the planner queries `bonusDiceFor` at roll time and rolls
  // each die fresh (RNG stays in the planner).
  addBonusDie(target: ModifierTarget, dice: string, subtract: boolean, source: string, predicate?: Predicate): void {
    const key = modifierKey(target);
    let list = this.bonusDice.get(key);
    if (list === undefined) {
      list = [];
      this.bonusDice.set(key, list);
    }
    list.push({ source, dice, subtract, ...(predicate !== undefined ? { predicate } : {}) });
  }

  // The bonus dice that apply to a roll against `target`, merging the
  // wildcard bucket (`save:*` / `check:*`) the same way `modifierSum`
  // does, and dropping predicated entries whose gate fails.
  bonusDiceFor(target: ModifierTarget, facts?: ReadonlyMap<string, unknown>): ReadonlyArray<BonusDieContribution> {
    const filter = (list: BonusDieContribution[] | undefined): BonusDieContribution[] =>
      list === undefined
        ? []
        : list.filter((c) => c.predicate === undefined || evaluatePredicate(c.predicate, { facts }));
    const base = filter(this.bonusDice.get(modifierKey(target)));
    const wildcardKey = modifierWildcardKeyFor(target);
    if (wildcardKey === undefined) return base;
    return [...base, ...filter(this.bonusDice.get(wildcardKey))];
  }

  setAdvantage(
    target: RollTarget,
    mode: 'advantage' | 'disadvantage' | 'auto-crit' | 'auto-fail',
    predicate?: Predicate,
  ): void {
    const key = rollKey(target);
    if (predicate !== undefined) {
      // Slice 258: predicated entry, evaluated at `advantageFor()` time
      // against caller-supplied facts.
      let list = this.predicatedAdvantages.get(key);
      if (list === undefined) {
        list = [];
        this.predicatedAdvantages.set(key, list);
      }
      list.push({ mode, predicate });
      return;
    }
    let state = this.advantages.get(key);
    if (state === undefined) {
      state = emptyAdvantage();
      this.advantages.set(key, state);
    }
    if (mode === 'advantage') state.advantage = true;
    else if (mode === 'disadvantage') state.disadvantage = true;
    else if (mode === 'auto-crit') state.autoCrit = true;
    else state.autoFail = true;
  }

  setAdvantageVsSource(
    target: RollTarget,
    sourceCharacterId: string,
    mode: 'advantage' | 'disadvantage' | 'auto-crit' | 'auto-fail',
  ): void {
    const key = `${rollKey(target)}::${sourceCharacterId}`;
    let state = this.advantagesVsSource.get(key);
    if (state === undefined) {
      state = emptyAdvantage();
      this.advantagesVsSource.set(key, state);
    }
    if (mode === 'advantage') state.advantage = true;
    else if (mode === 'disadvantage') state.disadvantage = true;
    else if (mode === 'auto-crit') state.autoCrit = true;
    else state.autoFail = true;
  }

  // Slice 231: records an entry stating that on rolls of `target`,
  // when the counterparty carries an active condition with the named
  // id whose source is this bearer, apply the advantage mode. The
  // consumer (planAttack) queries via `advantageVsBearersOfMyCondition`
  // below at attack-resolution time.
  addAdvantageVsBearersOfMyCondition(
    target: RollTarget,
    conditionId: string,
    mode: 'advantage' | 'disadvantage' | 'auto-crit' | 'auto-fail',
  ): void {
    const key = rollKey(target);
    const entries = this.advantagesVsBearersOfMyCondition.get(key) ?? [];
    const advState = emptyAdvantage();
    if (mode === 'advantage') advState.advantage = true;
    else if (mode === 'disadvantage') advState.disadvantage = true;
    else if (mode === 'auto-crit') advState.autoCrit = true;
    else advState.autoFail = true;
    entries.push({ conditionId, mode: advState });
    this.advantagesVsBearersOfMyCondition.set(key, entries);
  }

  addResistance(
    type: DamageType | 'all',
    qualifier?: 'nonmagical' | 'magical',
    predicate?: Predicate,
  ): void {
    let list = this.resistances.get(type);
    if (list === undefined) {
      list = [];
      this.resistances.set(type, list);
    }
    list.push(predicate !== undefined ? { qualifier, predicate } : { qualifier });
  }
  addImmunity(type: DamageType | 'all'): void {
    this.immunities.add(type);
  }
  addVulnerability(type: DamageType): void {
    this.vulnerabilities.add(type);
  }
  addConditionImmunity(id: string, predicate?: Predicate): void {
    let list = this.conditionImmunities.get(id);
    if (list === undefined) {
      list = [];
      this.conditionImmunities.set(id, list);
    }
    list.push({ predicate });
  }
  addACOverride(override: ACOverride): void {
    this.acOverrides.push(override);
  }
  addACFloor(value: number, source: string): void {
    this.acFloors.push({ value, source });
  }
  // Slice 229. Records a floor on an ability score; the highest floor
  // across all sources wins. `effectiveAbilityScoreFloor` returns the
  // highest floor recorded for the given ability, or `undefined` if
  // none. Mirrors the AC-floor shape.
  addAbilityScoreFloor(ability: AbilityScore, value: number, source: string): void {
    const existing = this.abilityScoreFloors.get(ability) ?? [];
    existing.push({ value, source });
    this.abilityScoreFloors.set(ability, existing);
  }
  // Slice 308. Records an additive ability-score increase capped at
  // `max`. `effectiveAbilityScoreIncrease` combines all entries for an
  // ability (sum of amounts, lowest cap).
  addAbilityScoreIncrease(ability: AbilityScore, amount: number, max: number): void {
    const existing = this.abilityScoreIncreases.get(ability) ?? [];
    existing.push({ amount, max });
    this.abilityScoreIncreases.set(ability, existing);
  }
  // Slice 232: records a Regeneration entry. Multiple sources stack
  // additively (rare in RAW, but two unrelated regen traits should
  // both fire). Consumers (the damage reducer for suppression-flag
  // detection; the turn-start planner for the heal emission) read
  // the entries via `regenerations()` below.
  addRegeneration(perTurn: number, suppressedBy: DamageType[]): void {
    this.regenerationEntries.push({ perTurn, suppressedBy });
  }
  addResourceGrant(grant: ResourceGrant): void {
    this.resourceGrants.push(grant);
  }
  addWeaponMasteryGrant(slots: number, masteries: ReadonlyArray<WeaponMastery>): void {
    if (slots > this.weaponMasterySlotMax) this.weaponMasterySlotMax = slots;
    for (const mastery of masteries) this.grantedMasteries.add(mastery);
  }
  addProficiency(
    target: 'skill' | 'tool' | 'weapon' | 'armor' | 'save' | 'language',
    id: string,
    level: 'half' | 'proficient' | 'expertise',
  ): void {
    const key = `${target}:${id}`;
    const existing = this.proficiencies.get(key);
    const rank = { half: 1, proficient: 2, expertise: 3 } as const;
    if (existing === undefined || rank[level] > rank[existing]) {
      this.proficiencies.set(key, level);
    }
  }

  modifierSum(target: ModifierTarget, facts?: ReadonlyMap<string, unknown>): number {
    // Slice 299: a specific-ability save/check query ALSO consumes the
    // wildcard bucket (`save:*` / `check:*`) so a no-ability AddModifier
    // (Stone of Good Luck, Cloak of Protection, Bless / Bane) folds into
    // every per-ability sum. Mirror of slice-266's advantageFor merge.
    const sumList = (list: ModifierContribution[] | undefined): number =>
      list === undefined
        ? 0
        : list.reduce((acc, c) => {
            if (c.predicate !== undefined && !evaluatePredicate(c.predicate, { facts })) {
              return acc;
            }
            return acc + c.value;
          }, 0);
    const base = sumList(this.modifiers.get(modifierKey(target)));
    const wildcardKey = modifierWildcardKeyFor(target);
    if (wildcardKey === undefined) return base;
    return base + sumList(this.modifiers.get(wildcardKey));
  }

  modifierBreakdown(target: ModifierTarget, facts?: ReadonlyMap<string, unknown>): ReadonlyArray<ModifierContribution> {
    // Slice 299: same wildcard merge as `modifierSum`. The breakdown
    // surface is what UIs render as a hover-over tooltip, so each
    // contributing source (specific-ability and wildcard) appears as
    // its own entry rather than being summed up-front.
    const filter = (list: ModifierContribution[] | undefined): ModifierContribution[] =>
      list === undefined
        ? []
        : list.filter((c) => c.predicate === undefined || evaluatePredicate(c.predicate, { facts }));
    const base = filter(this.modifiers.get(modifierKey(target)));
    const wildcardKey = modifierWildcardKeyFor(target);
    if (wildcardKey === undefined) return base;
    return [...base, ...filter(this.modifiers.get(wildcardKey))];
  }

  advantageFor(target: RollTarget, facts?: ReadonlyMap<string, unknown>): AdvantageState {
    const key = rollKey(target);
    const wildcard = wildcardKeyFor(target);
    // Slice 266: merge unconditional entries at both the specific key
    // and the wildcard key (`save:*` / `check:*`). The wildcard set
    // only fires for save/check targets with a specific ability; for
    // other roll kinds it's undefined and the merge is a no-op.
    const merged: AdvantageState = { ...(this.advantages.get(key) ?? emptyAdvantage()) };
    if (wildcard !== undefined) {
      const wild = this.advantages.get(wildcard);
      if (wild !== undefined) {
        merged.advantage = merged.advantage || wild.advantage;
        merged.disadvantage = merged.disadvantage || wild.disadvantage;
        merged.autoCrit = merged.autoCrit || wild.autoCrit;
        merged.autoFail = merged.autoFail || wild.autoFail;
      }
    }
    const predicated = this.predicatedAdvantages.get(key);
    const wildPredicated = wildcard !== undefined ? this.predicatedAdvantages.get(wildcard) : undefined;
    if ((predicated === undefined || predicated.length === 0) && (wildPredicated === undefined || wildPredicated.length === 0)) {
      return merged;
    }
    // Slice 258: fold filtered predicated entries on top of the
    // unconditional state. An entry whose predicate doesn't evaluate
    // true with the caller-supplied facts contributes nothing.
    const foldPredicated = (entries: Array<{ mode: 'advantage' | 'disadvantage' | 'auto-crit' | 'auto-fail'; predicate: Predicate }>): void => {
      for (const entry of entries) {
        if (!evaluatePredicate(entry.predicate, { facts })) continue;
        if (entry.mode === 'advantage') merged.advantage = true;
        else if (entry.mode === 'disadvantage') merged.disadvantage = true;
        else if (entry.mode === 'auto-crit') merged.autoCrit = true;
        else merged.autoFail = true;
      }
    };
    if (predicated !== undefined) foldPredicated(predicated);
    if (wildPredicated !== undefined) foldPredicated(wildPredicated);
    return merged;
  }

  // Per-counterparty advantage state. The bearer's effect stack records
  // `SetAdvantageVsSource` entries keyed on the bearing applied
  // condition's source; the consumer (typically the attack planner)
  // queries this with the relevant counterparty id (the attack's
  // target) and folds the result into the regular advantage resolution.
  advantageVsSource(target: RollTarget, sourceCharacterId: string): AdvantageState {
    const key = `${rollKey(target)}::${sourceCharacterId}`;
    const specific = this.advantagesVsSource.get(key) ?? emptyAdvantage();
    // Slice 266: merge wildcard `save:*::SOURCE` / `check:*::SOURCE`
    // for consistency with `advantageFor`. No current canonical user
    // sets a wildcard SetAdvantageVsSource — pure plumbing parity
    // with `advantageFor` per the slice 261 pattern-check norm.
    const wildcard = wildcardKeyFor(target);
    if (wildcard === undefined) return specific;
    const wild = this.advantagesVsSource.get(`${wildcard}::${sourceCharacterId}`);
    if (wild === undefined) return specific;
    return {
      advantage: specific.advantage || wild.advantage,
      disadvantage: specific.disadvantage || wild.disadvantage,
      autoCrit: specific.autoCrit || wild.autoCrit,
      autoFail: specific.autoFail || wild.autoFail,
    };
  }

  // Slice 231: returns the AdvantageState that applies when this
  // character makes a `target` roll against `counterpartyConditions`
  // (the target character's applied-conditions list) and this
  // character's id is `bearerId`. Walks the bearer's recorded
  // GrantAdvantageVsBearersOfMyCondition entries and folds in those
  // whose conditionId appears on the counterparty with sourceCharacterId
  // matching the bearer.
  advantageVsBearersOfMyCondition(
    target: RollTarget,
    counterpartyConditions: ReadonlyArray<{ conditionId: string; sourceCharacterId?: string }>,
    bearerId: string,
  ): AdvantageState {
    const result = emptyAdvantage();
    // Slice 266: merge entries at both the specific key and the
    // wildcard. No current canonical user sets a wildcard
    // GrantAdvantageVsBearersOfMyCondition — pure plumbing parity
    // with `advantageFor` per the slice 261 pattern-check norm.
    const wildcard = wildcardKeyFor(target);
    const collect = (key: string): void => {
      const entries = this.advantagesVsBearersOfMyCondition.get(key);
      if (entries === undefined || entries.length === 0) return;
      for (const entry of entries) {
        const match = counterpartyConditions.some(
          (c) => c.conditionId === entry.conditionId && c.sourceCharacterId === bearerId,
        );
        if (!match) continue;
        if (entry.mode.advantage) result.advantage = true;
        if (entry.mode.disadvantage) result.disadvantage = true;
        if (entry.mode.autoCrit) result.autoCrit = true;
        if (entry.mode.autoFail) result.autoFail = true;
      }
    };
    collect(rollKey(target));
    if (wildcard !== undefined) collect(wildcard);
    return result;
  }

  // True when this character has any effect that grants attackers
  // advantage against them (Faerie Fire, Restrained, paralyzed-while-
  // attacker-within-5-feet, etc.). Called on the *target's* effect
  // stack by the attack planner.
  grantsAdvantageToAttackers(facts?: ReadonlyMap<string, unknown>): boolean {
    if (this.advantageToAttackersFlag) return true;
    // Slice 262: predicated entries fire when facts say so. No
    // predicated entries (the typical case) → fast path returns the
    // existing flag value above.
    return this.predicatedAdvantageToAttackers.some((entry) =>
      evaluatePredicate(entry.predicate, { facts }),
    );
  }

  markGrantsAdvantageToAttackers(predicate?: Predicate): void {
    if (predicate !== undefined) {
      this.predicatedAdvantageToAttackers.push({ predicate });
      return;
    }
    this.advantageToAttackersFlag = true;
  }

  private advantageToAttackersFlag = false;
  // Slice 262: predicated entries for GrantAdvantageToAttackers,
  // mirroring slice 258's predicatedAdvantages pattern. Unconditional
  // grants (the existing flag) stay on the fast path.
  private readonly predicatedAdvantageToAttackers: Array<{ predicate: Predicate }> = [];

  // Mirror of `grantsAdvantageToAttackers`: true when this character
  // has any effect that imposes disadvantage on incoming attacks
  // (Dodge action's RAW effect, Blur, etc.). Entries optionally carry
  // a predicate (Protection from Evil and Good gates the disadvantage
  // on the attacker's creature type — fiend / undead / etc.) which is
  // evaluated against `attackerFacts` (`attackerCreatureType`, etc.)
  // supplied by the caller. Entries with no predicate always apply.
  imposesDisadvantageOnAttackers(
    attackerFacts?: ReadonlyMap<string, unknown>,
  ): boolean {
    return this.disadvantageOnAttackersEntries.some((entry) => {
      if (entry.predicate === undefined) return true;
      return evaluatePredicate(entry.predicate, { facts: attackerFacts });
    });
  }

  markImposesDisadvantageOnAttackers(predicate?: Predicate): void {
    this.disadvantageOnAttackersEntries.push({ predicate });
  }

  private disadvantageOnAttackersEntries: Array<{ predicate?: Predicate }> = [];

  // Slice 199. While set, any source that would grant an incoming
  // attacker advantage against this character is cancelled (the
  // attacker still rolls; they just don't get the advantage die).
  // Distinct from `imposesDisadvantageOnAttackers`, which contributes
  // disadvantage outright and cancels with attacker-side advantage
  // sources per the 2024 PHB "Advantage and Disadvantage" rule.
  // Entries optionally carry a predicate evaluated against the
  // *bearer's* facts (notably `bearerHasIncapacitated` for Elusive,
  // populated by the attack planner from `findActorBlockingCondition`).
  cancelsAdvantageOnAttackers(
    bearerFacts?: ReadonlyMap<string, unknown>,
  ): boolean {
    return this.cancelAdvantageOnAttackersEntries.some((entry) => {
      if (entry.predicate === undefined) return true;
      return evaluatePredicate(entry.predicate, { facts: bearerFacts });
    });
  }

  markCancelsAdvantageOnAttackers(predicate?: Predicate): void {
    this.cancelAdvantageOnAttackersEntries.push({ predicate });
  }

  private cancelAdvantageOnAttackersEntries: Array<{ predicate?: Predicate }> = [];

  // True when any active effect on this character blocks them from
  // regaining hit points. Heal planners consult this and, when set,
  // emit a Healed event with amount=0 (the reducer's amount<=0
  // early-return makes it a no-op) plus an annotation in `source`.
  // Set by `BlockHealing` effects on applied conditions like Spirit
  // Shroud's `healing-blocked-active`.
  private healingBlockedFlag = false;

  markHealingBlocked(): void {
    this.healingBlockedFlag = true;
  }

  hasHealingBlocked(): boolean {
    return this.healingBlockedFlag;
  }

  // Slice 131: RAW Magic Resistance ("advantage on saves vs spells
  // and other magical effects"). Marker-only; consumers consult
  // hasMagicResistance() and contribute advantage on the save roll
  // when the save's source-is-magical fact is true.
  private magicResistanceFlag = false;

  markMagicResistance(): void {
    this.magicResistanceFlag = true;
  }

  hasMagicResistance(): boolean {
    return this.magicResistanceFlag;
  }

  grantSense(sense: Sense, range: number): void {
    const existing = this.senseGrants.get(sense) ?? 0;
    if (range > existing) this.senseGrants.set(sense, range);
  }

  hasSense(sense: Sense): boolean {
    return (this.senseGrants.get(sense) ?? 0) > 0;
  }

  senseRange(sense: Sense): number {
    return this.senseGrants.get(sense) ?? 0;
  }

  hasResistance(
    type: DamageType,
    sourceIsMagical?: boolean,
    facts?: ReadonlyMap<string, unknown>,
  ): boolean {
    const matches = (
      entries: Array<{ qualifier?: 'nonmagical' | 'magical'; predicate?: Predicate }>,
    ): boolean =>
      entries.some((entry) => {
        // Slice 262: entry-level predicate gates resistance on facts.
        // Unpredicated entries (the slice-112 norm) skip this check.
        if (entry.predicate !== undefined && !evaluatePredicate(entry.predicate, { facts })) {
          return false;
        }
        if (entry.qualifier === undefined) return true;
        if (entry.qualifier === 'nonmagical') return sourceIsMagical !== true;
        return sourceIsMagical === true;
      });
    const typeEntries = this.resistances.get(type);
    if (typeEntries !== undefined && matches(typeEntries)) return true;
    const allEntries = this.resistances.get('all');
    if (allEntries !== undefined && matches(allEntries)) return true;
    return false;
  }
  hasImmunity(type: DamageType): boolean {
    return this.immunities.has(type) || this.immunities.has('all');
  }
  hasVulnerability(type: DamageType): boolean {
    return this.vulnerabilities.has(type);
  }
  hasConditionImmunity(
    id: string,
    sourceFacts?: ReadonlyMap<string, unknown>,
  ): boolean {
    const list = this.conditionImmunities.get(id);
    if (list === undefined) return false;
    return list.some((entry) => {
      if (entry.predicate === undefined) return true;
      return evaluatePredicate(entry.predicate, { facts: sourceFacts });
    });
  }
  effectiveACOverride(): ACOverride | undefined {
    if (this.acOverrides.length === 0) return undefined;
    return this.acOverrides.reduce((best, current) =>
      current.priority > best.priority ? current : best,
    );
  }
  effectiveACFloor(): { value: number; source: string } | undefined {
    if (this.acFloors.length === 0) return undefined;
    return this.acFloors.reduce((best, current) =>
      current.value > best.value ? current : best,
    );
  }
  effectiveAbilityScoreFloor(ability: AbilityScore): { value: number; source: string } | undefined {
    const entries = this.abilityScoreFloors.get(ability);
    if (entries === undefined || entries.length === 0) return undefined;
    return entries.reduce((best, current) => (current.value > best.value ? current : best));
  }
  // Slice 308. Combined additive increase for an ability: sum of all
  // `amount`s, capped at the lowest `max`. Returns undefined when no
  // increase applies. Pass the result as the third arg to
  // effectiveAbilityScore so the floor + increase compose.
  effectiveAbilityScoreIncrease(ability: AbilityScore): { amount: number; max: number } | undefined {
    const entries = this.abilityScoreIncreases.get(ability);
    if (entries === undefined || entries.length === 0) return undefined;
    const amount = entries.reduce((sum, e) => sum + e.amount, 0);
    const max = entries.reduce((lowest, e) => Math.min(lowest, e.max), entries[0]!.max);
    return { amount, max };
  }
  // Slice 232: returns the bearer's Regeneration entries. Empty when
  // the bearer has no Regeneration trait.
  regenerations(): ReadonlyArray<{ perTurn: number; suppressedBy: ReadonlyArray<DamageType> }> {
    return this.regenerationEntries;
  }
  resources(): ReadonlyArray<ResourceGrant> {
    return this.resourceGrants;
  }
  // Slice 502: number of weapon kinds this character may choose for
  // Weapon Mastery (0 = no Weapon Mastery feature). The set of mastery
  // properties those weapons may carry.
  weaponMasterySlots(): number {
    return this.weaponMasterySlotMax;
  }
  grantedWeaponMasteryProperties(): ReadonlySet<WeaponMastery> {
    return this.grantedMasteries;
  }
  proficiencyLevel(target: string, id: string): 'none' | 'half' | 'proficient' | 'expertise' {
    return this.proficiencies.get(`${target}:${id}`) ?? 'none';
  }
  proficienciesByTarget(target: string): ReadonlyArray<{ readonly id: string; readonly level: 'half' | 'proficient' | 'expertise' }> {
    const prefix = `${target}:`;
    const rows: { id: string; level: 'half' | 'proficient' | 'expertise' }[] = [];
    for (const [key, level] of this.proficiencies) {
      if (key.startsWith(prefix)) {
        rows.push({ id: key.slice(prefix.length), level });
      }
    }
    return rows;
  }

  addActionEconomy(
    op: 'extraAttack' | 'extraAction' | 'extraBonusAction',
    count: number,
    predicate?: Predicate,
  ): void {
    if (predicate !== undefined) {
      let list = this.predicatedActionEconomy.get(op);
      if (list === undefined) {
        list = [];
        this.predicatedActionEconomy.set(op, list);
      }
      list.push({ count, predicate });
      return;
    }
    const prior = this.actionEconomyMods.get(op) ?? 0;
    this.actionEconomyMods.set(op, prior + count);
  }
  actionEconomyTotal(
    op: 'extraAttack' | 'extraAction' | 'extraBonusAction',
    facts?: ReadonlyMap<string, unknown>,
  ): number {
    const unconditional = this.actionEconomyMods.get(op) ?? 0;
    const predicated = this.predicatedActionEconomy.get(op);
    if (predicated === undefined || predicated.length === 0) return unconditional;
    return predicated.reduce(
      (acc, entry) =>
        evaluatePredicate(entry.predicate, { facts }) ? acc + entry.count : acc,
      unconditional,
    );
  }
  addFlatDamageReduction(damageType: DamageType, amount: number): void {
    const prior = this.flatDamageReductions.get(damageType) ?? 0;
    this.flatDamageReductions.set(damageType, Math.max(prior, amount));
  }
  flatDamageReductionFor(damageType: DamageType): number {
    return this.flatDamageReductions.get(damageType) ?? 0;
  }
  expandCritRange(threshold: number): void {
    if (threshold < this.critThresholdValue) this.critThresholdValue = threshold;
  }
  critThreshold(): number {
    return this.critThresholdValue;
  }
  markHalfProficiencyBonusFloor(): void {
    this.halfProficiencyBonusFloorFlag = true;
  }
  hasHalfProficiencyBonusFloor(): boolean {
    return this.halfProficiencyBonusFloorFlag;
  }
  addHealingBoost(flat: number, perSpellLevel: number): void {
    this.healingBoostFlat += flat;
    this.healingBoostPerSpellLevel += perSpellLevel;
  }
  healingBoostFor(slotLevel: number): number {
    if (slotLevel <= 0) return 0;
    return this.healingBoostFlat + this.healingBoostPerSpellLevel * slotLevel;
  }
  markEvasion(): void {
    this.evasionFlag = true;
  }
  hasEvasion(): boolean {
    return this.evasionFlag;
  }
  markPotentCantrip(): void {
    this.potentCantripFlag = true;
  }
  // Evoker L3 Potent Cantrip: the caster's damaging cantrips deal half
  // damage on a missed attack or a successful save. Read by cast-spell.
  hasPotentCantrip(): boolean {
    return this.potentCantripFlag;
  }
  markRitualAdept(): void {
    this.ritualAdeptFlag = true;
  }
  // Slice 505: Wizard L1 Ritual Adept. Currently observable only (the
  // cast pathway already permits the underlying behavior — see the
  // GrantRitualAdept schema comment). A future RAW-tightening slice
  // that gates `intent.asRitual` strictly on a ritual-casting feature
  // would consult this accessor.
  hasRitualAdept(): boolean {
    return this.ritualAdeptFlag;
  }
  // Slice 200: marker that gates `planUncannyDodge`. Set by Rogue L5+
  // via the `GrantUncannyDodge` effect on the Uncanny Dodge feature.
  markUncannyDodge(): void {
    this.uncannyDodgeFlag = true;
  }
  hasUncannyDodge(): boolean {
    return this.uncannyDodgeFlag;
  }
  // Slice 201: marker that unlocks the Sorcery-Points alternative
  // cost on `planInnateSorcery`. Set by Sorcerer L7 Sorcery Incarnate
  // via the `GrantInnateSorcerySpendAlternative` effect.
  markInnateSorcerySpendAlternative(): void {
    this.innateSorcerySpendAlternativeFlag = true;
  }
  hasInnateSorcerySpendAlternative(): boolean {
    return this.innateSorcerySpendAlternativeFlag;
  }
  // Slice 202: marker that gates `planSelfRestoration`. Set by Monk
  // L10 Self-Restoration via the `GrantSelfRestoration` effect.
  markSelfRestoration(): void {
    this.selfRestorationFlag = true;
  }
  hasSelfRestoration(): boolean {
    return this.selfRestorationFlag;
  }
  // Slice 205: marker that swaps every healing-dice roll to its max
  // value in cast-spell's heal-mechanic path. Set by Life Domain L17
  // Supreme Healing via the `GrantMaxHealingDice` effect.
  markMaxHealingDice(): void {
    this.maxHealingDiceFlag = true;
  }
  hasMaxHealingDice(): boolean {
    return this.maxHealingDiceFlag;
  }
  // Slice 207: marker that flags the bearer's unarmed strikes as
  // magical for resistance/immunity-piercing purposes. Set by Monk
  // L6 Empowered Strikes via `GrantUnarmedAsMagical`.
  markUnarmedAsMagical(): void {
    this.unarmedAsMagicalFlag = true;
  }
  hasUnarmedAsMagical(): boolean {
    return this.unarmedAsMagicalFlag;
  }
  // Slice 221: marker that unlocks the Wish branch of
  // planDivineIntervention. Set by Cleric L20 Greater Divine
  // Intervention via the `GrantDivineInterventionWish` effect.
  markDivineInterventionWish(): void {
    this.divineInterventionWishFlag = true;
  }
  hasDivineInterventionWish(): boolean {
    return this.divineInterventionWishFlag;
  }
  // Slice 211: additive bonus to every aura the bearer projects.
  // Canonical user: Paladin L18 Aura Expansion (+20 ft). Multiple
  // sources stack additively. The engine doesn't auto-project auras
  // (positions are consumer-side), so this primitive is purely a
  // surfaced accumulator value that consumers (dndbnb / VTTs) read
  // alongside the bearer's `GrantAura` effects.
  addAuraRangeBonus(feet: number): void {
    this.auraRangeBonusTotal += feet;
  }
  auraRangeBonus(): number {
    return this.auraRangeBonusTotal;
  }
  // Slice 212: collected GrantSpell entries from the bearer's effect
  // stack. Canonical users: subclass domain spell lists (Life Domain
  // L3, Circle of the Land L3, Draconic Sorcery L3, Fiend Patron L3,
  // Oath of Devotion L3) and other "extra spell" features (Bard L20
  // Words of Creation, Cleric Divine Order Thaumaturge cantrip).
  // Consumers query `grantedSpells()` to get the full list with
  // preparation/spellcastingAbility metadata; the derive helper
  // `effectiveSpellList` returns a flat string array union'd with
  // `character.preparedSpells` + `character.knownSpells`.
  addGrantedSpell(entry: {
    spellId: string;
    preparation: 'always-prepared' | 'prepared' | 'known' | 'at-will' | 'oncePerLongRest' | 'oncePerShortRest';
    spellcastingAbility?: AbilityScore;
  }): void {
    this.grantedSpellEntries.push(entry);
  }
  grantedSpells(): ReadonlyArray<{
    readonly spellId: string;
    readonly preparation: 'always-prepared' | 'prepared' | 'known' | 'at-will' | 'oncePerLongRest' | 'oncePerShortRest';
    readonly spellcastingAbility?: AbilityScore;
  }> {
    return this.grantedSpellEntries;
  }
  markTwoWeaponFighting(): void {
    this.twoWeaponFightingFlag = true;
  }
  hasTwoWeaponFighting(): boolean {
    return this.twoWeaponFightingFlag;
  }
  markProtectionFightingStyle(): void {
    this.protectionFightingStyleFlag = true;
  }
  hasProtectionFightingStyle(): boolean {
    return this.protectionFightingStyleFlag;
  }
  markGreatWeaponFighting(): void {
    this.greatWeaponFightingFlag = true;
  }
  hasGreatWeaponFighting(): boolean {
    return this.greatWeaponFightingFlag;
  }
}

export interface BuilderContext {
  readonly source: string;
  // When provided, Formula values inside an AddModifier (and similar
  // effects that accept Formula) are evaluated to numbers as the
  // effect is folded into the accumulator. Auras and source-relative
  // modifiers (e.g., +CHA-mod-of-source to ally saves) need this
  // threaded through. Callers that only deal with numeric values can
  // omit it; Formula values then drop silently.
  readonly formulaContext?: FormulaContext;
  // When this effect comes from an AppliedCondition with a stamped
  // `sourceCharacterId`, threading it here lets per-source effect
  // kinds (e.g. SetAdvantageVsSource) attribute their override to the
  // right counterparty. Effects emitted without a bearing condition
  // (class, species, item, feat) leave this undefined; per-source
  // effects in those contexts drop silently.
  readonly sourceCharacterId?: string;
}

export const applyEffectToBuilder = (
  effect: Effect,
  acc: EffectAccumulator,
  ctx: BuilderContext,
): void => {
  switch (effect.kind) {
    case 'AddModifier': {
      if (typeof effect.value === 'number') {
        acc.addModifier(effect.target, effect.value, ctx.source, effect.condition);
      } else if (ctx.formulaContext !== undefined) {
        const value = evaluateFormula(effect.value, ctx.formulaContext);
        acc.addModifier(effect.target, value, ctx.source, effect.condition);
      }
      return;
    }
    case 'AddBonusDie':
      acc.addBonusDie(effect.target, effect.dice, effect.subtract === true, ctx.source, effect.condition);
      return;
    case 'SetAdvantage':
      // Slice 258: thread `effect.condition` so predicated SetAdvantage
      // (e.g. Mantle of Spell Resistance's "advantage on saves vs spells")
      // is honored. Prior to slice 258 the predicate was silently dropped.
      acc.setAdvantage(effect.on, effect.mode, effect.condition);
      return;
    case 'SetAdvantageVsSource':
      if (ctx.sourceCharacterId !== undefined) {
        acc.setAdvantageVsSource(effect.on, ctx.sourceCharacterId, effect.mode);
      }
      return;
    case 'GrantAdvantageVsBearersOfMyCondition':
      acc.addAdvantageVsBearersOfMyCondition(effect.on, effect.conditionId, effect.mode);
      return;
    case 'BlockHealing':
      acc.markHealingBlocked();
      return;
    case 'GrantResistance':
      // Slice 262: thread effect.condition (previously dropped).
      acc.addResistance(effect.damageType, effect.qualifier, effect.condition);
      return;
    case 'GrantImmunity':
      acc.addImmunity(effect.damageType);
      return;
    case 'GrantVulnerability':
      acc.addVulnerability(effect.damageType);
      return;
    case 'GrantConditionImmunity':
      acc.addConditionImmunity(effect.conditionId, effect.condition);
      return;
    case 'GrantMagicResistance':
      acc.markMagicResistance();
      return;
    case 'OverrideACFormula':
      acc.addACOverride({
        base: effect.base,
        abilityModifiers: effect.abilityModifiers,
        dexCap: effect.dexCap,
        priority: effect.priority ?? 0,
        source: ctx.source,
      });
      return;
    case 'SetACFloor':
      acc.addACFloor(effect.value, ctx.source);
      return;
    case 'OverrideAbilityScore':
      acc.addAbilityScoreFloor(effect.ability, effect.value, ctx.source);
      return;
    case 'IncreaseAbilityScore':
      acc.addAbilityScoreIncrease(effect.ability, effect.amount, effect.max);
      return;
    case 'Regeneration':
      acc.addRegeneration(effect.perTurn, effect.suppressedBy);
      return;
    case 'GrantResource':
      if (typeof effect.max === 'number') {
        acc.addResourceGrant({
          resourceId: effect.resourceId,
          max: effect.max,
          recharge: effect.recharge,
          source: ctx.source,
        });
      } else if (ctx.formulaContext !== undefined) {
        acc.addResourceGrant({
          resourceId: effect.resourceId,
          max: evaluateFormula(effect.max, ctx.formulaContext),
          recharge: effect.recharge,
          source: ctx.source,
        });
      }
      return;
    case 'GrantProficiency':
      acc.addProficiency(effect.target, effect.id, effect.level === 'none' ? 'proficient' : effect.level);
      return;
    case 'ModifyActionEconomy':
      // Slice 262: thread effect.condition (previously dropped).
      acc.addActionEconomy(effect.op, effect.count, effect.condition);
      return;
    case 'FlatDamageReduction':
      for (const damageType of effect.damageTypes) {
        acc.addFlatDamageReduction(damageType, effect.amount);
      }
      return;
    case 'ExpandCritRange':
      acc.expandCritRange(effect.threshold);
      return;
    case 'GrantHalfProficiencyBonusFloor':
      acc.markHalfProficiencyBonusFloor();
      return;
    case 'BoostHealing':
      acc.addHealingBoost(effect.flat, effect.perSpellLevel);
      return;
    case 'GrantEvasion':
      acc.markEvasion();
      return;
    case 'GrantPotentCantrip':
      acc.markPotentCantrip();
      return;
    case 'GrantRitualAdept':
      acc.markRitualAdept();
      return;
    case 'GrantFeat':
      // Slice 511: GrantFeat is pre-expanded by `expandGrantFeatEffects`
      // in derive/effect-stack.ts before reaching this switch (cycle
      // protection + feat lookup live there, where the content pack is
      // in scope). A GrantFeat reaching the builder means a caller fed
      // raw (unexpanded) effects in — treat as a no-op so behavior
      // degrades gracefully.
      return;
    case 'GrantUncannyDodge':
      acc.markUncannyDodge();
      return;
    case 'GrantInnateSorcerySpendAlternative':
      acc.markInnateSorcerySpendAlternative();
      return;
    case 'GrantSelfRestoration':
      acc.markSelfRestoration();
      return;
    case 'GrantMaxHealingDice':
      acc.markMaxHealingDice();
      return;
    case 'GrantUnarmedAsMagical':
      acc.markUnarmedAsMagical();
      return;
    case 'GrantDivineInterventionWish':
      acc.markDivineInterventionWish();
      return;
    case 'ExpandAuraRange':
      acc.addAuraRangeBonus(effect.addFeet);
      return;
    case 'GrantTwoWeaponFighting':
      acc.markTwoWeaponFighting();
      return;
    case 'GrantProtectionFightingStyle':
      acc.markProtectionFightingStyle();
      return;
    case 'GrantGreatWeaponFighting':
      acc.markGreatWeaponFighting();
      return;
    case 'GrantAdvantageToAttackers':
      // Slice 262: thread effect.condition (previously dropped).
      acc.markGrantsAdvantageToAttackers(effect.condition);
      return;
    case 'ImposeDisadvantageOnAttackers':
      acc.markImposesDisadvantageOnAttackers(effect.condition);
      return;
    case 'CancelAdvantageOnAttackers':
      acc.markCancelsAdvantageOnAttackers(effect.condition);
      return;
    case 'GrantSense':
      acc.grantSense(effect.sense, effect.range);
      return;
    case 'GrantSpell':
      acc.addGrantedSpell({
        spellId: effect.spellId,
        preparation: effect.preparation,
        ...(effect.spellcastingAbility !== undefined
          ? { spellcastingAbility: effect.spellcastingAbility }
          : {}),
      });
      return;
    case 'GrantWeaponMastery':
      // Slice 502: project the Weapon Mastery grant so the selection
      // planner + the per-attack gate can read the budget and the
      // available mastery pool. Multiple grants take the largest slot
      // count (Fighter's L4/L10/L16 bumps) and union their property pools.
      acc.addWeaponMasteryGrant(effect.slots, effect.masteries);
      return;
    case 'ModifySpeed':
    case 'GrantSpellSlots':
    case 'OnEvent':
    case 'RecoverResource':
    case 'GrantAction':
    case 'ExpandSpellList':
    case 'SetHPMaxFormula':
    case 'OfferChoice':
    case 'GrantAura':
    case 'GrantFallingProtection':
    case 'PreventFatalDamage':
    case 'PreventFatalDamageOnSave':
    case 'PreventFatalDamageConsumingResource':
    case 'Custom':
      return;
    default: {
      const _exhaustive: never = effect;
      void _exhaustive;
      return;
    }
  }
};
