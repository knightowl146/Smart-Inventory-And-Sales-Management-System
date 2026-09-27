/**
 * How numbers look on screen.
 *
 * One place, so every page agrees: rupees with Indian digit grouping
 * (₹1,00,13,270.00, not 10013270.00), counts grouped the same way, and chart
 * axes short enough to read (₹14L rather than 1400000).
 *
 * The API keeps sending plain numbers - formatting is a presentation concern,
 * and exports (CSV, Excel) need the raw values to stay sortable and summable.
 */

const LOCALE = "en-IN";
const CURRENCY = "INR";

const moneyFormatters = new Map();

const moneyFormatter = (decimals) => {
  if (!moneyFormatters.has(decimals)) {
    moneyFormatters.set(
      decimals,
      new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency: CURRENCY,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    );
  }
  return moneyFormatters.get(decimals);
};

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

/** ₹1,00,13,270.00 - or "—" when there is no figure to show. */
export const formatMoney = (value, decimals = 2) => {
  const number = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) return "—";
  return moneyFormatter(decimals).format(number);
};

/** 5,367 or 459.96 - grouped, with at most `maxDecimals` decimals. */
export const formatNumber = (value, maxDecimals = 2) => {
  if (!isNumber(value)) return value ?? "—";
  return value.toLocaleString(LOCALE, { maximumFractionDigits: maxDecimals });
};

/** 26.5% */
export const formatPercent = (value, decimals = 1) => {
  if (!isNumber(value)) return "—";
  return `${value.toFixed(decimals)}%`;
};

/**
 * Compact rupees for chart axes: ₹950, ₹35K, ₹14L, ₹1.2Cr.
 *
 * Lakh and crore rather than K/M/B, because that is how the amounts are
 * spoken about in an Indian shop - "fourteen lakh" is instant, "1.4M" is not.
 */
export const formatMoneyShort = (value) => {
  if (!isNumber(value)) return "";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const trim = (n) => Number(n.toFixed(n < 10 ? 1 : 0)).toString();

  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
};
