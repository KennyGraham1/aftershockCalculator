'use client';

import React from 'react';
import type { CalculationResults } from '@/types';

interface ResultsTableProps {
  results: CalculationResults | null;
  onExportCSV?: () => void;
  modelName?: string;
}

const COLUMN_HEADERS = ['Average number', 'Range *', 'Probability of 1 or more'] as const;

function formatPrintDate(): string {
  return new Date().toLocaleString('en-NZ', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

export default function ResultsTable({ results, onExportCSV, modelName = 'NZ Generic' }: ResultsTableProps) {
  if (!results) {
    return null;
  }

  return (
    <div className="mt-6" role="region" aria-label="Aftershock forecast results">
      {/* Print Header - Only visible when printing */}
      <div className="hidden print:block print-header">
        <h1>AfterShock Forecast Report</h1>
        <div className="metadata">
          <span><strong>Quake ID:</strong> {results.quakeId}</span>
          <span><strong>Model:</strong> {modelName}</span>
          <span><strong>Generated:</strong> {formatPrintDate()}</span>
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
                      {header}
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
                  within {forecast.duration} days
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
          Generated by AfterShock Calculator • Earth Sciences New Zealand (ESNZ) •
          Calculations based on Omori&apos;s law and Poisson distribution analysis •
          Data source: GeoNet API
        </p>
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

