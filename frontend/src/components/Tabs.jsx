const Tabs = ({ tabs, active, onChange, label }) => {
  const handleKeyDown = (event, index) => {
    const isNext = event.key === "ArrowRight";
    const isPrev = event.key === "ArrowLeft";
    const isHome = event.key === "Home";
    const isEnd = event.key === "End";

    if (!isNext && !isPrev && !isHome && !isEnd) return;

    event.preventDefault();

    let nextIndex = index;
    if (isNext) nextIndex = (index + 1) % tabs.length;
    if (isPrev) nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (isHome) nextIndex = 0;
    if (isEnd) nextIndex = tabs.length - 1;

    onChange(tabs[nextIndex].key);
    document.getElementById(`tab-${tabs[nextIndex].key}`)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          id={`tab-${tab.key}`}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          aria-controls={`panel-${tab.key}`}
          tabIndex={active === tab.key ? 0 : -1}
          className={`tabs__item${active === tab.key ? " tabs__item--active" : ""}`}
          onClick={() => onChange(tab.key)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default Tabs;