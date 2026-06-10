import type { Character } from '../schemas/runtime/character.js';
import type { ResolvedContent } from '../content/pack.js';

// Slice 793: validate a character's `backgroundAbilityIncrease` allocation
// against its background's 2024 ability-score-increase rule. Returns a list of
// human-readable issues (empty = valid). The engine APPLIES whatever
// allocation is present (buildEffectStack composes it through
// effectiveAbilityScoreIncrease); this is the opt-in checker a consumer's
// chargen UI — or a test — runs to confirm a legal pick before committing the
// character. Lenient by design: an absent allocation is valid (the character
// simply receives no background increase).
export const validateBackgroundAbilityIncrease = (
  character: Character,
  content: ResolvedContent,
): string[] => {
  const alloc = character.backgroundAbilityIncrease;
  if (alloc === undefined) return [];

  const background = content.backgrounds.get(character.backgroundId);
  if (background === undefined) {
    return [`Unknown background '${character.backgroundId}' for the ability-increase allocation`];
  }

  const issues: string[] = [];
  const { options, pattern } = background.abilityScoreIncreases;
  const allowed = options as ReadonlyArray<string>;
  const entries = (Object.entries(alloc) as Array<[string, number]>).filter(([, n]) => n > 0);

  for (const [ability] of entries) {
    if (!allowed.includes(ability)) {
      issues.push(
        `${ability} is not an ability background '${background.id}' can increase (options: ${options.join(', ')})`,
      );
    }
  }

  const amounts = entries.map(([, n]) => n).sort((a, b) => b - a);
  if (pattern === '+2/+1') {
    if (entries.length !== 2 || amounts[0] !== 2 || amounts[1] !== 1) {
      issues.push(
        `background '${background.id}' uses the +2/+1 pattern: allocate +2 to one ability and +1 to a different one`,
      );
    }
  } else {
    // '+1/+1/+1'
    if (entries.length !== 3 || amounts.some((n) => n !== 1)) {
      issues.push(
        `background '${background.id}' uses the +1/+1/+1 pattern: allocate +1 to three different abilities`,
      );
    }
  }
  return issues;
};
