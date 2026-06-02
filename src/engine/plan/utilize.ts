import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { AbilityScore, Skill } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { planActionCheck } from './_action-check.js';

export interface UtilizeIntent {
  readonly type: 'Utilize';
  readonly characterId: string;
  // Utilize uses STR / DEX / INT depending on the object (RAW: "the
  // GM might call for an ability check based on the object's
  // properties"). Defaults to STR + no skill when omitted.
  readonly ability?: AbilityScore;
  readonly skill?: Skill;
  readonly dc?: number;
  readonly at?: string;
}

// L1 RAW Utilize action (PHB 2024 ch.7 Actions):
//   "You normally interact with an object while doing something
//   else, such as when you draw a sword as part of an attack. When
//   an object requires your action for its use, you take the
//   Utilize action."
//
// Utilize is the action used when an object requires effort beyond a
// free interaction (e.g. cranking a chain hoist, lighting a candle
// in a brisk wind, prying open a stuck door). The roll is a STR /
// DEX / INT check depending on the object. Consumer supplies the
// ability + DC.
export const planUtilize = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: UtilizeIntent,
): ReadonlyArray<Event> =>
  planActionCheck(
    state,
    content,
    rng,
    {
      characterId: intent.characterId,
      ability: intent.ability ?? 'STR',
      ...(intent.skill !== undefined ? { skill: intent.skill } : {}),
      ...(intent.dc !== undefined ? { dc: intent.dc } : {}),
      ...(intent.at !== undefined ? { at: intent.at } : {}),
    },
    'Utilize',
  );
