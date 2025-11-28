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

    const quake = data.features[0].properties;

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

    return {
      quakeId: trimmedId,
      magnitude: quake.magnitude,
      quakeTime: quake.time,
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

