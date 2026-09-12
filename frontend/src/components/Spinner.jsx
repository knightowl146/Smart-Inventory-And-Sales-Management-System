const Spinner = ({ label = "Loading…" }) => {
  return (
    <div className="state-block">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
};

export default Spinner;