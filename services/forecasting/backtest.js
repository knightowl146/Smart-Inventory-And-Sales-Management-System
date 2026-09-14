const { forecastDemand } = require("./forecast");
const { mean } = require("./timeSeries");

/**
 * Does the forecast actually work?
 *
 * A forecast without a stated error rate is a line on a chart. This holds out
 * the most recent slice of history, forecasts it from the remainder, and scores
 * the result against two baselines that are free:
 *
 *   naive      - tomorrow looks like today
 *   seasonal   - next Tuesday looks like last Tuesday
 *
 * If the model cannot beat both, the honest thing is to say so rather than
 * ship it. `beatsBaseline` is that verdict, and the UI surfaces it.
 */

const HOLDOUT_DAYS = 30;

/** Mean absolute error - same units as the data, so "out by 3 units a day". */
const meanAbsoluteError = (actual, predicted) => {
  if (actual.length === 0) return null;
  return mean(actual.map((value, index) => Math.abs(value - predicted[index])));
};

/**
 * Root mean squared error. Kept alongside MAE because it punishes the large
 * misses that empty a shelf, which is the error that actually costs money.
 */
const rootMeanSquaredError = (actual, predicted) => {
  if (actual.length === 0) return null;
  return Math.sqrt(mean(actual.map((value, index) => (value - predicted[index]) ** 2)));
};

/**
 * Symmetric MAPE.
 *
 * Plain MAPE divides by the actual value, and daily unit sales are frequently
 * zero, which makes it either infinite or silently computed over a filtered
 * subset - both useless. sMAPE stays bounded at 200% and is defined when either
 * side is zero, which is the common case here.
 */
const symmetricMape = (actual, predicted) => {
  const usable = actual
    .map((value, index) => [value, predicted[index]])
    .filter(([a, p]) => Math.abs(a) + Math.abs(p) > 0);

  if (usable.length === 0) return null;

  const errors = usable.map(
    ([a, p]) => (200 * Math.abs(a - p)) / (Math.abs(a) + Math.abs(p))
  );

  return mean(errors);
};

const round = (value) => (value === null ? null : Number(value.toFixed(2)));

/**
 * @param {{dates: string[], values: number[]}} series
 * @param {number} [holdout] days to hold out
 * @returns {object|null} null when there is not enough history to score anything
 */
const backtest = (series, holdout = HOLDOUT_DAYS) => {
  const values = series?.values ?? [];
  const dates = series?.dates ?? [];

  // Need a training window worth fitting plus the holdout itself. Below this,
  // a score would be noise dressed up as a metric.
  if (values.length < holdout + 21) return null;

  const splitAt = values.length - holdout;
  const train = { dates: dates.slice(0, splitAt), values: values.slice(0, splitAt) };
  const actual = values.slice(splitAt);

  const forecast = forecastDemand(train, holdout);
  const predicted = forecast.points.map((point) => point.expected);

  const lastTrainValue = train.values[train.values.length - 1];
  const naive = actual.map(() => lastTrainValue);

  const seasonalNaive = actual.map((_, index) => {
    const source = splitAt + index - 7;
    return source >= 0 ? values[source] : lastTrainValue;
  });

  const score = (predictions) => ({
    mae: round(meanAbsoluteError(actual, predictions)),
    rmse: round(rootMeanSquaredError(actual, predictions)),
    smape: round(symmetricMape(actual, predictions)),
  });

  const model = score(predicted);
  const naiveScore = score(naive);
  const seasonalScore = score(seasonalNaive);

  const beatsBaseline =
    model.mae !== null &&
    naiveScore.mae !== null &&
    seasonalScore.mae !== null &&
    model.mae <= naiveScore.mae &&
    model.mae <= seasonalScore.mae;

  return {
    method: forecast.method,
    holdoutDays: holdout,
    trainingDays: splitAt,
    model,
    baselines: { naive: naiveScore, seasonalNaive: seasonalScore },
    beatsBaseline,
    // How much better (or worse) than the stronger of the two baselines, as a
    // percentage. Negative means the baseline won.
    improvementOverBest:
      model.mae === null
        ? null
        : round(
            ((Math.min(naiveScore.mae, seasonalScore.mae) - model.mae) /
              Math.max(Math.min(naiveScore.mae, seasonalScore.mae), 1e-9)) *
              100
          ),
  };
};

module.exports = {
  HOLDOUT_DAYS,
  meanAbsoluteError,
  rootMeanSquaredError,
  symmetricMape,
  backtest,
};
