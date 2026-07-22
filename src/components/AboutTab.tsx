'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { MODEL_PRESETS, MODEL_INFO, type ModelType } from '@/types';
import { PARAMETER_BOUNDS } from '@/lib/calculations';

const MODEL_ORDER: ModelType[] = ['nz', 'sz', 'california', 'scr', 'custom'];

/** Render a LaTeX expression with KaTeX (display block by default, or inline) */
function Equation({ tex, inline = false }: { tex: string; inline?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: !inline, throwOnError: false }),
    [tex, inline]
  );
  return inline ? (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span
      className="block overflow-x-auto py-1 text-gray-800 dark:text-gray-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">{title}</h3>
      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

export default function AboutTab() {
  return (
    <div className="mt-6 space-y-6" role="region" aria-label="About the models and methods">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">About the Models &amp; Methods</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          The forecast model, its parameters, and how forecasts are evaluated against observed seismicity
        </p>
      </div>

      <Section title="The Forecast Model: Reasenberg–Jones (1989)">
        <p>
          Forecasts are produced with the Reasenberg &amp; Jones (1989) model, the statistical framework used
          operationally by the USGS and by Earth Sciences New Zealand / GeoNet. It combines two empirical laws of
          aftershock behaviour: the <strong>Omori–Utsu law</strong> (aftershock rates decay with time after the
          mainshock) and the <strong>Gutenberg–Richter relation</strong> (small aftershocks are exponentially more
          frequent than large ones).
        </p>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-md px-4 py-3">
          <Equation tex="\lambda(t, M) = 10^{\,a + b\,(M_m - M)} \, (t + c)^{-p}" />
        </div>
        <p>
          where <Equation inline tex="\lambda" /> is the rate of aftershocks with magnitude{' '}
          <Equation inline tex="\geq M" /> at time <Equation inline tex="t" /> (days) after a mainshock of
          magnitude <Equation inline tex="M_m" />. The expected number of events in a forecast window{' '}
          <Equation inline tex="[T_1, T_2]" /> is the integral of the rate over the window, evaluated in closed
          form:
        </p>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-md px-4 py-3">
          <Equation tex="N = \int_{T_1}^{T_2} \lambda(t, M)\, dt \;=\; 10^{\,a + b\,(M_m - M)} \cdot \frac{(T_2 + c)^{1-p} - (T_1 + c)^{1-p}}{1 - p}" />
        </div>
        <p>
          with the logarithmic special case <Equation inline tex="\ln\!\left(\tfrac{T_2 + c}{T_1 + c}\right)" /> at{' '}
          <Equation inline tex="p = 1" />. The probability of one or more events follows from Poisson statistics,
        </p>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-md px-4 py-3">
          <Equation tex="P(\geq 1) = 1 - e^{-N}," />
        </div>
        <p>
          and the 95% ranges in the results are the 2.5th and 97.5th percentiles of the Poisson distribution with
          mean <Equation inline tex="N" />.
        </p>
        <p>
          A magnitude-bin edge correction of 0.05 units is applied (thresholds count events that would round to the
          threshold magnitude or above), matching operational practice for catalogues reported to one decimal place.
        </p>
      </Section>

      <Section title="The Four Model Parameters">
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>a — productivity.</strong> Sets the overall aftershock rate of the sequence; more negative values
            mean fewer aftershocks. Regional calibrations span roughly {PARAMETER_BOUNDS.a.min} to {PARAMETER_BOUNDS.a.max};
            Page et al. (2016) found regional variation of nearly a factor of ten.
          </li>
          <li>
            <strong>b — Gutenberg–Richter b-value.</strong> The relative frequency of small versus large events;
            b&nbsp;=&nbsp;1 means each unit decrease in magnitude brings ~10× more events. Typical range{' '}
            {PARAMETER_BOUNDS.b.min}–{PARAMETER_BOUNDS.b.max}.
          </li>
          <li>
            <strong>c — Omori c-value (days).</strong> A short time constant that keeps the rate finite immediately
            after the mainshock; partly physical, partly an artefact of early-sequence catalogue incompleteness.
            Typical range {PARAMETER_BOUNDS.c.min}–{PARAMETER_BOUNDS.c.max} days.
          </li>
          <li>
            <strong>p — Omori decay exponent.</strong> How fast rates decay: p&nbsp;=&nbsp;1 is classical Omori decay,
            larger is faster. Typical range {PARAMETER_BOUNDS.p.min}–{PARAMETER_BOUNDS.p.max}.
          </li>
        </ul>
        <p>
          Values outside the literature ranges trigger a non-blocking warning; values that make the mathematics
          undefined (b, c or p ≤ 0) block calculation.
        </p>
      </Section>

      <Section title="Model Presets">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th scope="col" className="px-3 py-2 text-left">Model</th>
                <th scope="col" className="px-3 py-2 text-center">a</th>
                <th scope="col" className="px-3 py-2 text-center">b</th>
                <th scope="col" className="px-3 py-2 text-center">c (days)</th>
                <th scope="col" className="px-3 py-2 text-center">p</th>
                <th scope="col" className="px-3 py-2 text-left">Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {MODEL_ORDER.map((key) => (
                <tr key={key} className="text-gray-700 dark:text-gray-300">
                  <td className="px-3 py-2 font-semibold">{MODEL_INFO[key].name}</td>
                  <td className="px-3 py-2 text-center font-mono">{MODEL_PRESETS[key].a}</td>
                  <td className="px-3 py-2 text-center font-mono">{MODEL_PRESETS[key].b}</td>
                  <td className="px-3 py-2 text-center font-mono">{MODEL_PRESETS[key].c}</td>
                  <td className="px-3 py-2 text-center font-mono">{MODEL_PRESETS[key].p}</td>
                  <td className="px-3 py-2">{MODEL_INFO[key].description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The generic parameter sets are calibrated on many past sequences; an individual sequence can differ
          substantially. Operational agencies re-fit parameters to each sequence as data accumulate — forecasts from
          generic presets are indicative, and official forecasts (GeoNet, USGS) take precedence.
        </p>
      </Section>

      <Section title="How Forecasts Are Evaluated">
        <p>
          The Evaluation tab tests a forecast retrospectively against the observed GeoNet catalogue, following the
          approach of the Collaboratory for the Study of Earthquake Predictability (CSEP):
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>Spatial region.</strong> A circle (or equal-area square) centred on the epicentre with radius{' '}
            <Equation inline tex="k \times L" />, where <Equation inline tex="L" /> is the Wells &amp; Coppersmith
            (1994) subsurface rupture length (all slip types),{' '}
            <Equation inline tex="\log_{10} L = -2.44 + 0.59\,M_w" />, floored at 10 km. The multiplier{' '}
            <Equation inline tex="k" /> is user-selectable.
          </li>
          <li>
            <strong>Observed catalogue.</strong> GeoNet QuakeSearch events (earthquakes only) within the region,
            forecast window and magnitude thresholds; the mainshock itself is always excluded.
          </li>
          <li>
            <strong>N-test</strong> (Zechar 2010): the two-sided Poisson consistency test at the 5% level — is the
            observed count plausible given the forecast expectation? Verdicts: consistent, over-prediction, or
            under-prediction.
          </li>
          <li>
            <strong>95% interval coverage</strong>: whether the observed count falls in the forecast&rsquo;s Poisson
            95% range.
          </li>
          <li>
            <strong>Brier score.</strong> For the binary &ldquo;one or more events&rdquo; forecast with stated
            probability <Equation inline tex="p" /> and outcome <Equation inline tex="o" /> (1 if an event
            occurred, 0 if not): <Equation inline tex="\mathrm{BS} = (p - o)^2" />. It ranges from 0 (a certain forecast that proved
            correct) to 1 (a certain forecast that proved wrong). A useful benchmark is the uninformative 50%
            forecast, which always scores 0.25 — a forecast system that averages below 0.25 is conveying real
            information about occurrence. The Brier score is a <em>proper</em> score: reporting your honest
            probability is always the best strategy, so it rewards both calibration (probabilities that match
            observed frequencies) and sharpness (probabilities close to 0 or 1).
          </li>
          <li>
            <strong>Log score.</strong> The negative log-likelihood of the outcome:{' '}
            <Equation inline tex="\mathrm{LS} = -\left[\, o \ln p + (1 - o)\ln(1 - p) \,\right]" />.
            A perfect certain forecast scores 0; the uninformative
            50% forecast scores <Equation inline tex="\ln 2 \approx 0.693" />; and the score grows without bound as a confident forecast proves
            wrong (probabilities are clamped at 10⁻⁶ here, capping the penalty near 13.8). It is <em>strictly</em>
            proper and penalises overconfidence far more harshly than the Brier score — forecasting 99% for
            something that doesn&rsquo;t happen costs 4.6, versus 0.98 under Brier. Differences in average log
            score between two models are the <em>information gain</em> of one over the other (in nats), which is
            why it is the standard skill measure in CSEP-style forecast experiments.
          </li>
          <li>
            <strong>Poisson log-likelihood</strong> of the observed count under the forecast expectation — the
            count-based analogue of the log score, used to compare how well different models explain the same
            observations.
          </li>
          <li>
            Single-forecast scores are noisy: one lucky or unlucky window says little. These scores are designed to
            be <em>averaged across many forecasts</em>, where they discriminate reliably between models; the
            per-window values shown here are diagnostic detail, not verdicts.
          </li>
          <li>
            <strong>Windows still in progress</strong> are scored over the elapsed time only, with the expected count
            integrated over the same elapsed period.
          </li>
        </ul>
        <p>
          Caveats: counts are assumed Poisson and parameter uncertainty is not propagated (intervals are narrower than
          reality); GeoNet magnitudes mix magnitude types; catalogues are incomplete for small events in the hours
          after a large mainshock. A single evaluation is weak evidence — consistency across many forecasts is what
          validates a model.
        </p>
      </Section>

      <Section title="References">
        <ul className="list-disc list-inside space-y-1">
          <li>Reasenberg, P.A. &amp; Jones, L.M. (1989, 1994). Earthquake hazard after a mainshock in California. <em>Science</em> 243, 1173–1176.</li>
          <li>Hardebeck, J.L. et al. (2019). Updated California aftershock parameters. <em>Seismological Research Letters</em> 90(1).</li>
          <li>Page, M.T., van der Elst, N., Hardebeck, J., Felzer, K. &amp; Michael, A.J. (2016). Three ingredients for improved global aftershock forecasts. <em>BSSA</em> 106(5).</li>
          <li>Wells, D.L. &amp; Coppersmith, K.J. (1994). New empirical relationships among magnitude, rupture length, rupture width, rupture area, and surface displacement. <em>BSSA</em> 84(4), 974–1002.</li>
          <li>Zechar, J.D. (2010). Evaluating earthquake predictions and earthquake forecasts: a guide for students and new researchers. <em>CORSSA</em>.</li>
          <li>GeoNet — Earth Sciences New Zealand: quake API and QuakeSearch catalogue (api.geonet.org.nz, quakesearch.geonet.org.nz).</li>
        </ul>
      </Section>
    </div>
  );
}
