'use client';

import React from 'react';
import type { CalculationResults, ModelParameters } from '@/types';
import InfoTooltip from './InfoTooltip';

interface ResultsTableProps {
  results: CalculationResults | null;
  onExportCSV?: () => void;
  modelName?: string;
  /** ISO string for the forecast start time (from the "Time from" field) */
  startTime?: string;
  /** ISO string for when Calculate was pressed */
  forecastGeneratedAt?: string;
  /** The actual model parameters used in the calculation */
  modelParams?: ModelParameters;
}

const COLUMN_HEADERS = ['Expected number', 'Range *', 'Probability of 1 or more'] as const;

// Tooltips for understanding the results
const RESULTS_TOOLTIPS = {
  averageNumber: (
    <>
      <strong>Expected Number of Events</strong>
      <p className="mt-1">
        The mean number of aftershocks predicted for this magnitude bin and
        forecast window under the Reasenberg&ndash;Jones model, which combines
        Omori&ndash;Utsu temporal decay with Gutenberg&ndash;Richter magnitude
        scaling.
      </p>
    </>
  ),
  range: (
    <>
      <strong>95% Confidence Range</strong>
      <p className="mt-1">
        The interval within which the observed number of events is expected to
        fall with 95% probability, assuming Poisson-distributed counts. For
        example, an expected value of 5 may correspond to a range of 2&ndash;10.
      </p>
      <p className="mt-1 text-xs">
        This interval reflects counting statistics only; it does not include
        uncertainty in the model parameters.
      </p>
    </>
  ),
  probability: (
    <>
      <strong>Probability of One or More Events</strong>
      <p className="mt-1">
        The probability that at least one aftershock within this magnitude bin
        occurs during the forecast window, computed as 1&nbsp;&minus;&nbsp;e<sup>&minus;N</sup>,
        where N is the expected number of events.
      </p>
    </>
  ),
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

function formatNow(): string {
  return new Date().toLocaleString('en-NZ', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

export default function ResultsTable({
  results,
  onExportCSV,
  modelName = 'NZ Generic',
  startTime,
  forecastGeneratedAt,
  modelParams,
}: ResultsTableProps) {
  if (!results) {
    return null;
  }

  return (
    <div className="mt-6" role="region" aria-label="Aftershock forecast results">
      {/* Print Header - Only visible when printing */}
      <div className="hidden print:block print-header">
        <h1>Aftershock Forecast Report</h1>
        <div className="metadata">
          <span><strong>Event ID:</strong> {results.quakeId}</span>
          <span><strong>Forecast start:</strong> {startTime ? formatDateTime(startTime) : 'not set'}</span>
          <span><strong>Model:</strong> {modelName}</span>
        </div>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto print:overflow-visible">
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 print-results-table">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700">
              <th
                scope="col"
                className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-semibold text-left dark:text-gray-100"
              >
                <span className="print:hidden">{results.quakeId}</span>
                <span className="hidden print:inline">Duration</span>
              </th>
              <th
                scope="colgroup"
                colSpan={3}
                className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center font-semibold dark:text-gray-100"
              >
                {results.rangeLabels.range3}
              </th>
              <th
                scope="colgroup"
                colSpan={3}
                className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center font-semibold dark:text-gray-100"
              >
                {results.rangeLabels.range2}
              </th>
              <th
                scope="colgroup"
                colSpan={3}
                className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center font-semibold dark:text-gray-100"
              >
                {results.rangeLabels.range1}
              </th>
            </tr>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th scope="col" className="border border-gray-300 dark:border-gray-600 px-4 py-2 dark:text-gray-100 print:hidden">
                Duration
              </th>
              <th scope="col" className="hidden print:table-cell border border-gray-300 px-4 py-2">
                {/* Empty cell for print layout alignment */}
              </th>
              {[0, 1, 2].map((groupIndex) => (
                <React.Fragment key={`header-group-${groupIndex}`}>
                  {COLUMN_HEADERS.map((header, headerIndex) => (
                    <th
                      key={`header-${groupIndex}-${headerIndex}`}
                      scope="col"
                      className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center text-sm dark:text-gray-200"
                    >
                      <span className="flex items-center justify-center gap-1">
                        {header}
                        {/* Only show tooltips on the first group to avoid cluttering */}
                        {groupIndex === 0 && (
                          <span className="print:hidden">
                            <InfoTooltip
                              content={
                                headerIndex === 0
                                  ? RESULTS_TOOLTIPS.averageNumber
                                  : headerIndex === 1
                                  ? RESULTS_TOOLTIPS.range
                                  : RESULTS_TOOLTIPS.probability
                              }
                            />
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.forecasts.map((forecast) => (
              <tr key={forecast.duration} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <th
                  scope="row"
                  className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-normal text-left dark:text-gray-100 duration-cell"
                >
                  within {forecast.duration} {forecast.duration === 1 ? 'day' : 'days'}
                </th>
                {/* M3 results (lowest magnitude range) */}
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m3.averageNumber}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m3.range}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m3.probability}
                </td>
                {/* M2 results (middle magnitude range) */}
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m2.averageNumber}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m2.range}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m2.probability}
                </td>
                {/* M1 results (highest magnitude range) */}
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m1.averageNumber}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m1.range}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-center dark:text-gray-200">
                  {forecast.m1.probability}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        * Range is a 95% confidence interval based on the Poisson distribution
      </p>

      {/* Print Footer - Only visible when printing */}
      <div className="hidden print:block print-footer">
        <p>
          Forecast generated: {forecastGeneratedAt ? formatDateTime(forecastGeneratedAt) : formatNow()}
        </p>
        <p>
          Generated by the Aftershock Calculator • Earth Sciences New Zealand (ESNZ) •
          Reasenberg&ndash;Jones model (Omori&ndash;Utsu decay with Poisson statistics) •
          Data source: GeoNet API
        </p>
        {modelParams && (
          <p>
            Model parameters ({modelName}):{' '}
            <em>a</em>&nbsp;=&nbsp;{modelParams.a},&ensp;
            <em>b</em>&nbsp;=&nbsp;{modelParams.b},&ensp;
            <em>c</em>&nbsp;=&nbsp;{modelParams.c}&nbsp;days,&ensp;
            <em>p</em>&nbsp;=&nbsp;{modelParams.p}
          </p>
        )}
      </div>

      {/* Action Buttons - Hidden when printing */}
      <div className="mt-4 flex gap-2 flex-wrap print:hidden">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
          aria-label="Print forecast results"
        >
          🖨️ Print
        </button>
        {onExportCSV && (
          <button
            onClick={onExportCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
            aria-label="Export results to CSV"
          >
            📥 Export CSV
          </button>
        )}
      </div>
    </div>
  );
}

