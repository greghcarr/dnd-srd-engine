import type { CampaignState } from '../../schemas/runtime/campaign.js';
import type { ResolvedContent } from '../../content/pack.js';
import type { Event } from '../../schemas/events/index.js';
import type { Skill } from '../../schemas/primitives.js';
import type { RNG } from '../../rng/index.js';
import { planActionCheck } from './_action-check.js';

export interface StudyIntent {
  readonly type: 'Study';
  readonly characterId: string;
  // Study is an Intelligence check; RAW lists Arcana / History /
  // Investigation / Nature / Religion as the typical skills.
  // Defaults to Investigation when omitted.
  readonly skill?: Skill;
  readonly dc?: number;
  readonly at?: string;
}

// L1 RAW Study action (PHB 2024 ch.7 Actions):
//   "When you take the Study action, you make an Intelligence check
//   to study your memory, a book, a clue, or another source of
//   knowledge and call to mind an important piece of information
//   about it. The Study Action table lists skills with which you
//   might be asked to make this check, along with examples of what
//   each skill might be used to study."
export const planStudy = (
  state: CampaignState,
  content: ResolvedContent,
  rng: RNG,
  intent: StudyIntent,
): ReadonlyArray<Event> =>
  planActionCheck(
    state,
    content,
    rng,
    {
      characterId: intent.characterId,
      ability: 'INT',
      ...(intent.skill !== undefined ? { skill: intent.skill } : { skill: 'investigation' as Skill }),
      ...(intent.dc !== undefined ? { dc: intent.dc } : {}),
      ...(intent.at !== undefined ? { at: intent.at } : {}),
    },
    'Study',
  );
