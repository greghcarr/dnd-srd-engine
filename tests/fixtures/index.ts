import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadContentPack, resolveContent, type ContentPack } from '../../src/content/pack.js';
import { CharacterSchema, type Character } from '../../src/schemas/runtime/character.js';
import {
  ItemInstanceSchema,
  type ItemInstance,
} from '../../src/schemas/runtime/item-instance.js';
import { newCharacterId, newItemInstanceId } from '../../src/ids.js';
import { ulid } from 'ulid';

const HERE = dirname(fileURLToPath(import.meta.url));

export const TEST_PACK: ContentPack = loadContentPack(
  JSON.parse(readFileSync(resolve(HERE, 'content/test-pack.json'), 'utf8')),
);

export const TEST_CONTENT = resolveContent([TEST_PACK]);

// The non-SRD mechanical shapes (XGE/TCE spells + their conditions + the
// Dueling/Protection fighting styles) the engine genuinely needs to test
// its planners (absorb-elements, thunder-step, elemental-weapon) and the
// fighting-style mechanics. Kept here as a test fixture, NOT shipped as a
// content product: the engine ships SRD-only (slices 401-403), and a
// consumer's real non-SRD / homebrew packs live in the gitignored
// content-packs/ folder (see content-packs/README.md). Mechanics-only; no
// WotC descriptive text. Load alongside the starter pack:
// `createEngine({ contentPacks: [loadStarterPack(), loadPhbExtrasTestPack()] })`.
export const loadPhbExtrasTestPack = (): ContentPack =>
  loadContentPack(
    JSON.parse(readFileSync(resolve(HERE, 'content/phb-extras-test-pack.json'), 'utf8')),
  );

export interface BuildFighterOptions {
  readonly level?: number;
  readonly hpMax?: number;
  readonly hpCurrent?: number;
  readonly hpTemp?: number;
  readonly STR?: number;
  readonly DEX?: number;
  readonly CON?: number;
  readonly INT?: number;
  readonly WIS?: number;
  readonly CHA?: number;
  readonly armorInstanceId?: string;
  readonly shieldInstanceId?: string;
  readonly exhaustion?: number;
  readonly hitDiceRemaining?: number;
  readonly resources?: ReadonlyArray<{ resourceId: string; current: number; max: number }>;
  readonly name?: string;
  // Slice 259: item instance ids to seed the character's `inventory`
  // and (optionally) the `equipped.attuned` list. Previously tests
  // using planUseItem / planConsumeItem with a fixture-built
  // character had to spread + add inventory manually (`const hero =
  // { ...buildFighter(), inventory: [item.id] }`); slice 256's
  // ItemDestroyed reducer test hit this. `attunedInstanceIds`
  // defaults to empty; pass instance ids here for items that
  // require attunement (slice 132 magic-item projection skips
  // attunement-required items not in `equipped.attuned`).
  readonly inventory?: ReadonlyArray<string>;
  readonly attunedInstanceIds?: ReadonlyArray<string>;
  // Slice 502: weapon definition ids this fighter has mastered for the
  // 2024 Weapon Mastery feature. A weapon's mastery property only applies
  // when its kind is here (and the fighter is proficient). Defaults empty.
  readonly weaponMasteries?: ReadonlyArray<string>;
}

const FIGHTER_DEFAULT_HP_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 12,
  2: 19,
  3: 26,
  4: 33,
  5: 40,
};

export const buildFighter = (opts: BuildFighterOptions = {}): Character => {
  const level = opts.level ?? 1;
  const hpMax = opts.hpMax ?? FIGHTER_DEFAULT_HP_BY_LEVEL[level] ?? 12;
  const character = CharacterSchema.parse({
    id: newCharacterId(),
    name: opts.name ?? 'Test Fighter',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [
      {
        classId: 'fighter',
        level,
        hitDiceRemaining: opts.hitDiceRemaining ?? level,
      },
    ],
    resources: opts.resources ?? [],
    abilityScores: {
      STR: opts.STR ?? 16,
      DEX: opts.DEX ?? 14,
      CON: opts.CON ?? 14,
      INT: opts.INT ?? 10,
      WIS: opts.WIS ?? 10,
      CHA: opts.CHA ?? 10,
    },
    hp: {
      current: opts.hpCurrent ?? hpMax,
      max: hpMax,
      temp: opts.hpTemp ?? 0,
    },
    exhaustion: opts.exhaustion ?? 0,
    featsTaken: ['savage-attacker'],
    weaponMasteries: [...(opts.weaponMasteries ?? [])],
    inventory: [...(opts.inventory ?? [])],
    equipped: {
      ...(opts.armorInstanceId !== undefined ? { armor: opts.armorInstanceId } : {}),
      ...(opts.shieldInstanceId !== undefined ? { shield: opts.shieldInstanceId } : {}),
      attuned: [...(opts.attunedInstanceIds ?? [])],
    },
  });
  return character;
};

export const makeItemInstance = (
  definitionId: string,
  overrides: Partial<ItemInstance> = {},
): ItemInstance =>
  ItemInstanceSchema.parse({
    id: newItemInstanceId(),
    definitionId,
    ...overrides,
  });

export interface BuildOgreOptions {
  readonly name?: string;
  readonly hpMax?: number;
  readonly STR?: number;
  readonly mainWeaponInstanceId?: string;
  readonly multiattackCount?: number;
  // Slice 259: same shape as BuildFighterOptions.inventory /
  // attunedInstanceIds; lets creature-side tests seed magic items
  // without manual spread.
  readonly inventory?: ReadonlyArray<string>;
  readonly attunedInstanceIds?: ReadonlyArray<string>;
}

export const buildOgre = (opts: BuildOgreOptions = {}) => {
  const hp = opts.hpMax ?? 68;
  const base = CharacterSchema.parse({
    id: newCharacterId(),
    kind: 'creature',
    name: opts.name ?? 'Ogre',
    statblockId: 'ogre',
    speciesId: 'human',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1, hitDiceRemaining: 1 }],
    abilityScores: { STR: opts.STR ?? 19, DEX: 8, CON: 16, INT: 5, WIS: 7, CHA: 7 },
    hp: { current: hp, max: hp, temp: 0 },
    featsTaken: ['savage-attacker'],
    speedFeet: 40,
    inventory: [...(opts.inventory ?? [])],
    equipped: { attuned: [...(opts.attunedInstanceIds ?? [])] },
    multiattack:
      opts.mainWeaponInstanceId !== undefined
        ? {
            name: 'Greatclub frenzy',
            attacks: [{ weaponInstanceId: opts.mainWeaponInstanceId, count: opts.multiattackCount ?? 2 }],
          }
        : undefined,
  });
  return base;
};

export const isoTimestamp = (offsetMs = 0): string =>
  new Date(1_700_000_000_000 + offsetMs).toISOString();

export const eventId = (): string => ulid();

// Slice 693 / 697: two same-seed runs carry two kinds of volatile-but-not-
// RNG-driven data that defeat a raw JSON compare: (1) entity ids are
// fresh `ulid()`s (timestamp + entropy) each run; (2) engine-planned
// events stamp `at` from the wall clock (`nowIso()`), since the fuzz
// passes no `at`. Neither encodes a decision. `normalizeEvents` interns
// every ULID-shaped token (26-char Crockford base32) to a stable
// positional token and blanks every `at` field, so what remains —
// event types, order, and every RNG-driven value (rolls, damage, chosen
// cells) — still surfaces real divergence. Lets a test assert
// seed-determinism of the *battle*, not of the id/clock space.
//
// Slice 697: intern ulids that appear *inside* a compound string, not just
// whole-string ids. Some ids are `<ulid>:<name>` (e.g. a trigger id
// `<effectInstanceUlid>:sneak-attack`); matching the whole string missed
// the embedded ulid and leaked per-run volatility into the compare.
const ULID_TOKEN = /[0-9A-HJKMNP-TV-Z]{26}/g;
export const normalizeEvents = (events: ReadonlyArray<unknown>): unknown => {
  const interned = new Map<string, string>();
  const internUlid = (ulid: string): string => {
    let token = interned.get(ulid);
    if (token === undefined) {
      token = `ulid#${interned.size}`;
      interned.set(ulid, token);
    }
    return token;
  };
  return JSON.parse(JSON.stringify(events), (key: string, value: unknown) => {
    if (key === 'at') return '<at>';
    if (typeof value === 'string') return value.replace(ULID_TOKEN, internUlid);
    return value;
  });
};
