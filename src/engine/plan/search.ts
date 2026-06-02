import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { Skill } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { planActionCheck } from './_action-check.js';

export interface SearchIntent {
  readonly type: 'Search';
  readonly characterId: string;
  // Search defaults to a Wisdom check, but RAW lists several skills
  // that can apply (Insight / Medicine / Perception / Survival).
  // Consumer chooses; defaults to Perception when omitted.
  readonly skill?: Skill;
  readonly dc?: number;
  readonly at?: string;
}

// L1 RAW Search action (PHB 2024 ch.7 Actions):
//   "When you take the Search action, you make a Wisdom check to
//   discern something that isn't obvious. The Search Action table
//   lists skills with which you might be asked to make this check,
//   along with examples of what each skill might be used to discern."
//
// Planner consumes the Action and emits an AbilityCheckRolled
// (WIS, optional skill / DC). The consumer chooses which skill from
// the RAW table (Insight / Medicine / Perception / Survival).
export const planSearch = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: SearchIntent,
): ReadonlyArray<Event> =>
  planActionCheck(
    state,
    content,
    rng,
    {
      characterId: intent.characterId,
      ability: 'WIS',
      ...(intent.skill !== undefined ? { skill: intent.skill } : { skill: 'perception' as Skill }),
      ...(intent.dc !== undefined ? { dc: intent.dc } : {}),
      ...(intent.at !== undefined ? { at: intent.at } : {}),
    },
    'Search',
  );
