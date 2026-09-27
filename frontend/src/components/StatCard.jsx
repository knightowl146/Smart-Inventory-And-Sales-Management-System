import { formatNumber } from "../utils/format";

/**
 * A plain number is grouped for reading (5,367, not 5367). Money arrives
 * already formatted as a string - formatMoney at the call site - because only
 * the caller knows whether a figure is rupees or units.
 */
const StatCard = ({ label, value, tone }) => {
  const shown = typeof value === "number" ? formatNumber(value) : value;
  const length = String(shown ?? "").length;

  // A crore-sized rupee figure is twice as wide as a count. Stepping the size
  // down keeps it on one line instead of wrapping in the middle of a number.
  const size = length > 13 ? " stat-card__value--longer" : length > 9 ? " stat-card__value--long" : "";

  return (
    <div className={`stat-card${tone ? ` stat-card--${tone}` : ""}`}>
      <p className="stat-card__label">{label}</p>
      <p className={`stat-card__value${size}`}>{shown}</p>
    </div>
  );
};

export default StatCard;
