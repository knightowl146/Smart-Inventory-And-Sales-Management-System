/**
 * Turning a stock ledger into a time series.
 *
 * StockMovement records events, not observations: a day with no sale has no
 * document. A forecast needs the opposite - one value per day, zeros included,
 * because "sold nothing on Sunday" is information, and silently dropping those
 * days makes every product look like it sells every day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const dayKey = (date) => startOfDay(date).toISOString().slice(0, 10);

const addDays = (date, days) => new Date(startOfDay(date).getTime() + days * DAY_MS);

/**
 * Expand sparse {date, quantity} rows into a dense daily series.
 *
 * @param {Array<{date: Date|string, quantity: number}>} rows
 * @param {{from?: Date, to?: Date}} [range] defaults to the span of the rows
 * @returns {{dates: string[], values: number[]}}
 */
const toDailySeries = (rows, range = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { dates: [], values: [] };
  }

  const totals = new Map();
  let min = null;
  let max = null;

  for (const row of rows) {
    const date = startOfDay(new Date(row.date));
    if (Number.isNaN(date.getTime())) continue;

    const key = dayKey(date);
    totals.set(key, (totals.get(key) || 0) + Number(row.quantity || 0));

    if (!min || date < min) min = date;
    if (!max || date > max) max = date;
  }

  const from = range.from ? startOfDay(range.from) : min;
  const to = range.to ? startOfDay(range.to) : max;

  if (!from || !to || from > to) return { dates: [], values: [] };

  const dates = [];
  const values = [];

  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    const key = dayKey(cursor);
    dates.push(key);
    values.push(totals.get(key) || 0);
  }

  return { dates, values };
};

const mean = (values) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Sample standard deviation (n-1). The population form understates spread on
 * the short series this app deals with, and spread is exactly what safety
 * stock is sized from - so understating it means running out.
 */
const standardDeviation = (values) => {
  if (values.length < 2) return 0;

  const average = mean(values);
  const sumSquares = values.reduce((sum, value) => sum + (value - average) ** 2, 0);

  return Math.sqrt(sumSquares / (values.length - 1));
};

const median = (values) => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

/** Median absolute deviation - the median of each point's distance from the median. */
const medianAbsoluteDeviation = (values) => {
  if (values.length === 0) return 0;
  const centre = median(values);
  return median(values.map((value) => Math.abs(value - centre)));
};

/**
 * Robust z-scores, for finding outliers.
 *
 * The plain z-score has a blind spot that matters here: the outlier itself
 * inflates the mean and the standard deviation it is being measured against. In
 * a set like [2, 3, 2, 3, 2, 40] the 40 drags the mean to 8.7 and the sd to
 * 15.3, scoring itself at a mild 2.05 - so the one value you are looking for
 * hides behind its own effect on the yardstick. That is the masking problem,
 * and with the handful of staff accounts this app compares it is the normal
 * case rather than an edge case.
 *
 * The median and the median absolute deviation are not moved by a few extreme
 * points, so the same 40 scores above 50. The 0.6745 constant rescales MAD so a
 * modified z reads on the same scale as an ordinary one for normally
 * distributed data, which keeps thresholds like "3 sigma" meaningful.
 *
 * MAD is zero whenever more than half the values are identical - common for
 * small integer counts - so fall back to the standard deviation there, and
 * report all-zero when even that is flat.
 */
const robustZScores = (values) => {
  if (values.length === 0) return [];

  const mad = medianAbsoluteDeviation(values);

  if (mad > 0) {
    const centre = median(values);
    return values.map((value) => (0.6745 * (value - centre)) / mad);
  }

  const spread = standardDeviation(values);
  if (spread === 0) return values.map(() => 0);

  const average = mean(values);
  return values.map((value) => (value - average) / spread);
};

/** Average demand for each day-of-week, as a multiplier around the overall mean. */
const weekdayProfile = (dates, values) => {
  const buckets = Array.from({ length: 7 }, () => []);

  dates.forEach((date, index) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    buckets[weekday].push(values[index]);
  });

  const overall = mean(values);

  return buckets.map((bucket) => {
    if (bucket.length === 0 || overall === 0) return 1;
    return mean(bucket) / overall;
  });
};

module.exports = {
  DAY_MS,
  startOfDay,
  dayKey,
  addDays,
  toDailySeries,
  mean,
  standardDeviation,
  median,
  medianAbsoluteDeviation,
  robustZScores,
  weekdayProfile,
};
