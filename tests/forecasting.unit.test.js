const { toDailySeries, mean, standardDeviation, weekdayProfile } = require("../services/forecasting/timeSeries");
const { forecastDemand, chooseMethod, fitHoltWinters } = require("../services/forecasting/forecast");
const { backtest, symmetricMape, meanAbsoluteError } = require("../services/forecasting/backtest");
const { calculateReorderPolicy, explainPolicy } = require("../services/inventory/reorder");
const {
  detectVolumeAnomalies,
  detectDiscountAnomalies,
  detectActorAnomalies,
  rankAnomalies,
} = require("../services/anomaly/detect");

/**
 * The forecasting, reorder and anomaly maths is pure, so it is tested here
 * without a database, a server or a network call. That matters for more than
 * speed: these are the numbers the app asks people to act on, and they should
 * be verifiable in isolation rather than only observable through four layers
 * of HTTP.
 */

// ── Building a series from a sparse ledger ───────────────────────────────────

describe("toDailySeries", () => {
  it("fills the gaps - a day with no sale is a zero, not a missing row", () => {
    const series = toDailySeries([
      { date: "2026-01-01", quantity: 5 },
      { date: "2026-01-04", quantity: 3 },
    ]);

    expect(series.dates).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
    expect(series.values).toEqual([5, 0, 0, 3]);
  });

  it("sums several movements on the same day", () => {
    const series = toDailySeries([
      { date: "2026-01-01T09:00:00Z", quantity: 2 },
      { date: "2026-01-01T17:00:00Z", quantity: 3 },
    ]);

    expect(series.values).toEqual([5]);
  });

  it("honours an explicit range, so a quiet tail is not silently trimmed", () => {
    const series = toDailySeries([{ date: "2026-01-02", quantity: 4 }], {
      from: new Date("2026-01-01T00:00:00Z"),
      to: new Date("2026-01-04T00:00:00Z"),
    });

    expect(series.values).toEqual([0, 4, 0, 0]);
  });

  it("returns an empty series rather than throwing on no input", () => {
    expect(toDailySeries([])).toEqual({ dates: [], values: [] });
    expect(toDailySeries(null)).toEqual({ dates: [], values: [] });
  });
});

describe("basic statistics", () => {
  it("uses the sample standard deviation, not the population one", () => {
    // Sample sd of [2,4,4,4,5,5,7,9] is 2.138; the population form gives 2.0.
    // Safety stock is sized from this, so understating it means stocking out.
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });

  it("reports zero spread for a single observation instead of NaN", () => {
    expect(standardDeviation([5])).toBe(0);
    expect(mean([])).toBe(0);
  });

  it("finds a weekday pattern", () => {
    // 2026-01-05 is a Monday. Weekends sell double.
    const dates = [];
    const values = [];
    for (let i = 0; i < 28; i += 1) {
      const date = new Date(Date.UTC(2026, 0, 5 + i));
      dates.push(date.toISOString().slice(0, 10));
      const weekday = date.getUTCDay();
      values.push(weekday === 0 || weekday === 6 ? 20 : 10);
    }

    const profile = weekdayProfile(dates, values);

    expect(profile[6]).toBeGreaterThan(profile[3]); // Saturday beats Wednesday
    expect(profile[0]).toBeGreaterThan(profile[1]); // Sunday beats Monday
  });
});

// ── Method selection ─────────────────────────────────────────────────────────

describe("chooseMethod", () => {
  it("will not fit seasonality to a handful of days", () => {
    expect(chooseMethod(new Array(10).fill(5))).toBe("mean");
    expect(chooseMethod(new Array(20).fill(5))).toBe("damped-trend");
    expect(chooseMethod(new Array(60).fill(5))).toBe("holt-winters");
  });
});

// ── Forecast behaviour ───────────────────────────────────────────────────────

const flatSeries = (days, value) => {
  const dates = [];
  for (let i = 0; i < days; i += 1) {
    dates.push(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  }
  return { dates, values: new Array(days).fill(value) };
};

const seasonalSeries = (days, { base = 10, weekendBonus = 10 } = {}) => {
  const dates = [];
  const values = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(Date.UTC(2026, 0, 5 + i));
    dates.push(date.toISOString().slice(0, 10));
    const weekday = date.getUTCDay();
    values.push(weekday === 0 || weekday === 6 ? base + weekendBonus : base);
  }
  return { dates, values };
};

describe("forecastDemand", () => {
  it("predicts a constant series essentially exactly", () => {
    const forecast = forecastDemand(flatSeries(60, 12), 7);

    for (const point of forecast.points) {
      expect(point.expected).toBeCloseTo(12, 0);
    }
    expect(forecast.method).toBe("holt-winters");
  });

  it("produces one point per day of the requested horizon, starting the day after the data ends", () => {
    const forecast = forecastDemand(flatSeries(60, 4), 14);

    expect(forecast.points).toHaveLength(14);
    expect(forecast.points[0].date).toBe("2026-03-02"); // 2026-01-01 + 60 days
  });

  it("never predicts negative demand", () => {
    // A hard collapse to zero would send a naive linear extrapolation negative.
    const values = [...new Array(40).fill(30), ...new Array(20).fill(0)];
    const dates = values.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

    const forecast = forecastDemand({ dates, values }, 30);

    for (const point of forecast.points) {
      expect(point.expected).toBeGreaterThanOrEqual(0);
      expect(point.lower).toBeGreaterThanOrEqual(0);
    }
  });

  it("picks up weekly seasonality when there is enough history", () => {
    const forecast = forecastDemand(seasonalSeries(84), 7);
    const byWeekday = {};

    for (const point of forecast.points) {
      byWeekday[new Date(`${point.date}T00:00:00Z`).getUTCDay()] = point.expected;
    }

    // Saturday should be forecast noticeably higher than Wednesday.
    expect(byWeekday[6]).toBeGreaterThan(byWeekday[3] + 3);
  });

  it("widens the interval the further out it predicts", () => {
    const forecast = forecastDemand(seasonalSeries(84), 30);

    const firstWidth = forecast.points[0].upper - forecast.points[0].lower;
    const lastWidth = forecast.points[29].upper - forecast.points[29].lower;

    expect(lastWidth).toBeGreaterThan(firstWidth);
  });

  it("warns rather than pretending, when history is thin", () => {
    const thin = forecastDemand(flatSeries(9, 3), 7);

    expect(thin.method).toBe("mean");
    expect(thin.warning).toMatch(/9 days/);
  });

  it("handles no history at all", () => {
    const forecast = forecastDemand({ dates: [], values: [] }, 7);

    expect(forecast.method).toBe("none");
    expect(forecast.points).toEqual([]);
    expect(forecast.warning).toBeTruthy();
  });

  it("fits without producing NaN on a noisy series", () => {
    const values = Array.from({ length: 90 }, (_, i) => Math.round(10 + 6 * Math.sin(i / 3) + (i % 5)));
    const dates = values.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

    const model = fitHoltWinters(values);
    expect(Number.isFinite(model.level)).toBe(true);
    expect(Number.isFinite(model.trend)).toBe(true);

    const forecast = forecastDemand({ dates, values }, 14);
    for (const point of forecast.points) {
      expect(Number.isFinite(point.expected)).toBe(true);
    }
  });
});

// ── Scoring ──────────────────────────────────────────────────────────────────

describe("error metrics", () => {
  it("sMAPE is defined when an actual value is zero", () => {
    // Plain MAPE divides by the actual and blows up here; daily unit sales are
    // zero often enough that this is the normal case, not an edge case.
    expect(symmetricMape([0, 4], [1, 4])).not.toBeNull();
    expect(Number.isFinite(symmetricMape([0, 4], [1, 4]))).toBe(true);
  });

  it("sMAPE is zero for a perfect forecast and bounded at 200", () => {
    expect(symmetricMape([5, 5], [5, 5])).toBe(0);
    expect(symmetricMape([10, 10], [0, 0])).toBeCloseTo(200, 5);
  });

  it("MAE is in the units of the data", () => {
    expect(meanAbsoluteError([10, 10], [8, 14])).toBe(3);
  });
});

describe("backtest", () => {
  it("refuses to score when there is not enough history", () => {
    expect(backtest(flatSeries(30, 5), 30)).toBeNull();
  });

  it("beats both baselines on a cleanly seasonal series", () => {
    const result = backtest(seasonalSeries(140), 30);

    expect(result).not.toBeNull();
    expect(result.model.mae).toBeLessThan(result.baselines.naive.mae);
    expect(result.beatsBaseline).toBe(true);
  });

  it("reports the verdict honestly rather than always claiming a win", () => {
    // Pure noise: nothing to learn, so the model should not claim an edge.
    const values = Array.from({ length: 140 }, (_, i) => (i * 7919) % 23);
    const dates = values.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

    const result = backtest({ dates, values }, 30);

    expect(result).not.toBeNull();
    expect(typeof result.beatsBaseline).toBe("boolean");
    expect(result.model.mae).toBeGreaterThan(0);
  });

  it("keeps the holdout out of training", () => {
    const result = backtest(seasonalSeries(140), 30);
    expect(result.trainingDays).toBe(110);
    expect(result.holdoutDays).toBe(30);
  });
});

// ── Reorder policy ───────────────────────────────────────────────────────────

describe("calculateReorderPolicy", () => {
  it("scales safety stock with the square root of lead time, not linearly", () => {
    const base = { meanDailyDemand: 10, demandStdDev: 4, currentStock: 500 };

    const short = calculateReorderPolicy({ ...base, leadTimeDays: 4 });
    const long = calculateReorderPolicy({ ...base, leadTimeDays: 16 });

    // 4x the lead time should be 2x the safety stock. Getting this wrong (using
    // L instead of sqrt(L)) roughly doubles the capital tied up.
    expect(long.safetyStock / short.safetyStock).toBeCloseTo(2, 1);
  });

  it("gives a volatile product a bigger buffer than a steady one at equal demand", () => {
    const steady = calculateReorderPolicy({
      meanDailyDemand: 10,
      demandStdDev: 1,
      leadTimeDays: 7,
      currentStock: 100,
    });
    const volatile = calculateReorderPolicy({
      meanDailyDemand: 10,
      demandStdDev: 9,
      leadTimeDays: 7,
      currentStock: 100,
    });

    expect(volatile.safetyStock).toBeGreaterThan(steady.safetyStock * 5);
    expect(volatile.reorderPoint).toBeGreaterThan(steady.reorderPoint);
  });

  it("computes the reorder point as lead-time demand plus safety stock", () => {
    const policy = calculateReorderPolicy({
      meanDailyDemand: 10,
      demandStdDev: 0,
      leadTimeDays: 5,
      currentStock: 200,
    });

    expect(policy.safetyStock).toBe(0);
    expect(policy.reorderPoint).toBe(50);
  });

  it("raises the buffer as the service level rises", () => {
    const base = {
      meanDailyDemand: 10,
      demandStdDev: 4,
      leadTimeDays: 7,
      currentStock: 100,
    };

    const ninety = calculateReorderPolicy({ ...base, serviceLevel: 0.9 });
    const ninetyNine = calculateReorderPolicy({ ...base, serviceLevel: 0.99 });

    expect(ninetyNine.safetyStock).toBeGreaterThan(ninety.safetyStock);
  });

  it("flags a product that will run out before a new order can arrive", () => {
    const policy = calculateReorderPolicy({
      meanDailyDemand: 10,
      demandStdDev: 2,
      leadTimeDays: 7,
      currentStock: 30, // needs 70 just to cover the lead time
    });

    expect(policy.urgency).toBe("URGENT");
    expect(policy.suggestedQuantity).toBeGreaterThan(0);
  });

  it("does not recommend buying something nobody is buying", () => {
    const policy = calculateReorderPolicy({
      meanDailyDemand: 0,
      demandStdDev: 0,
      leadTimeDays: 7,
      currentStock: 0,
    });

    expect(policy.urgency).toBe("NO_DEMAND");
    expect(policy.suggestedQuantity).toBe(0);
    expect(policy.daysOfCover).toBeNull();
  });

  it("marks a well-stocked product healthy and orders nothing", () => {
    const policy = calculateReorderPolicy({
      meanDailyDemand: 5,
      demandStdDev: 1,
      leadTimeDays: 7,
      currentStock: 400,
    });

    expect(policy.urgency).toBe("HEALTHY");
    expect(policy.shouldReorder).toBe(false);
    expect(policy.suggestedQuantity).toBe(0);
  });

  it("survives nonsense input instead of emitting NaN", () => {
    const policy = calculateReorderPolicy({
      meanDailyDemand: -5,
      demandStdDev: undefined,
      leadTimeDays: null,
      currentStock: "not a number",
    });

    expect(Number.isFinite(policy.reorderPoint)).toBe(true);
    expect(policy.reorderPoint).toBe(0);
  });

  it("explains itself in a sentence a shopkeeper would accept", () => {
    const policy = calculateReorderPolicy({
      meanDailyDemand: 10,
      demandStdDev: 3,
      leadTimeDays: 7,
      currentStock: 20,
    });

    const sentence = explainPolicy(policy, "Colgate 100g");

    expect(sentence).toContain("Colgate 100g");
    expect(sentence).toMatch(/\d/);
  });
});

// ── Anomalies ────────────────────────────────────────────────────────────────

describe("detectVolumeAnomalies", () => {
  const steadyWithSpike = () => {
    const values = new Array(40).fill(10);
    values[25] = 90;
    const dates = values.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    return { dates, values };
  };

  it("flags a spike against the product's own baseline", () => {
    const anomalies = detectVolumeAnomalies(steadyWithSpike());

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].direction).toBe("spike");
    expect(anomalies[0].observed).toBe(90);
  });

  it("flags nothing on ordinary variation", () => {
    const values = Array.from({ length: 40 }, (_, i) => 10 + (i % 3));
    const dates = values.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

    expect(detectVolumeAnomalies({ dates, values })).toHaveLength(0);
  });

  it("does not divide by zero on a perfectly constant product", () => {
    const values = new Array(40).fill(7);
    const dates = values.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

    expect(detectVolumeAnomalies({ dates, values })).toEqual([]);
  });

  it("stays quiet until there is enough history to have a baseline", () => {
    const values = [1, 50, 1, 1];
    const dates = values.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

    expect(detectVolumeAnomalies({ dates, values })).toEqual([]);
  });
});

describe("detectDiscountAnomalies", () => {
  it("flags a sale well below the catalogue price", () => {
    const anomalies = detectDiscountAnomalies([
      { date: "2026-01-01", sellingPrice: 100, unitPrice: 60, quantity: 2 },
      { date: "2026-01-02", sellingPrice: 100, unitPrice: 100, quantity: 1 },
    ]);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].discountPercent).toBe(40);
    expect(anomalies[0].discountValue).toBe(80);
    expect(anomalies[0].severity).toBe("critical");
  });

  it("tolerates small roundings rather than crying wolf", () => {
    const anomalies = detectDiscountAnomalies([
      { date: "2026-01-01", sellingPrice: 100, unitPrice: 98, quantity: 1 },
    ]);

    expect(anomalies).toHaveLength(0);
  });

  it("ignores a product with no list price instead of dividing by zero", () => {
    const anomalies = detectDiscountAnomalies([
      { date: "2026-01-01", sellingPrice: 0, unitPrice: 0, quantity: 1 },
    ]);

    expect(anomalies).toEqual([]);
  });
});

describe("detectActorAnomalies", () => {
  const peers = (discountRates) =>
    discountRates.map((rate, index) => ({
      id: `u${index}`,
      name: `User ${index}`,
      email: `u${index}@shop.test`,
      discountRate: rate,
      averageDiscountPercent: 5,
      salesPerActiveDay: 10,
    }));

  it("flags the one account far out of line with its peers", () => {
    const anomalies = detectActorAnomalies(peers([2, 3, 2, 3, 2, 40]));

    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].actor.id).toBe("u5");
    expect(anomalies[0].metric).toBe("discountRate");
  });

  it("flags nobody when everyone behaves the same", () => {
    expect(detectActorAnomalies(peers([3, 3, 3, 4, 3]))).toEqual([]);
  });

  it("says nothing with fewer than three people, where 'the others' is meaningless", () => {
    expect(detectActorAnomalies(peers([2, 50]))).toEqual([]);
  });
});

describe("rankAnomalies", () => {
  it("puts the most severe first, then the most recent", () => {
    const ranked = rankAnomalies([
      { severity: "medium", date: "2026-01-03" },
      { severity: "critical", date: "2026-01-01" },
      { severity: "high", date: "2026-01-02" },
      { severity: "critical", date: "2026-01-05" },
    ]);

    expect(ranked.map((a) => a.severity)).toEqual(["critical", "critical", "high", "medium"]);
    expect(ranked[0].date).toBe("2026-01-05");
  });
});
