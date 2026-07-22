// GeoNet API utilities

import type { GeoNetQuakeResponse, QuakeData } from '@/types';

const GEONET_API_BASE = 'https://api.geonet.org.nz';
const FETCH_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Custom error class for API-related errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_ID' | 'NOT_FOUND' | 'NETWORK_ERROR' | 'TIMEOUT' | 'PARSE_ERROR'
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Validate a quake ID format
 * Valid IDs are alphanumeric, typically like "2022p138188"
 */
export function validateQuakeId(quakeId: string): boolean {
  if (!quakeId || typeof quakeId !== 'string') {
    return false;
  }
  const trimmed = quakeId.trim();
  const pattern = /^[0-9a-z]+$/i;
  return pattern.test(trimmed) && trimmed.length >= 4 && trimmed.length <= 20;
}

/**
 * Fetch quake data from GeoNet API with timeout and error handling
 */
export async function fetchQuakeData(quakeId: string): Promise<QuakeData> {
  const trimmedId = quakeId.trim();

  if (!validateQuakeId(trimmedId)) {
    throw new ApiError(
      'Invalid Quake ID format. Please enter an alphanumeric ID (e.g., 2022p138188)',
      'INVALID_ID'
    );
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEONET_API_BASE}/quake/${trimmedId}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 404) {
      throw new ApiError(
        `Quake "${trimmedId}" not found. Please check the ID and try again.`,
        'NOT_FOUND'
      );
    }

    if (!response.ok) {
      throw new ApiError(
        `Failed to fetch quake data (HTTP ${response.status}). Please try again later.`,
        'NETWORK_ERROR'
      );
    }

    let data: GeoNetQuakeResponse;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        'Failed to parse response from GeoNet API. Please try again.',
        'PARSE_ERROR'
      );
    }

    if (!data.features || data.features.length === 0) {
      throw new ApiError(
        `No data found for quake "${trimmedId}". Please check the ID.`,
        'NOT_FOUND'
      );
    }

    const feature = data.features[0];
    const quake = feature.properties;

    // Validate the response data
    if (typeof quake.magnitude !== 'number' || isNaN(quake.magnitude)) {
      throw new ApiError(
        'Invalid magnitude data received from API.',
        'PARSE_ERROR'
      );
    }

    if (!quake.time || typeof quake.time !== 'string') {
      throw new ApiError(
        'Invalid time data received from API.',
        'PARSE_ERROR'
      );
    }

    // Epicentre (GeoJSON coordinates are [lon, lat, ...]); optional so a
    // missing geometry degrades gracefully rather than failing the load
    const coords = feature.geometry?.coordinates;
    const hasLocation =
      Array.isArray(coords) &&
      typeof coords[0] === 'number' && Number.isFinite(coords[0]) &&
      typeof coords[1] === 'number' && Number.isFinite(coords[1]);

    return {
      quakeId: trimmedId,
      magnitude: quake.magnitude,
      quakeTime: quake.time,
      longitude: hasLocation ? coords[0] : undefined,
      latitude: hasLocation ? coords[1] : undefined,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ApiError(
          'Request timed out. Please check your connection and try again.',
          'TIMEOUT'
        );
      }

      // Network errors (CORS, DNS, etc.)
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new ApiError(
          'Network error. Please check your internet connection.',
          'NETWORK_ERROR'
        );
      }
    }

    throw new ApiError(
      'An unexpected error occurred. Please try again.',
      'NETWORK_ERROR'
    );
  }
}

const QUAKESEARCH_BASE = 'https://quakesearch.geonet.org.nz';
const CATALOG_TIMEOUT_MS = 30000;
/** Response sizes at or above this suggest the query hit a server cap */
export const CATALOG_TRUNCATION_WARNING_COUNT = 3000;

/** Format a Date for QuakeSearch (UTC, no timezone suffix) */
function formatQuakeSearchDate(d: Date): string {
  return d.toISOString().slice(0, 19);
}

interface QuakeSearchFeature {
  properties: {
    publicid: string;
    origintime: string;
    magnitude: number;
    depth?: number;
    eventtype?: string;
  };
  geometry: { coordinates: number[] };
}

/**
 * Fetch the observed earthquake catalogue from GeoNet QuakeSearch for a
 * bounding box, time range, and minimum magnitude. Non-earthquake event types
 * (e.g. quarry blasts) are excluded. Longitudes may exceed 180 (QuakeSearch
 * accepts the 0-360 convention across the dateline).
 */
export async function fetchObservedCatalog(
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  start: Date,
  end: Date,
  minMagnitude: number
): Promise<import('./evaluation').ObservedEvent[]> {
  const params = new URLSearchParams({
    bbox: `${bbox.minLon.toFixed(4)},${bbox.minLat.toFixed(4)},${bbox.maxLon.toFixed(4)},${bbox.maxLat.toFixed(4)}`,
    startdate: formatQuakeSearchDate(start),
    enddate: formatQuakeSearchDate(end),
    minmag: String(minMagnitude),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);

  try {
    const response = await fetch(`${QUAKESEARCH_BASE}/geojson?${params}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new ApiError(
        `Failed to fetch the observed catalogue (HTTP ${response.status}). Please try again later.`,
        'NETWORK_ERROR'
      );
    }

    const data: { features?: QuakeSearchFeature[] } = await response.json();
    const features = data.features ?? [];

    return features
      .filter(f =>
        (!f.properties.eventtype || f.properties.eventtype === 'earthquake') &&
        typeof f.properties.magnitude === 'number' &&
        Array.isArray(f.geometry?.coordinates)
      )
      .map(f => ({
        publicId: f.properties.publicid,
        timeMs: new Date(f.properties.origintime).getTime(),
        magnitude: f.properties.magnitude,
        longitude: f.geometry.coordinates[0],
        latitude: f.geometry.coordinates[1],
        depthKm: typeof f.properties.depth === 'number' ? f.properties.depth : null,
      }))
      .filter(e => Number.isFinite(e.timeMs))
      .sort((a, b) => a.timeMs - b.timeMs);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(
        'Catalogue request timed out. Try a shorter window or higher magnitude threshold.',
        'TIMEOUT'
      );
    }
    throw new ApiError(
      'Failed to fetch the observed catalogue. Please check your connection.',
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calculate initial magnitude ranges based on main shock magnitude
 * M1 is the highest threshold, M3 is the lowest
 */
export function calculateInitialMagnitudeRanges(magnitude: number): {
  m1: number;
  m2: number;
  m3: number;
} {
  // Round down from main shock magnitude
  const m1 = Math.max(1, Math.min(9, Math.round(magnitude - 0.5)));
  const m2 = Math.max(1, m1 - 1);
  const m3 = Math.max(1, m1 - 2);

  return { m1, m2, m3 };
}

