const { forecastDemand, SEASON_LENGTH } = require("./forecast");
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

  /**
   * Length is not the same as content.
   *
   * A product that has never sold produces a series of zeros as long as the
   * lookback window, which passes the length check above and then scores a
   * flawless MAE of 0 against baselines that also score 0 - "the model
   * perfectly predicts nothing", reported as if it were an achievement, and
   * `beatsBaseline: true` to go with it. There has to be demand in the
   * training window before an accuracy figure means anything.
   */
  const MIN_SELLING_DAYS = 10;
  const sellingDays = values.slice(0, splitAt).filter((value) => value > 0).length;

  if (sellingDays < MIN_SELLING_DAYS) return null;

  const train = { dates: dates.slice(0, splitAt), values: values.slice(0, splitAt) };
  const actual = values.slice(splitAt);

  const forecast = forecastDemand(train, holdout);
  const predicted = forecast.points.map((point) => point.expected);

  const lastTrainValue = train.values[train.values.length - 1];
  const naive = actual.map(() => lastTrainValue);

  /**
   * Seasonal naive: repeat the last full week of TRAINING data.
   *
   * The obvious formulation - "the value seven days before this one" - is a
   * leak, and a well-hidden one. Seven days into a thirty-day holdout it stops
   * reading training data and starts reading the holdout itself, so for
   * twenty-three of the thirty days the baseline is quoting the answers it is
   * supposed to be predicting. It scored accordingly, and the model looked
   * mediocre next to a baseline that could see the future.
   *
   * A real multi-step seasonal naive only knows the training window, so it
   * repeats the last complete week of it, which is what a shopkeeper doing
   * this in their head would do.
   */
  const lastWeek = train.values.slice(-SEASON_LENGTH);
  const seasonalNaive = actual.map((_, index) =>
    lastWeek.length === SEASON_LENGTH ? lastWeek[index % SEASON_LENGTH] : lastTrainValue
  );

  const score = (predictions) => ({
    mae: round(meanAbsoluteError(actual, predictions)),
    rmse: round(rootMeanSquaredError(actual, predictions)),
    smape: round(symmetricMape(actual, predictions)),
  });

  const model = score(predicted);
  const naiveScore = score(naive);
  const seasonalScore = score(seasonalNaive);

  /**
   * Total over the window, which is the number the shop actually spends money
   * on: how many to have in stock before the next delivery arrives.
   */
  const total = (series) => series.reduce((sum, value) => sum + value, 0);
  const actualTotal = total(actual);

  const totalError = (predictions) => round(Math.abs(total(predictions) - actualTotal));

  const cumulative = {
    actual: round(actualTotal),
    model: round(total(predicted)),
    modelError: totalError(predicted),
    naiveError: totalError(naive),
    seasonalNaiveError: totalError(seasonalNaive),
  };

  /**
   * Which yardstick decides the verdict, and why it is not always MAE.
   *
   * Mean absolute error is minimised by the median of the data. For a product
   * that sells on one day in five, the median is zero - so "predict nothing,
   * ever" is the MAE-optimal forecast and literally no method can beat it.
   * Reporting that as "the model loses to the baseline" would be arithmetically
   * true and completely misleading: a shop that follows the zero forecast never
   * reorders the laptop and is out of stock for a month.
   *
   * So for intermittent demand the verdict is scored on what the forecast is
   * used for - the total over the window, which is what the reorder point is
   * computed from - where predicting zero is exactly as wrong as it deserves to
   * be. Smooth demand keeps the day-by-day comparison, where the shape of the
   * week genuinely matters. `criterion` says which was applied, so the number on
   * screen is never a verdict whose basis has been quietly switched.
   */
  const criterion = forecast.method === "croston" ? "total-over-window" : "daily-mae";

  const beatsBaseline =
    criterion === "total-over-window"
      ? cumulative.modelError <= cumulative.naiveError &&
        cumulative.modelError <= cumulative.seasonalNaiveError
      : model.mae !== null &&
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
    cumulative,
    criterion,
    beatsBaseline,
    // How much better (or worse) than the stronger of the two baselines, as a
    // percentage, on whichever criterion decided the verdict. Negative means
    // the baseline won.
    improvementOverBest: (() => {
      /**
       * Floors on the denominator, because a ratio against a near-zero error
       * is not a measurement. A baseline that happens to land within a unit of
       * the right answer once would otherwise make the model look a hundred
       * billion percent worse - a number that says nothing except that
       * something was divided by almost nothing. One whole unit on a monthly
       * total, and a tenth of a unit a day, are both below the resolution
       * anyone can act on, so they are the smallest errors worth comparing
       * against. The result is clamped for the same reason.
       */
      const compare = (best, actualError) =>
        round(Math.max(-999, Math.min(999, ((best - actualError) / best) * 100)));

      if (criterion === "total-over-window") {
        const best = Math.max(
          Math.min(cumulative.naiveError, cumulative.seasonalNaiveError),
          1
        );
        return compare(best, cumulative.modelError);
      }

      if (model.mae === null) return null;

      const best = Math.max(Math.min(naiveScore.mae, seasonalScore.mae), 0.1);
      return compare(best, model.mae);
    })(),
  };
};

module.exports = {
  HOLDOUT_DAYS,
  meanAbsoluteError,
  rootMeanSquaredError,
  symmetricMape,
  backtest,
};
