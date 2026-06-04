import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { Skill } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { planActionCheck } from './_action-check.js';

export interface InfluenceIntent {
  readonly type: 'Influence';
  readonly characterId: string;
  // Influence is a Charisma check; RAW lists Animal Handling /
  // Deception / Intimidation / Performance / Persuasion as the
  // typical skills. Defaults to Persuasion when omitted.
  readonly skill?: Skill;
  readonly dc?: number;
  readonly at?: string;
}

// L1 RAW Influence action (PHB 2024 ch.7 Actions):
//   "With the Influence action, you urge a monster to do something.
//   Describe or roleplay how you're communicating with the monster.
//   Are you trying to deceive, intimidate, amuse, or politely
//   persuade? The GM then determines whether the monster feels
//   willing, unwilling, or hesitant due to your interaction; this
//   determination is made based on the monster's current attitude,
//   whether it understands you, and the goals of its disposition."
//   The roll is a Charisma check, gated by the GM-set DC.
export const planInfluence = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: InfluenceIntent,
): ReadonlyArray<Event> =>
  planActionCheck(
    state,
    content,
    rng,
    {
      characterId: intent.characterId,
      ability: 'CHA',
      ...(intent.skill !== undefined ? { skill: intent.skill } : { skill: 'persuasion' as Skill }),
      ...(intent.dc !== undefined ? { dc: intent.dc } : {}),
      ...(intent.at !== undefined ? { at: intent.at } : {}),
    },
    'Influence',
  );
