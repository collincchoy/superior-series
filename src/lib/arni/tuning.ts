/**
 * Arni's movement feel. Units: pixels, px/s, px/s², milliseconds.
 * Tweak freely — tests check relationships (e.g. "charged jump is much
 * higher than normal"), not exact numbers.
 */
export const TUNING = {
  // Running
  runSpeed: 340,
  groundAccel: 2400,
  groundDecel: 2800,
  airAccel: 1600,
  airDecel: 700,
  /** Extra acceleration when reversing direction, for snappy turns. */
  turnMult: 1.6,

  // Crouch / crawl
  crawlSpeed: 150,

  // Gravity
  gravity: 2000,
  /** Falling uses heavier gravity: floaty rise, snappy fall. */
  fallGravityMult: 1.7,
  maxFallSpeed: 1100,
  /** Small downward push while grounded so ground contact never flickers. */
  groundStick: 60,

  // Jumping
  jumpVelocity: 860, // ≈ 2.9 tiles high
  /** Releasing jump while rising multiplies upward speed by this. */
  jumpCutMult: 0.4,
  coyoteMs: 100,
  jumpBufferMs: 120,

  // Crouch-charged jump
  chargedJumpVelocity: 1060, // ≈ 4.4 tiles high at full charge
  chargeMinMs: 250,
  chargeMaxMs: 600,

  // Slide
  slideMinSpeed: 260,
  slideSpeed: 560,
  slideMs: 450,
  slideFriction: 500,
} as const;
