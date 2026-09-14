const { mean, median, robustZScores } = require("../forecasting/timeSeries");

/**
 * Anomaly detection over the sales ledger.
 *
 * Everything here is deterministic. Gemini's only job downstream is turning a
 * flagged row into a readable sentence - it never decides what is anomalous,
 * because a model that can be talked into or out of a judgement is not a
 * control.
 *
 * Three families, because they catch genuinely different problems:
 *
 *   volume      a product's daily sales jump or collapse versus its own norm
 *   discount    a sale recorded below the product's selling price
 *   actor       one staff account behaving unlike the others
 *
 * Note the second and third only became possible once authentication landed:
 * before `createdBy` existed there was nobody to attribute a movement to.
 */

const DEFAULT_Z_THRESHOLD = 3;
const MIN_OBSERVATIONS = 14;

const round = (value) => Number(value.toFixed(2));

const severityFromZ = (z) => {
  const magnitude = Math.abs(z);
  if (magnitude >= 5) return "critical";
  if (magnitude >= 4) return "high";
  return "medium";
};

/**
 * Volume anomalies: a day whose demand is far from that product's own baseline.
 *
 * Each product is scored against itself, not against the catalogue. A shop's
 * best seller moving 200 units is normal; a slow item moving 200 is not, and a
 * single global threshold would flag the first and miss the second.
 */
const detectVolumeAnomalies = (series, { threshold = DEFAULT_Z_THRESHOLD } = {}) => {
  const values = series?.values ?? [];
  const dates = series?.dates ?? [];

  if (values.length < MIN_OBSERVATIONS) return [];

  const zScores = robustZScores(values);
  const baseline = median(values);

  // All-zero scores mean the series is flat - nothing to flag, and nothing to
  // divide by either.
  if (zScores.every((z) => z === 0)) return [];

  const anomalies = [];

  values.forEach((value, index) => {
    const z = zScores[index];

    if (Math.abs(z) >= threshold) {
      anomalies.push({
        type: "volume",
        date: dates[index],
        observed: value,
        expected: round(baseline),
        z: round(z),
        direction: z > 0 ? "spike" : "collapse",
        severity: severityFromZ(z),
      });
    }
  });

  return anomalies;
};

/**
 * Discount anomalies: a sale recorded below the catalogue selling price.
 *
 * This is the shrinkage case. It is not evidence of anything on its own - a
 * manager may have authorised it - but an unexplained pattern of them, keyed to
 * one account, is exactly what an owner wants surfaced.
 */
const detectDiscountAnomalies = (
  sales,
  { tolerancePercent = 5, minDiscountValue = 0 } = {}
) => {
  const anomalies = [];

  for (const sale of sales) {
    const listPrice = Number(sale.sellingPrice ?? 0);
    const paid = Number(sale.unitPrice ?? 0);

    if (listPrice <= 0) continue;

    const discountPercent = ((listPrice - paid) / listPrice) * 100;
    const discountValue = (listPrice - paid) * Number(sale.quantity ?? 0);

    if (discountPercent > tolerancePercent && discountValue > minDiscountValue) {
      anomalies.push({
        type: "discount",
        date: sale.date,
        movementId: sale.movementId ?? null,
        product: sale.product ?? null,
        actor: sale.actor ?? null,
        listPrice,
        soldAt: paid,
        quantity: Number(sale.quantity ?? 0),
        discountPercent: round(discountPercent),
        discountValue: round(discountValue),
        severity:
          discountPercent >= 40 ? "critical" : discountPercent >= 20 ? "high" : "medium",
      });
    }
  }

  return anomalies;
};

/**
 * Actor anomalies: one staff account unlike its peers.
 *
 * Compared across people rather than over time, so it catches a pattern that is
 * consistent - and therefore invisible to a time-series check - but out of line
 * with everyone else. Needs at least three actors before "the others" means
 * anything; with two people, whoever sells more is not an anomaly.
 */
const detectActorAnomalies = (actorStats, { threshold = 2.5 } = {}) => {
  if (!Array.isArray(actorStats) || actorStats.length < 3) return [];

  const anomalies = [];

  const metrics = [
    { key: "discountRate", label: "discounting rate", unit: "%" },
    { key: "averageDiscountPercent", label: "average discount", unit: "%" },
    { key: "salesPerActiveDay", label: "sales per day", unit: "" },
  ];

  for (const metric of metrics) {
    const values = actorStats
      .map((actor) => Number(actor[metric.key]))
      .filter((value) => Number.isFinite(value));

    if (values.length < 3) continue;

    // Robust scores, because the account being looked for is exactly the one
    // that would distort a mean-and-sd yardstick into missing it.
    const zScores = robustZScores(values);
    const peerBaseline = median(values);
    if (zScores.every((z) => z === 0)) continue;

    actorStats.forEach((actor, index) => {
      const value = Number(actor[metric.key]);
      if (!Number.isFinite(value)) return;

      const z = zScores[index];

      // Only the high side: someone discounting far less than their colleagues
      // is not a problem worth an owner's attention.
      if (z >= threshold) {
        anomalies.push({
          type: "actor",
          metric: metric.key,
          metricLabel: metric.label,
          actor: { id: actor.id, name: actor.name, email: actor.email },
          observed: round(value),
          peerAverage: round(peerBaseline),
          z: round(z),
          severity: severityFromZ(z),
        });
      }
    });
  }

  return anomalies;
};

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 };

/** Most severe first, then most recent - the order an owner wants to read in. */
const rankAnomalies = (anomalies) =>
  [...anomalies].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return String(b.date ?? "").localeCompare(String(a.date ?? ""));
  });

module.exports = {
  DEFAULT_Z_THRESHOLD,
  MIN_OBSERVATIONS,
  detectVolumeAnomalies,
  detectDiscountAnomalies,
  detectActorAnomalies,
  rankAnomalies,
  severityFromZ,
};
