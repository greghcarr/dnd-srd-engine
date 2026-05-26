// Slice 464: bridge from a statblock's declared Multiattack pattern
// (definition-keyed content) to the runtime Character.multiattack
// pattern (instance-keyed) that planMultiattack consumes.
//
// A monster's statblock declares the Multiattack action by weapon
// DEFINITION id ("ghoul-bite", "brown-bear-claw") because content
// cannot know which item instances a consumer will mint. At creature
// build time the consumer mints one weapon item instance per definition
// the multiattack references (a single instance suffices for "two
// Bites": the planner runs the same resolveAttack `count` times against
// the same weaponInstanceId) and calls this helper to get the runtime
// MultiattackPattern.
//
// The runtime pattern is the same shape the existing showcase / s13
// tests already construct by hand. Consumers that want full control
// (custom names, mixed weapons across instances) still build the
// runtime pattern directly; this helper covers the common case where
// the SRD-declared statblock is the source of truth.

import type { MonsterMultiattack } from '../schemas/content/monster.js';
import type { MultiattackPattern } from '../schemas/runtime/character.js';
import type { ULID } from '../engine/ids-utils.js';

export const runtimeMultiattackFromStatblock = (
  declared: MonsterMultiattack,
  weaponIdToInstance: Readonly<Record<string, string>>,
): MultiattackPattern => {
  const attacks = declared.attacks.map(({ weaponId, count }) => {
    const weaponInstanceId = weaponIdToInstance[weaponId];
    if (weaponInstanceId === undefined) {
      throw new Error(
        `No item instance provided for weapon '${weaponId}' in multiattack '${declared.name}'`,
      );
    }
    return { weaponInstanceId: weaponInstanceId as ULID, count };
  });
  return { name: declared.name, attacks };
};
