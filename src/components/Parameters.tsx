'use client';

import { useId } from 'react';

interface ParametersProps {
  magnitude: string;
  quakeTime: string;
  startTime: string;
  durations: [number, number, number];
  magnitudeRanges: { m1: number; m2: number; m3: number };
  onMagnitudeChange: (value: string) => void;
  onQuakeTimeChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onDurationsChange: (index: number, value: number) => void;
  onMagnitudeRangesChange: (key: 'm1' | 'm2' | 'm3', value: number) => void;
  disabled?: boolean;
}

/**
 * Safely format an ISO date string to datetime-local input format
 */
function formatDateTimeLocal(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

const DURATION_LABELS = ['Short-term', 'Medium-term', 'Long-term'] as const;
const MAG_RANGE_LABELS = { m1: 'M1 (highest)', m2: 'M2 (middle)', m3: 'M3 (lowest)' } as const;

export default function Parameters({
  magnitude,
  quakeTime,
  startTime,
  durations,
  magnitudeRanges,
  onMagnitudeChange,
  onQuakeTimeChange,
  onStartTimeChange,
  onDurationsChange,
  onMagnitudeRangesChange,
  disabled = false,
}: ParametersProps) {
  const baseId = useId();

  const inputClass = `w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      dark:bg-gray-800 dark:text-gray-100
                      disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed`;

  return (
    <fieldset
      className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 print:hidden"
      disabled={disabled}
    >
      <legend className="sr-only">Earthquake Parameters</legend>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Update any of the parameters below before hitting <em>Calculate</em>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor={`${baseId}-mag`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Magnitude
          </label>
          <input
            id={`${baseId}-mag`}
            type="number"
            step="0.1"
            min="0"
            max="10"
            value={magnitude}
            onChange={(e) => onMagnitudeChange(e.target.value)}
            className={inputClass}
            aria-describedby={`${baseId}-mag-hint`}
          />
          <p id={`${baseId}-mag-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Main shock magnitude (0-10)
          </p>
        </div>
        <div>
          <label
            htmlFor={`${baseId}-quake-time`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Quake Time
          </label>
          <input
            id={`${baseId}-quake-time`}
            type="datetime-local"
            value={formatDateTimeLocal(quakeTime)}
            onChange={(e) => onQuakeTimeChange(e.target.value)}
            className={inputClass}
            aria-describedby={`${baseId}-quake-time-hint`}
          />
          <p id={`${baseId}-quake-time-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            When the earthquake occurred
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor={`${baseId}-start-time`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Forecast Start Time
          </label>
          <input
            id={`${baseId}-start-time`}
            type="datetime-local"
            value={formatDateTimeLocal(startTime)}
            onChange={(e) => onStartTimeChange(e.target.value)}
            className={inputClass}
            aria-describedby={`${baseId}-start-time-hint`}
          />
          <p id={`${baseId}-start-time-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            When the forecast period begins
          </p>
        </div>
        <div>
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Forecast lengths (days)
            </legend>
            <div className="flex gap-2">
              {durations.map((d, i) => (
                <div key={i} className="flex flex-col">
                  <label
                    htmlFor={`${baseId}-duration-${i}`}
                    className="sr-only"
                  >
                    {DURATION_LABELS[i]} duration
                  </label>
                  <input
                    id={`${baseId}-duration-${i}`}
                    type="number"
                    min="1"
                    max="730"
                    value={d}
                    onChange={(e) => onDurationsChange(i, parseInt(e.target.value) || 1)}
                    className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               dark:bg-gray-800 dark:text-gray-100"
                    aria-label={`${DURATION_LABELS[i]} forecast duration in days`}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Magnitude Thresholds
        </legend>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          M1 should be highest, M3 should be lowest (e.g., M1=5, M2=4, M3=3)
        </p>
        <div className="flex gap-2 flex-wrap">
          {(['m1', 'm2', 'm3'] as const).map((key) => (
            <div key={key} className="flex flex-col">
              <label
                htmlFor={`${baseId}-${key}`}
                className="text-xs text-gray-600 dark:text-gray-400 mb-1"
              >
                {key.toUpperCase()}
              </label>
              <input
                id={`${baseId}-${key}`}
                type="number"
                min="1"
                max="9"
                step="1"
                value={magnitudeRanges[key]}
                onChange={(e) => onMagnitudeRangesChange(key, parseInt(e.target.value) || 1)}
                className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                           focus:outline-none focus:ring-2 focus:ring-blue-500
                           dark:bg-gray-800 dark:text-gray-100"
                aria-label={MAG_RANGE_LABELS[key]}
              />
            </div>
          ))}
        </div>
      </fieldset>
    </fieldset>
  );
}

