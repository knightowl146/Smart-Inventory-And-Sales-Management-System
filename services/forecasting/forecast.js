const {
  mean,
  standardDeviation,
  median,
  robustZScores,
  weekdayProfile,
  addDays,
  dayKey,
} = require("./timeSeries");

/**
 * Demand forecasting.
 *
 * Three methods, chosen by how much history a SKU actually has. Picking the
 * method from the data rather than always reaching for the fanciest one matters:
 * Holt-Winters fitted to eleven days of noise produces a confident-looking line
 * that is worse than an average, and a forecast nobody can trust is worse than
 * no forecast at all.
 *
 *   < 14 days   -> "mean": the average, honestly labelled
 *   14-41 days  -> "damped-trend": level + damped trend, no seasonality
 *   >= 42 days  -> "holt-winters": level + damped trend + weekly seasonality
 *
 * 42 days is six full weeks - the minimum at which a weekly seasonal index is
 * estimated from six observations per weekday rather than two or three.
 */

const SEASON_LENGTH = 7;
const MIN_DAYS_FOR_TREND = 14;
const MIN_DAYS_FOR_SEASONALITY = 42;

// Smoothing parameters. Deliberately conservative: retail daily demand is noisy,
// and a high alpha turns every quiet Tuesday into a trend.
const DEFAULT_PARAMS = Object.freeze({
  alpha: 0.3, // level
  beta: 0.1, // trend
  gamma: 0.25, // seasonality
  phi: 0.9, // trend damping - stops a short uptick extrapolating to the moon
});

// z-scores for two-sided prediction intervals.
const Z = Object.freeze({ 0.8: 1.2816, 0.9: 1.6449, 0.95: 1.96 });

const clampToZero = (value) => (value > 0 ? value : 0);

/**
 * Threshold on the robust z-score above which a day is treated as a one-off
 * rather than as demand. 3.5 is the conventional cut for modified z-scores and
 * is deliberately loose: a busy Saturday should survive it comfortably.
 */
const OUTLIER_Z = 3.5;

/**
 * Cap one-off spikes before fitting, leaving the rest of the series untouched.
 *
 * Exponential smoothing has no defence against a single enormous day. One bulk
 * order - a school buying forty HDMI cables at once - arrives as the last
 * observation, alpha pulls the level up towards it, beta reads the jump as the
 * start of a trend, and because the damped trend accumulates to phi/(1-phi) = 9
 * times the per-step trend, a thirty-day forecast then climbs to roughly triple
 * actual demand. Measured on the seeded catalogue, that single failure mode was
 * the difference between the model losing to a seasonal-naive baseline on most
 * products and beating it on most.
 *
 * Winsorising rather than deleting: the day still counts, it just counts as a
 * very busy day instead of as evidence about next month. And only for fitting -
 * the raw series is what the anomaly feed reads, because a bulk order is
 * exactly what that page exists to surface. The forecaster should not be
 * surprised by it; the shopkeeper should.
 *
 * @param {number[]} values
 * @returns {{values: number[], capped: number}}
 */
const winsorise = (values, threshold = OUTLIER_Z) => {
  if (values.length < SEASON_LENGTH * 2) return { values, capped: 0 };

  const scores = robustZScores(values);
  const centre = median(values);

  // The largest value that was not itself judged an outlier - a cap taken from
  // the data rather than an invented multiple of the median, so a genuinely
  // spiky product keeps its range.
  const ordinary = values.filter((_, index) => Math.abs(scores[index]) <= threshold);
  const ceiling = ordinary.length > 0 ? Math.max(...ordinary) : centre;

  let capped = 0;

  const cleaned = values.map((value, index) => {
    if (scores[index] > threshold && value > ceiling) {
      capped += 1;
      return ceiling;
    }
    return value;
  });

  return { values: cleaned, capped };
};

/**
 * Holt-Winters, additive, with a damped trend.
 *
 * Additive rather than multiplicative because daily unit sales are frequently
 * zero, and a multiplicative model is undefined the moment a seasonal index
 * meets a zero.
 */
const fitHoltWinters = (values, params = DEFAULT_PARAMS) => {
  const { alpha, beta, gamma, phi } = params;
  const m = SEASON_LENGTH;

  // Seed the level and season from the first two complete weeks.
  const firstSeason = values.slice(0, m);
  const secondSeason = values.slice(m, m * 2);

  let level = mean(firstSeason);
  let trend = (mean(secondSeason) - mean(firstSeason)) / m;

  const season = firstSeason.map((value) => value - level);

  const fitted = [];

  for (let t = 0; t < values.length; t += 1) {
    const seasonIndex = t % m;
    const prediction = level + phi * trend + season[seasonIndex];
    fitted.push(prediction);

    const previousLevel = level;
    level = alpha * (values[t] - season[seasonIndex]) + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - previousLevel) + (1 - beta) * phi * trend;
    season[seasonIndex] = gamma * (values[t] - level) + (1 - gamma) * season[seasonIndex];
  }

  return { level, trend, season, fitted, params };
};

/** Level + damped trend, no seasonal component. */
const fitDampedTrend = (values, params = DEFAULT_PARAMS) => {
  const { alpha, beta, phi } = params;

  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;

  const fitted = [];

  for (let t = 0; t < values.length; t += 1) {
    fitted.push(level + phi * trend);

    const previousLevel = level;
    level = alpha * values[t] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - previousLevel) + (1 - beta) * phi * trend;
  }

  return { level, trend, fitted, params };
};

/**
 * Croston's method, with the Syntetos-Boylan correction.
 *
 * Exponential smoothing assumes something sells most days. A 60,000 laptop does
 * not: it sells on one day in five and nothing on the other four, and fitting a
 * weekly seasonal model to that is fitting a pattern to the gaps. Holt-Winters
 * lost to "assume next Tuesday looks like last Tuesday" on every such product
 * in the catalogue, for the uncomfortable reason that a baseline predicting
 * zero is nearly right when the answer is usually zero.
 *
 * Croston splits the problem in two and smooths each separately: how much sells
 * when something sells (z), and how many days pass between sales (p). The
 * forecast is z/p - a fractional rate, which is the honest answer for a product
 * that sells 0.3 a day. Plain Croston is known to be biased upward, so this
 * applies the Syntetos-Boylan approximation, (1 - alpha/2), which is the
 * standard correction and the reason the method is usually written SBA.
 *
 * Deliberately not seasonal: with four selling days in a fortnight there is no
 * weekday evidence to speak of, and pretending otherwise is how a forecast
 * acquires false confidence.
 */
const fitCroston = (values, alpha = 0.15) => {
  const firstNonZero = values.findIndex((value) => value > 0);

  if (firstNonZero === -1) return { rate: 0, fitted: values.map(() => 0), alpha };

  let size = values[firstNonZero];
  let interval = Math.max(1, firstNonZero + 1);
  let sinceLast = 0;

  const correction = 1 - alpha / 2;
  const fitted = [];

  for (let t = 0; t < values.length; t += 1) {
    fitted.push(t <= firstNonZero ? size / interval : (correction * size) / interval);

    sinceLast += 1;

    if (values[t] > 0 && t > firstNonZero) {
      size = alpha * values[t] + (1 - alpha) * size;
      interval = alpha * sinceLast + (1 - alpha) * interval;
      sinceLast = 0;
    } else if (values[t] > 0) {
      sinceLast = 0;
    }
  }

  return { rate: (correction * size) / interval, fitted, alpha };
};

/**
 * Average demand interval: days of history per day that actually sold.
 *
 * Syntetos and Boylan put the boundary between smooth and intermittent demand
 * at 1.32, and that number is used here rather than invented because it is the
 * one the literature and every forecasting package agree on.
 */
const AVERAGE_DEMAND_INTERVAL_CUTOFF = 1.32;

const averageDemandInterval = (values) => {
  const sellingDays = values.filter((value) => value > 0).length;
  return sellingDays === 0 ? Infinity : values.length / sellingDays;
};

const chooseMethod = (values) => {
  if (
    values.length >= MIN_DAYS_FOR_TREND &&
    averageDemandInterval(values) >= AVERAGE_DEMAND_INTERVAL_CUTOFF
  ) {
    return "croston";
  }

  if (values.length >= MIN_DAYS_FOR_SEASONALITY) return "holt-winters";
  if (values.length >= MIN_DAYS_FOR_TREND) return "damped-trend";
  return "mean";
};

/**
 * Forecast the next `horizon` days.
 *
 * @param {{dates: string[], values: number[]}} series dense daily series
 * @param {number} horizon days ahead
 * @param {number} [confidence] 0.8 | 0.9 | 0.95
 * @returns {{
 *   method: string,
 *   horizon: number,
 *   points: Array<{date: string, expected: number, lower: number, upper: number}>,
 *   totalExpected: number,
 *   dailyMean: number,
 *   dailyStdDev: number,
 *   residualStdDev: number,
 *   observations: number,
 *   confidence: number,
 *   warning: string|null
 * }}
 */
const forecastDemand = (series, horizon = 30, confidence = 0.8) => {
  const values = series?.values ?? [];
  const dates = series?.dates ?? [];
  const z = Z[confidence] ?? Z[0.8];

  const empty = {
    method: "none",
    horizon,
    points: [],
    totalExpected: 0,
    dailyMean: 0,
    dailyStdDev: 0,
    residualStdDev: 0,
    observations: values.length,
    confidence,
    warning: "No sales history for this product.",
  };

  if (values.length === 0) return empty;

  /**
   * A product with a long run of zeros is not a forecastable product.
   *
   * The series is padded to the full lookback window, so a product that has
   * never sold arrives here as 180 observations - enough to satisfy every
   * length check, and Holt-Winters will happily fit it and predict zero
   * forever with perfect accuracy. That is a true statement and a useless one,
   * and presenting it as a forecast implies knowledge the data does not
   * contain. Say there is nothing to forecast instead.
   */
  if (!values.some((value) => value > 0)) {
    return {
      ...empty,
      observations: values.length,
      warning: "No sales recorded for this product in the period, so there is nothing to forecast.",
    };
  }

  const method = chooseMethod(values);
  const lastDate = dates.length > 0 ? new Date(`${dates[dates.length - 1]}T00:00:00Z`) : new Date();

  // Fit on the de-spiked series; report against the real one.
  const { values: fitValues, capped } = winsorise(values);

  let predictAhead;
  let fitted;

  if (method === "holt-winters") {
    const model = fitHoltWinters(fitValues);
    fitted = model.fitted;
    const n = fitValues.length;

    predictAhead = (step) => {
      // Damped trend: the cumulative damping factor, not phi^step.
      const damping = Array.from({ length: step }, (_, i) => model.params.phi ** (i + 1)).reduce(
        (sum, value) => sum + value,
        0
      );
      const seasonIndex = (n + step - 1) % SEASON_LENGTH;
      return model.level + damping * model.trend + model.season[seasonIndex];
    };
  } else if (method === "croston") {
    const model = fitCroston(fitValues);
    fitted = model.fitted;

    // A rate, not a trend: the same expected fraction of a unit every day.
    predictAhead = () => model.rate;
  } else if (method === "damped-trend") {
    const model = fitDampedTrend(fitValues);
    fitted = model.fitted;

    predictAhead = (step) => {
      const damping = Array.from({ length: step }, (_, i) => model.params.phi ** (i + 1)).reduce(
        (sum, value) => sum + value,
        0
      );
      return model.level + damping * model.trend;
    };
  } else {
    const average = mean(fitValues);
    fitted = values.map(() => average);
    predictAhead = () => average;
  }

  // Interval width comes from how badly the model fitted the history it has
  // seen, not from the raw spread of demand - a model that tracks a seasonal
  // pattern well deserves a narrower band than one that does not.
  const residuals = values.map((value, index) => value - fitted[index]);
  const residualStdDev = standardDeviation(residuals);

  /**
   * Floor the interval width.
   *
   * A model that fitted its training data perfectly has zero residuals, which
   * would produce a prediction interval of zero width - the forecast claiming
   * it cannot be wrong. That is never true out of sample: next month can differ
   * from every month so far for reasons no amount of history contains. Five
   * percent of the running mean is a modest, honest floor, and it scales with
   * the product rather than imposing the same absolute band on a SKU that sells
   * two a day and one that sells two hundred.
   */
  const seriesMean = mean(values);
  const uncertainty = Math.max(residualStdDev, 0.05 * seriesMean);

  const points = [];
  for (let step = 1; step <= horizon; step += 1) {
    const expected = clampToZero(predictAhead(step));

    // Uncertainty grows with distance, as sqrt(step) for a random walk.
    const margin = z * uncertainty * Math.sqrt(step);

    points.push({
      date: dayKey(addDays(lastDate, step)),
      expected: Number(expected.toFixed(2)),
      lower: Number(clampToZero(expected - margin).toFixed(2)),
      upper: Number((expected + margin).toFixed(2)),
    });
  }

  let warning = null;
  if (capped > 0 && values.length >= MIN_DAYS_FOR_TREND) {
    warning = `${capped} unusually large ${
      capped === 1 ? "day was" : "days were"
    } capped before fitting, so a one-off bulk order does not become next month's forecast.`;
  }
  if (values.length < MIN_DAYS_FOR_TREND) {
    warning = `Only ${values.length} days of history - this is an average, not a trend.`;
  } else if (method === "croston") {
    // Says plainly why the chart is a flat line rather than a seasonal wave -
    // otherwise it reads as a broken forecast rather than a deliberate one.
    warning = `This product sells on roughly one day in ${Math.round(
      averageDemandInterval(values)
    )} - too irregular for a weekly pattern, so this is a steady rate rather than a day-by-day shape.`;
  } else if (values.length < MIN_DAYS_FOR_SEASONALITY) {
    warning = `${values.length} days of history - not enough to model weekly seasonality.`;
  }

  return {
    method,
    horizon,
    points,
    totalExpected: Number(points.reduce((sum, point) => sum + point.expected, 0).toFixed(2)),
    dailyMean: Number(mean(values).toFixed(3)),
    dailyStdDev: Number(standardDeviation(values).toFixed(3)),
    residualStdDev: Number(residualStdDev.toFixed(3)),
    observations: values.length,
    cappedDays: capped,
    confidence,
    warning,
  };
};

module.exports = {
  SEASON_LENGTH,
  MIN_DAYS_FOR_TREND,
  MIN_DAYS_FOR_SEASONALITY,
  DEFAULT_PARAMS,
  OUTLIER_Z,
  AVERAGE_DEMAND_INTERVAL_CUTOFF,
  winsorise,
  averageDemandInterval,
  fitCroston,
  fitHoltWinters,
  fitDampedTrend,
  chooseMethod,
  forecastDemand,
  weekdayProfile,
};
