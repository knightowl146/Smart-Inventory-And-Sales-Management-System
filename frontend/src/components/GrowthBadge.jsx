const GrowthBadge = ({ value }) => {
  if (value === null || value === undefined) {
    return <span className="growth-badge growth-badge--flat">—</span>;
  }

  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const sign = value > 0 ? "+" : "";

  return (
    <span className={`growth-badge growth-badge--${tone}`}>
      {sign}
      {value.toFixed(1)}% vs previous period
    </span>
  );
};

export default GrowthBadge;