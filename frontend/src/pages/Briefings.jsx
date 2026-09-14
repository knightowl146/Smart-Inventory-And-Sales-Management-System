import { useCallback, useEffect, useState } from "react";
import { getBriefings, generateBriefing } from "../api/intelligence";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";

/**
 * Weekly briefings.
 *
 * Stored rather than generated on view, so this costs one model call a week
 * instead of one per page load, and so the owner can scroll back through
 * previous weeks. Each briefing carries the figures it was written from, shown
 * underneath, so the prose can be checked against the arithmetic.
 */
const Briefings = () => {
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getBriefings({ limit: 12 });
      setBriefings(response.data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setError("");

    try {
      await generateBriefing(7);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Business briefings</h2>
        <Button onClick={generate} disabled={generating}>
          {generating ? "Writing…" : "Generate this week's"}
        </Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading && <Spinner label="Loading briefings…" />}

      {!loading && briefings.length === 0 && (
        <div className="panel">
          <EmptyState message="No briefings yet. Generate one, or schedule the weekly job." />
          <p className="field-hint">
            On the server, <code>npm run briefing</code> generates one — point a
            weekly cron at it and this page fills itself in.
          </p>
        </div>
      )}

      {briefings.map((briefing) => (
        <div className="panel briefing" key={briefing._id}>
          <div className="briefing__head">
            <h3 className="panel__title">{briefing.headline}</h3>
            <span className={`badge badge--${briefing.source === "ai" ? "info" : "healthy"}`}>
              {briefing.source === "ai" ? "written by AI" : "generated without AI"}
            </span>
          </div>

          <p className="field-hint">
            {new Date(briefing.periodStart).toLocaleDateString()} –{" "}
            {new Date(briefing.periodEnd).toLocaleDateString()}
          </p>

          {briefing.highlights.length > 0 && (
            <ul className="simple-list">
              {briefing.highlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          )}

          {briefing.actions.length > 0 && (
            <>
              <h4 className="briefing__subhead">Worth doing next</h4>
              <ul className="simple-list">
                {briefing.actions.map((action, index) => (
                  <li key={index}>{action}</li>
                ))}
              </ul>
            </>
          )}

          {briefing.metrics?.current && (
            <div className="briefing__metrics">
              <span>
                Revenue <strong>{briefing.metrics.current.revenue}</strong>
              </span>
              <span>
                Units <strong>{briefing.metrics.current.units}</strong>
              </span>
              <span>
                Sales <strong>{briefing.metrics.current.transactions}</strong>
              </span>
              <span>
                Margin <strong>{briefing.metrics.marginPercent}%</strong>
              </span>
              {briefing.metrics.change?.revenuePercent !== null && (
                <span>
                  Change{" "}
                  <strong
                    className={
                      briefing.metrics.change.revenuePercent >= 0 ? "" : "text-negative"
                    }
                  >
                    {briefing.metrics.change.revenuePercent}%
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
};

export default Briefings;
