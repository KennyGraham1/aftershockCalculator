'use client';

import { useState, useId } from 'react';

interface QuakeInputProps {
  quakeId: string;
  onQuakeIdChange: (id: string) => void;
  onLoadQuake: () => Promise<void>;
  isLoading: boolean;
  loadedQuakeInfo?: { magnitude: number; time: string } | null;
}

export default function QuakeInput({
  quakeId,
  onQuakeIdChange,
  onLoadQuake,
  isLoading,
  loadedQuakeInfo,
}: QuakeInputProps) {
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const handleLoad = async () => {
    setError(null);
    try {
      await onLoadQuake();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quake');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && quakeId && !isLoading) {
      handleLoad();
    }
  };

  return (
    <div className="mb-6 print:hidden">
      <h1 className="text-2xl font-bold text-red-800 dark:text-red-400 mb-4">
        AfterShock Calculator
        <span className="block text-sm font-normal text-gray-600 dark:text-gray-400 mt-1">
          For Earth Sciences New Zealand (ESNZ) use only
        </span>
      </h1>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Quake ID
          </label>
          <input
            id={inputId}
            type="text"
            value={quakeId}
            onChange={(e) => {
              onQuakeIdChange(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="e.g., 2022p138188"
            pattern="[0-9A-Za-z]+"
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? 'true' : undefined}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                       focus:outline-none focus:ring-2 focus:ring-blue-500
                       dark:bg-gray-800 dark:text-gray-100
                       aria-[invalid=true]:border-red-500"
          />
        </div>

        <button
          onClick={handleLoad}
          disabled={isLoading || !quakeId.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-md
                     hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed
                     transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400
                     flex items-center gap-2"
          aria-busy={isLoading}
        >
          {isLoading && (
            <span
              className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
          )}
          {isLoading ? 'Loading...' : 'Load Quake Info'}
        </button>

      </div>

      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Enter a quake ID then select &quot;Load Quake Info&quot; to retrieve the quake parameters
      </p>

      {error && (
        <div
          id={errorId}
          role="alert"
          className="mt-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md"
        >
          <p className="text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
            <span aria-hidden="true">⚠️</span>
            {error}
          </p>
        </div>
      )}

      {loadedQuakeInfo && !error && (
        <div
          role="status"
          className="mt-2 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md"
        >
          <p className="text-green-700 dark:text-green-400 text-sm">
            ✓ Loaded: M{loadedQuakeInfo.magnitude.toFixed(1)} earthquake at{' '}
            {new Date(loadedQuakeInfo.time).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

