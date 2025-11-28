// Aftershock calculation utilities
// Based on Omori's law and Poisson distribution
// References:
//   - Reasenberg & Jones (1989, 1994): California aftershock parameters
//   - Page et al. (2016): Global tectonic regime parameters
//   - Hardebeck et al. (2018): Updated California parameters

import type { ModelParameters, DurationForecast } from '@/types';

/**
 * Parameter validation bounds based on scientific literature
 */
export const PARAMETER_BOUNDS = {
  a: { min: -4, max: 0, description: 'Productivity parameter' },
  b: { min: 0.5, max: 1.5, description: 'Gutenberg-Richter b-value' },
  c: { min: 0.001, max: 1.0, description: 'Omori c-value (days)' },
  p: { min: 0.5, max: 2.0, description: 'Omori p-value (decay rate)' },
} as const;

/**
 * Validate model parameters are within reasonable scientific bounds
 * @returns Array of validation error messages, empty if valid
 */
export function validateModelParameters(params: ModelParameters): string[] {
  const errors: string[] = [];

  if (params.a < PARAMETER_BOUNDS.a.min || params.a > PARAMETER_BOUNDS.a.max) {
    errors.push(`Parameter 'a' (${params.a}) should be between ${PARAMETER_BOUNDS.a.min} and ${PARAMETER_BOUNDS.a.max}`);
  }
  if (params.b < PARAMETER_BOUNDS.b.min || params.b > PARAMETER_BOUNDS.b.max) {
    errors.push(`Parameter 'b' (${params.b}) should be between ${PARAMETER_BOUNDS.b.min} and ${PARAMETER_BOUNDS.b.max}`);
  }
  if (params.c < PARAMETER_BOUNDS.c.min || params.c > PARAMETER_BOUNDS.c.max) {
    errors.push(`Parameter 'c' (${params.c}) should be between ${PARAMETER_BOUNDS.c.min} and ${PARAMETER_BOUNDS.c.max}`);
  }
  if (params.p < PARAMETER_BOUNDS.p.min || params.p > PARAMETER_BOUNDS.p.max) {
    errors.push(`Parameter 'p' (${params.p}) should be between ${PARAMETER_BOUNDS.p.min} and ${PARAMETER_BOUNDS.p.max}`);
  }

  return errors;
}

/**
 * Quantile function for Poisson distribution
 * Reference: https://www.lexifi.com/blog/quant/efficient-simulation-method-poisson-distribution/
 *
 * For large lambda (>100), uses normal approximation to avoid numerical issues
 */
export function qpois(p: number, lambda: number): number {
  // Handle edge cases
  if (lambda <= 0) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;

  // For large lambda, use normal approximation: N ~ Normal(λ, √λ)
  // This avoids underflow issues with exp(-lambda) for large lambda
  if (lambda > 100) {
    // Inverse normal approximation using Abramowitz & Stegun formula
    const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
    const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
    const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
    let z = t - (c0 + c1*t + c2*t*t) / (1 + d1*t + d2*t*t + d3*t*t*t);
    if (p < 0.5) z = -z;
    return Math.max(0, Math.round(lambda + z * Math.sqrt(lambda)));
  }

  let inc = Math.exp(-1 * lambda);
  let n = 0;
  let sum = inc;
  let count = 1000;

  while (sum < p && count > 0) {
    n = n + 1;
    inc = (inc * lambda) / n;
    sum = sum + inc;
    count = count - 1;
  }

  return n;
}

/**
 * Format a value for display based on its magnitude
 */
export function formatValue(value: number): string {
  if (value >= 100) {
    return Math.round(value).toString();
  }
  if (value < 1) {
    return Number(value.toPrecision(1)).toString();
  }
  return Number(value.toPrecision(2)).toString();
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
  if (value > 99) {
    return ">99%";
  }
  if (value < 1) {
    return "<1%";
  }
  return Math.round(value) + "%";
}

/**
 * Calculate the Omori integral for aftershock rate
 *
 * Integral of (t + c)^(-p) from rangeStart to rangeEnd
 *
 * Special case: when p = 1, uses logarithmic form to avoid division by zero
 * ∫(t + c)^(-1) dt = ln(t + c)
 */
export function calculateOmoriIntegral(
  rangeStart: number,
  rangeEnd: number,
  c: number,
  p: number
): number {
  // Handle p = 1 case: integral becomes logarithmic
  // Using small epsilon for floating-point comparison
  if (Math.abs(p - 1) < 1e-10) {
    return Math.log(rangeEnd + c) - Math.log(rangeStart + c);
  }

  return (Math.pow(rangeEnd + c, 1 - p) - Math.pow(rangeStart + c, 1 - p)) / (1 - p);
}

/**
 * Calculate expected number of aftershocks for a magnitude range
 */
export function calculateExpectedAftershocks(
  a: number,
  b: number,
  mainMag: number,
  minMag: number,
  omoriIntegral: number
): number {
  return Math.pow(10, a + b * (mainMag - (minMag - 0.05))) * omoriIntegral;
}

/**
 * Calculate forecast for a single duration period
 *
 * @throws {Error} If duration or rangeStartFromQuakeTime is negative
 */
export function calculateDurationForecast(
  duration: number,
  mag: number,
  m1: number,
  m2: number,
  m3: number,
  rangeStartFromQuakeTime: number,
  params: ModelParameters
): DurationForecast {
  // Edge case validation
  if (duration <= 0) {
    throw new Error('Duration must be positive');
  }
  if (rangeStartFromQuakeTime < 0) {
    throw new Error('Forecast cannot start before the earthquake occurred');
  }

  const { a, b, c, p } = params;

  const rangeEnd = rangeStartFromQuakeTime + duration;
  const omoriIntegral = calculateOmoriIntegral(rangeStartFromQuakeTime, rangeEnd, c, p);

  // Calculate expected numbers for each magnitude threshold
  const vNabu1 = calculateExpectedAftershocks(a, b, mag, m1, omoriIntegral);
  const vNabu2 = calculateExpectedAftershocks(a, b, mag, m2, omoriIntegral);
  const vNabu3 = calculateExpectedAftershocks(a, b, mag, m3, omoriIntegral);

  // Calculate differences for magnitude ranges
  const diff1 = vNabu1; // M1+ 
  const diff2 = vNabu2 - vNabu1; // M2 to M1
  const diff3 = vNabu3 - vNabu2; // M3 to M2

  // Calculate probabilities (probability of 1 or more)
  const p1 = 100 * (1 - Math.exp(-diff1));
  const p2 = 100 * (1 - Math.exp(-diff2));
  const p3 = 100 * (1 - Math.exp(-diff3));

  // Calculate confidence intervals using Poisson quantiles
  // Note: For very small expected values, upper bound can legitimately be 0
  // We only use fallback of 1 when the expected value is non-trivial but rounds to 0
  const p1L = qpois(0.025, diff1);
  const p1U = qpois(0.975, diff1);
  const p2L = qpois(0.025, diff2);
  const p2U = qpois(0.975, diff2);
  const p3L = qpois(0.025, diff3);
  const p3U = qpois(0.975, diff3);

  return {
    duration,
    m1: {
      averageNumber: formatValue(diff1),
      range: `${Math.round(p1L)}-${Math.round(p1U)}`,
      probability: formatPercentage(p1),
    },
    m2: {
      averageNumber: formatValue(diff2),
      range: `${Math.round(p2L)}-${Math.round(p2U)}`,
      probability: formatPercentage(p2),
    },
    m3: {
      averageNumber: formatValue(diff3),
      range: `${Math.round(p3L)}-${Math.round(p3U)}`,
      probability: formatPercentage(p3),
    },
  };
}

