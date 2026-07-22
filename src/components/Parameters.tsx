'use client';

import { useId, useCallback } from 'react';
import InfoTooltip from './InfoTooltip';

// Tooltip content for each parameter
const TOOLTIPS = {
  magnitude: (
    <>
      <strong>Mainshock Magnitude (M<sub>w</sub>)</strong>
      <p className="mt-1">
        The moment magnitude of the initiating earthquake. In the
        Reasenberg&ndash;Jones model, aftershock productivity scales
        exponentially with mainshock magnitude, so this value strongly
        influences all forecast quantities.
      </p>
    </>
  ),
  quakeTime: (
    <>
      <strong>Mainshock Origin Time</strong>
      <p className="mt-1">
        The date and time at which the mainshock occurred. All forecast windows
        are measured relative to this time. Aftershock rates decay with elapsed
        time in accordance with the Omori&ndash;Utsu law, so an accurate origin
        time is essential for a reliable forecast.
      </p>
    </>
  ),
  startTime: (
    <>
      <strong>Forecast Start Time</strong>
      <p className="mt-1">
        The beginning of the forecast window. Use the current time for a
        prospective forecast, or select an earlier time to reproduce a forecast
        as it would have been issued during a historical sequence. The start
        time must not precede the mainshock origin time.
      </p>
      <p className="mt-1 text-xs">
        Note: the longer the interval between the mainshock and the forecast
        start, the lower the expected aftershock rates.
      </p>
    </>
  ),
  durations: (
    <>
      <strong>Forecast Durations</strong>
      <p className="mt-1">
        The length of each forecast window, in days, measured from the forecast
        start time. Standard reporting intervals:
      </p>
      <ul className="mt-1 ml-3 text-xs list-disc">
        <li><strong>1 day</strong> &mdash; immediate response and emergency operations</li>
        <li><strong>7 days</strong> &mdash; short-term operational planning</li>
        <li><strong>30 days</strong> &mdash; extended situational outlook</li>
      </ul>
    </>
  ),
  magnitudeRanges: (
    <>
      <strong>Magnitude Thresholds</strong>
      <p className="mt-1">
        Thresholds defining the reported magnitude bins. For each bin, the
        forecast provides the expected number of events and the probability of
        one or more occurrences:
      </p>
      <ul className="mt-1 ml-3 text-xs list-disc">
        <li><strong>M1</strong> &mdash; highest threshold (e.g., M5+, potentially damaging events)</li>
        <li><strong>M2</strong> &mdash; intermediate threshold (e.g., M4+, widely felt events)</li>
        <li><strong>M3</strong> &mdash; lowest threshold (e.g., M3+, locally felt events)</li>
      </ul>
    </>
  ),
};

interface ParametersProps {
  magnitude: string;
  quakeTime: string;
  startTime: string;
  durations: number[];
  magnitudeRanges: { m1: number; m2: number; m3: number };
  onMagnitudeChange: (value: string) => void;
  onQuakeTimeChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onDurationsChange: (index: number, value: number) => void;
  onAddDuration: () => void;
  onRemoveDuration: (index: number) => void;
  onMagnitudeRangesChange: (key: 'm1' | 'm2' | 'm3', value: number) => void;
  disabled?: boolean;
}

/**
 * Format a Date to datetime-local input format (YYYY-MM-DDTHH:MM) in local timezone
 */
function formatDateTimeLocal(dateOrString: Date | string): string {
  if (!dateOrString) return '';
  try {
    const date = typeof dateOrString === 'string' ? new Date(dateOrString) : dateOrString;
    if (isNaN(date.getTime())) return '';
    // Format in local timezone for datetime-local input
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

/**
 * Parse datetime-local input value to ISO string
 */
function parseLocalToISO(localDateTime: string): string {
  if (!localDateTime) return '';
  try {
    // datetime-local is in format YYYY-MM-DDTHH:MM
    const date = new Date(localDateTime);
    if (isNaN(date.getTime())) return '';
    return date.toISOString();
  } catch {
    return '';
  }
}



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
  onAddDuration,
  onRemoveDuration,
  onMagnitudeRangesChange,
  disabled = false,
}: ParametersProps) {
  const baseId = useId();

  const inputClass = `w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      dark:bg-gray-800 dark:text-gray-100
                      disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed`;

  const handleQuakeTimeChange = useCallback((value: string) => {
    onQuakeTimeChange(parseLocalToISO(value));
  }, [onQuakeTimeChange]);

  const handleStartTimeChange = useCallback((value: string) => {
    onStartTimeChange(parseLocalToISO(value));
  }, [onStartTimeChange]);

  const setQuakeTimeToNow = useCallback(() => {
    onQuakeTimeChange(new Date().toISOString());
  }, [onQuakeTimeChange]);

  const setStartTimeToNow = useCallback(() => {
    onStartTimeChange(new Date().toISOString());
  }, [onStartTimeChange]);

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
            className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Magnitude
            <InfoTooltip content={TOOLTIPS.magnitude} />
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
            className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Quake Time
            <InfoTooltip content={TOOLTIPS.quakeTime} />
          </label>
          <div className="flex gap-2">
            <input
              id={`${baseId}-quake-time`}
              type="datetime-local"
              value={formatDateTimeLocal(quakeTime)}
              onChange={(e) => handleQuakeTimeChange(e.target.value)}
              className={inputClass}
              aria-describedby={`${baseId}-quake-time-hint`}
            />
            <button
              type="button"
              onClick={setQuakeTimeToNow}
              className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300
                         hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
              title="Set to current time"
            >
              Now
            </button>
          </div>
          <p id={`${baseId}-quake-time-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            When the earthquake occurred (local time)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor={`${baseId}-start-time`}
            className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Forecast Start Time
            <InfoTooltip content={TOOLTIPS.startTime} />
          </label>
          <div className="flex gap-2">
            <input
              id={`${baseId}-start-time`}
              type="datetime-local"
              value={formatDateTimeLocal(startTime)}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className={inputClass}
              aria-describedby={`${baseId}-start-time-hint`}
            />
            <button
              type="button"
              onClick={setStartTimeToNow}
              className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300
                         hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 whitespace-nowrap"
              title="Set to current time"
            >
              Now
            </button>
          </div>
          <p id={`${baseId}-start-time-hint`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            When the forecast period begins (local time)
          </p>
        </div>
        <div>
          <fieldset>
            <legend className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Forecast lengths (days)
              <InfoTooltip content={TOOLTIPS.durations} />
            </legend>
            <div className="flex flex-wrap gap-2 items-center">
              {durations.map((d, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="flex flex-col">
                    <label
                      htmlFor={`${baseId}-duration-${i}`}
                      className="sr-only"
                    >
                      Forecast duration {i + 1}
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
                      aria-label={`Forecast duration ${i + 1} in days`}
                    />
                  </div>
                  {durations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveDuration(i)}
                      className="mt-0.5 w-6 h-6 flex items-center justify-center rounded-full
                                 text-gray-400 hover:text-red-500 hover:bg-red-50
                                 dark:hover:text-red-400 dark:hover:bg-red-900/20
                                 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                      aria-label={`Remove duration ${d} days`}
                      title="Remove this duration"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {durations.length < 8 && (
                <button
                  type="button"
                  onClick={onAddDuration}
                  className="w-8 h-8 flex items-center justify-center rounded-full border-2 border-dashed
                             border-gray-300 dark:border-gray-600
                             text-gray-400 dark:text-gray-500
                             hover:border-blue-400 hover:text-blue-500
                             dark:hover:border-blue-500 dark:hover:text-blue-400
                             transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Add forecast duration"
                  title="Add another forecast duration"
                >
                  +
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              1–730 days each · up to 8 periods
            </p>
          </fieldset>
        </div>
      </div>

      <fieldset>
        <legend className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Magnitude Thresholds
          <InfoTooltip content={TOOLTIPS.magnitudeRanges} />
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

