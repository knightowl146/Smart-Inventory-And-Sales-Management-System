const StatCard = ({ label, value, tone }) => {
  return (
    <div className={`stat-card${tone ? ` stat-card--${tone}` : ""}`}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
    </div>
  );
};

export default StatCard;