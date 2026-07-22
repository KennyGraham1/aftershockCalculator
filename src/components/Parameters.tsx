'use client';

import { useId, useState, useRef, useCallback } from 'react';
import InfoTooltip from './InfoTooltip';
import { formatNZDateTime, parseNZDateTime } from '@/lib/datetime';

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
        time following the Omori&ndash;Utsu law, so an accurate origin time is
        needed for a reliable forecast.
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
        The longer the interval between the mainshock and the forecast start,
        the lower the expected aftershock rates.
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
        <li><strong>1 day:</strong> immediate response and emergency operations</li>
        <li><strong>7 days:</strong> short-term operational planning</li>
        <li><strong>30 days:</strong> extended situational outlook</li>
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
        <li><strong>M1:</strong> highest threshold (e.g., M5+, potentially damaging events)</li>
        <li><strong>M2:</strong> intermediate threshold (e.g., M4+, widely felt events)</li>
        <li><strong>M3:</strong> lowest threshold (e.g., M3+, locally felt events)</li>
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

/** Format an ISO timestamp for a native datetime-local input (local time) */
function toLocalInputValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A date-time field in the day-first convention (dd/mm/yyyy hh:mm, local
 * time). Native datetime-local inputs render in the OS locale — month-first on
 * US-configured machines — so the visible field is an explicit text format.
 * A calendar button opens the browser's native picker through a hidden
 * datetime-local input; the chosen value is written back as dd/mm/yyyy hh:mm.
 * The parent receives a valid ISO string, or '' while the text is incomplete.
 */
function DateTimeField({
  id,
  isoValue,
  onChangeISO,
  className,
  describedBy,
}: {
  id: string;
  isoValue: string;
  onChangeISO: (iso: string) => void;
  className: string;
  describedBy?: string;
}) {
  const [state, setState] = useState({ iso: isoValue, text: formatNZDateTime(isoValue) });
  const pickerRef = useRef<HTMLInputElement>(null);

  // Re-derive the draft text when the value changes from outside
  // (the "Now" buttons or a GeoNet load) — the adjust-during-render pattern
  if (isoValue !== state.iso) {
    setState({ iso: isoValue, text: formatNZDateTime(isoValue) });
  }

  const commitIso = (iso: string) => {
    setState({ iso, text: formatNZDateTime(iso) });
    onChangeISO(iso);
  };

  const handleChange = (text: string) => {
    const iso = text.trim() === '' ? '' : parseNZDateTime(text) ?? '';
    setState({ iso, text });
    onChangeISO(iso);
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    // Open the calendar at the current value, or now if the field is empty
    el.value = toLocalInputValue(state.iso) || toLocalInputValue(new Date().toISOString());
    try {
      el.showPicker();
    } catch {
      // Older browsers without showPicker(): fall back to focusing the input
      el.focus();
      el.click();
    }
  };

  const handlePicked = (localValue: string) => {
    if (!localValue) return;
    const d = new Date(localValue);
    if (!isNaN(d.getTime())) commitIso(d.toISOString());
  };

  const invalid = state.text.trim() !== '' && parseNZDateTime(state.text) === null;

  return (
    <div className="relative w-full">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy hh:mm"
        value={state.text}
        onChange={(e) => handleChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${className} pr-10 ${invalid ? 'border-red-500 dark:border-red-500' : ''}`}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="Choose date and time from a calendar"
        title="Choose date and time from a calendar"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md
                   text-gray-400 hover:text-blue-500 hover:bg-gray-100
                   dark:text-gray-500 dark:hover:text-blue-400 dark:hover:bg-gray-700
                   focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
      {/* Hidden native input: provides the calendar UI only; its value is
          converted to dd/mm/yyyy hh:mm and never shown */}
      <input
        ref={pickerRef}
        type="datetime-local"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handlePicked(e.target.value)}
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
      />
    </div>
  );
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
        Adjust the parameters below, then select <em>Calculate Forecast</em>
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
            Mainshock magnitude (0–10)
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
            <DateTimeField
              id={`${baseId}-quake-time`}
              isoValue={quakeTime}
              onChangeISO={onQuakeTimeChange}
              className={inputClass}
              describedBy={`${baseId}-quake-time-hint`}
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
            When the earthquake occurred (local time, dd/mm/yyyy hh:mm)
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
            <DateTimeField
              id={`${baseId}-start-time`}
              isoValue={startTime}
              onChangeISO={onStartTimeChange}
              className={inputClass}
              describedBy={`${baseId}-start-time-hint`}
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
            When the forecast period begins (local time, dd/mm/yyyy hh:mm)
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
          M1 is the highest threshold and M3 the lowest (e.g. M1=5, M2=4, M3=3)
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

