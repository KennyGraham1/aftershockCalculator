// Forecast evaluation utilities
//
// Evaluates Reasenberg-Jones forecasts against observed seismicity, following
// CSEP-style consistency testing (Zechar 2010; Schorlemmer et al. 2018).
//
// Documented assumptions:
// - Spatial scaling uses Wells & Coppersmith (1994) subsurface rupture length
//   (all slip types): log10(L km) = -2.44 + 0.59 Mw. The evaluation radius is
//   `multiplier x L`, floored at MIN_RADIUS_KM (epicentral uncertainty).
// - The "square" region is the equal-area square of the circular region
//   (half-width = r * sqrt(pi) / 2), centred on the epicentre.
// - Counts are Poisson; the N-test quantiles are exact Poisson tail
//   probabilities (normal approximation with continuity correction for
//   lambda > 100).
// - The mainshock itself is always excluded from observed counts.

import type { ModelParameters } from '@/types';
import { calculateOmoriIntegral, calculateExpectedAftershocks } from './calculations';

export const MIN_RADIUS_KM = 10; // floor: epicentral + location uncertainty
export const KM_PER_DEG_LAT = 111.32;

/** Wells & Coppersmith (1994) subsurface rupture length, all slip types (km) */
export function wellsCoppersmithLengthKm(magnitude: number): number {
  return Math.pow(10, -2.44 + 0.59 * magnitude);
}

/** Evaluation radius: multiplier x rupture length, floored at MIN_RADIUS_KM */
export function evaluationRadiusKm(magnitude: number, multiplier: number): number {
  return Math.max(MIN_RADIUS_KM, multiplier * wellsCoppersmithLengthKm(magnitude));
}

export type RegionType = 'circle' | 'square';

export interface EvalRegion {
  type: RegionType;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

/** Signed minimal longitude difference in degrees, robust across the dateline */
export function deltaLonDeg(lonA: number, lonB: number): number {
  return ((lonA - lonB + 540) % 360) - 180;
}

/** Great-circle distance via the haversine formula (km) */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(deltaLonDeg(lon2, lon1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Area of the evaluation region in km². By construction the square region has
 * the same area as the circular one (half-width = r·√π/2), so both are πr².
 */
export function regionAreaKm2(region: EvalRegion): number {
  return Math.PI * region.radiusKm ** 2;
}

/** Half-width (km) of the equal-area square region */
export function squareHalfWidthKm(radiusKm: number): number {
  return (radiusKm * Math.sqrt(Math.PI)) / 2;
}

/** Is a point inside the evaluation region? */
export function isInRegion(region: EvalRegion, lat: number, lon: number): boolean {
  if (region.type === 'circle') {
    return haversineKm(region.latitude, region.longitude, lat, lon) <= region.radiusKm;
  }
  // Equal-area square: half-width = r * sqrt(pi) / 2
  const half = squareHalfWidthKm(region.radiusKm);
  const dLatKm = Math.abs(lat - region.latitude) * KM_PER_DEG_LAT;
  const dLonKm =
    Math.abs(deltaLonDeg(lon, region.longitude)) *
    KM_PER_DEG_LAT *
    Math.cos((region.latitude * Math.PI) / 180);
  return dLatKm <= half && dLonKm <= half;
}

/**
 * Bounding box that covers the region (used for the catalogue query;
 * precise membership is applied client-side afterwards).
 * Longitudes are normalised to [0, 360) as accepted by GeoNet QuakeSearch.
 */
export function regionBbox(region: EvalRegion): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const dLat = region.radiusKm / KM_PER_DEG_LAT;
  const cosLat = Math.max(0.1, Math.cos((region.latitude * Math.PI) / 180));
  const dLon = region.radiusKm / (KM_PER_DEG_LAT * cosLat);
  const lon = ((region.longitude % 360) + 360) % 360;
  return {
    minLon: lon - dLon,
    minLat: region.latitude - dLat,
    maxLon: lon + dLon,
    maxLat: region.latitude + dLat,
  };
}

// ---------------------------------------------------------------------------
// Poisson machinery
// ---------------------------------------------------------------------------

/** Standard normal CDF (Abramowitz & Stegun 26.2.17, |error| < 7.5e-8) */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** P(X <= k) for X ~ Poisson(lambda) */
export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  if (lambda <= 0) return 1;
  if (lambda > 100) {
    // Normal approximation with continuity correction
    return normalCdf((k + 0.5 - lambda) / Math.sqrt(lambda));
  }
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= k; i++) {
    term *= lambda / i;
    sum += term;
  }
  return Math.min(1, sum);
}

/**
 * CSEP N-test quantiles (Zechar 2010).
 * pAtMost  = P(X <= n): small value => forecast OVER-predicted.
 * pAtLeast = P(X >= n): small value => forecast UNDER-predicted.
 */
export function nTest(observed: number, expected: number): {
  pAtMost: number;
  pAtLeast: number;
  verdict: 'consistent' | 'overprediction' | 'underprediction';
} {
  const pAtMost = poissonCdf(observed, expected);
  const pAtLeast = observed === 0 ? 1 : 1 - poissonCdf(observed - 1, expected);
  // Two-sided test at 5%: flag if either tail probability < 0.025
  const verdict = pAtMost < 0.025 ? 'overprediction' : pAtLeast < 0.025 ? 'underprediction' : 'consistent';
  return { pAtMost, pAtLeast, verdict };
}

const P_CLAMP = 1e-6;

/** Brier score for the binary ">=1 event" forecast; 0 is perfect, 1 is worst */
export function brierScore(probability: number, occurred: boolean): number {
  const o = occurred ? 1 : 0;
  return (probability - o) ** 2;
}

/** Negative log-likelihood (log score) of the binary outcome; lower is better */
export function logScore(probability: number, occurred: boolean): number {
  const p = Math.min(1 - P_CLAMP, Math.max(P_CLAMP, probability));
  return occurred ? -Math.log(p) : -Math.log(1 - p);
}

/** Poisson log-likelihood of observing n given expectation lambda */
export function poissonLogLikelihood(n: number, lambda: number): number {
  if (lambda <= 0) return n === 0 ? 0 : -Infinity;
  let logFact = 0;
  for (let i = 2; i <= Math.min(n, 170); i++) logFact += Math.log(i);
  if (n > 170) {
    // Stirling for large n
    logFact = n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n);
  }
  return n * Math.log(lambda) - lambda - logFact;
}

// ---------------------------------------------------------------------------
// Forecast-observation matching
// ---------------------------------------------------------------------------

export interface ObservedEvent {
  publicId: string;
  timeMs: number;
  magnitude: number;
  latitude: number;
  longitude: number;
  depthKm: number | null;
}

export interface BinTarget {
  /** Inclusive lower magnitude bound */
  minMag: number;
  /** Exclusive upper magnitude bound; null = open-ended */
  maxMag: number | null;
}

/** Count observed events matching a time window, magnitude bin, and region */
export function countMatches(
  events: ObservedEvent[],
  startMs: number,
  endMs: number,
  bin: BinTarget,
  region: EvalRegion,
  excludePublicId?: string
): ObservedEvent[] {
  return events.filter(e =>
    e.publicId !== excludePublicId &&
    e.timeMs >= startMs &&
    e.timeMs < endMs &&
    e.magnitude >= bin.minMag &&
    (bin.maxMag === null || e.magnitude < bin.maxMag) &&
    isInRegion(region, e.latitude, e.longitude)
  );
}

/**
 * Exact expected count for a magnitude bin over [tStart, tEnd] days after the
 * mainshock, recomputed from the model (never from rounded display strings).
 */
export function expectedCountForBin(
  params: ModelParameters,
  mainshockMag: number,
  bin: BinTarget,
  tStartDays: number,
  tEndDays: number
): number {
  const integral = calculateOmoriIntegral(tStartDays, tEndDays, params.c, params.p);
  const nLo = calculateExpectedAftershocks(params.a, params.b, mainshockMag, bin.minMag, integral);
  const nHi = bin.maxMag === null
    ? 0
    : calculateExpectedAftershocks(params.a, params.b, mainshockMag, bin.maxMag, integral);
  return nLo - nHi;
}

export interface BinEvaluation {
  observed: number;
  /** Expected count over the evaluated (possibly partial) window */
  expected: number;
  /** P(>=1 event) implied by the expected count */
  probability: number;
  occurred: boolean;
  ciLow: number;
  ciHigh: number;
  withinCi: boolean;
  nTestPAtMost: number;
  nTestPAtLeast: number;
  verdict: 'consistent' | 'overprediction' | 'underprediction';
  brier: number;
  logScoreBinary: number;
  poissonLL: number;
}

/** Score one magnitude bin of one forecast window */
export function evaluateBin(observed: number, expected: number, ciLow: number, ciHigh: number): BinEvaluation {
  const probability = 1 - Math.exp(-expected);
  const occurred = observed >= 1;
  const t = nTest(observed, expected);
  return {
    observed,
    expected,
    probability,
    occurred,
    ciLow,
    ciHigh,
    withinCi: observed >= ciLow && observed <= ciHigh,
    nTestPAtMost: t.pAtMost,
    nTestPAtLeast: t.pAtLeast,
    verdict: t.verdict,
    brier: brierScore(probability, occurred),
    logScoreBinary: logScore(probability, occurred),
    poissonLL: poissonLogLikelihood(observed, expected),
  };
}
