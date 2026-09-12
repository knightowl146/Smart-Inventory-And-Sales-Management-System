import { useState } from "react";
import Button from "./Button";

const DateRangeFilter = ({ onApply }) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    onApply({ startDate: startDate || undefined, endDate: endDate || undefined });
  };

  const handleClear = () => {
    setStartDate("");
    setEndDate("");
    onApply({ startDate: undefined, endDate: undefined });
  };

  return (
    <form className="date-range-filter" onSubmit={handleSubmit}>
      <label>
        From
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label>
        To
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <Button type="submit" variant="secondary">Apply</Button>
      <Button type="button" variant="secondary" onClick={handleClear}>Clear</Button>
    </form>
  );
};

export default DateRangeFilter;