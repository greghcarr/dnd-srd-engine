// Tactical enemy AI: the pure movement/role decision policy, exported
// from the package so a consumer (e.g. the dnd-web interactive viewer)
// can drive an AI combatant without depending on scripts/. Relocated
// from scripts/tactical/ in slice 706; the fuzz harness re-exports these
// via scripts/tactical/policy.ts so behavior is unchanged.
//
// The arena-generation tunables in ./tactical-constants.ts are internal
// and intentionally NOT re-exported from the package barrel.
export {
  planTacticalMove,
  classifyTacticalRole,
  pickByTotalOrder,
  type TacticalRole,
  type TacticalRoleKind,
  type TacticalMove,
  type TacticalMoveInput,
} from './tactical-policy.js';

// Auto-reaction policy decision logic (slice 749). Pure predicates a
// consumer can use to surface / drive damage-mitigation reactions
// (Uncanny Dodge, Deflect Attacks, Stone's Endurance). The constants in
// ./reaction-constants.ts are internal tunables, not re-exported.
export {
  pickDamageReaction,
  hasUncannyDodge,
  hasDeflectAttacks,
  hasStonesEndurance,
  shouldShield,
  shouldCuttingWords,
  shouldCounterspell,
  hasCountercharm,
  disadvantageFlipsHit,
  type DamageReaction,
  type IncomingDamage,
  type PhysicalDamageType,
} from './reactions.js';
