const {
  mean,
  standardDeviation,
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

const chooseMethod = (values) => {
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

  const method = chooseMethod(values);
  const lastDate = dates.length > 0 ? new Date(`${dates[dates.length - 1]}T00:00:00Z`) : new Date();

  let predictAhead;
  let fitted;

  if (method === "holt-winters") {
    const model = fitHoltWinters(values);
    fitted = model.fitted;
    const n = values.length;

    predictAhead = (step) => {
      // Damped trend: the cumulative damping factor, not phi^step.
      const damping = Array.from({ length: step }, (_, i) => model.params.phi ** (i + 1)).reduce(
        (sum, value) => sum + value,
        0
      );
      const seasonIndex = (n + step - 1) % SEASON_LENGTH;
      return model.level + damping * model.trend + model.season[seasonIndex];
    };
  } else if (method === "damped-trend") {
    const model = fitDampedTrend(values);
    fitted = model.fitted;

    predictAhead = (step) => {
      const damping = Array.from({ length: step }, (_, i) => model.params.phi ** (i + 1)).reduce(
        (sum, value) => sum + value,
        0
      );
      return model.level + damping * model.trend;
    };
  } else {
    const average = mean(values);
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
  if (values.length < MIN_DAYS_FOR_TREND) {
    warning = `Only ${values.length} days of history - this is an average, not a trend.`;
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
    confidence,
    warning,
  };
};

module.exports = {
  SEASON_LENGTH,
  MIN_DAYS_FOR_TREND,
  MIN_DAYS_FOR_SEASONALITY,
  DEFAULT_PARAMS,
  fitHoltWinters,
  fitDampedTrend,
  chooseMethod,
  forecastDemand,
  weekdayProfile,
};
