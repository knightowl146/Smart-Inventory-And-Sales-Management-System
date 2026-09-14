import { useCallback, useEffect, useRef, useState } from "react";
import { askAssistant, getAiStatus } from "../api/intelligence";
import { useAuth } from "../context/authContext";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";

/**
 * Ask your inventory.
 *
 * Two design choices worth noting:
 *
 *   - Every answer shows which lookups produced it. The assistant is only
 *     trustworthy to the extent you can check it, and "get_profit_and_loss,
 *     get_top_products" under an answer is how you check it.
 *   - A refusal is displayed as a refusal, not as an error. An employee asking
 *     about margin gets a clear "that is owner-only", which is the honest
 *     answer rather than a broken-looking page.
 */

const OWNER_SUGGESTIONS = [
  "Which products made the most profit last month?",
  "What was our margin over the last 30 days?",
  "What should I reorder this week?",
  "Which categories are growing?",
  "What has not sold in 60 days?",
];

const EMPLOYEE_SUGGESTIONS = [
  "What is running low on stock?",
  "Find toothpaste in the catalogue",
  "How many units of Colgate do we have?",
];

const Ask = () => {
  const { isOwner } = useAuth();

  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);

  const endRef = useRef(null);

  useEffect(() => {
    if (!isOwner) return;

    getAiStatus()
      .then((response) => setStatus(response.data.data))
      .catch(() => setStatus(null));
  }, [isOwner]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [exchanges]);

  const submit = useCallback(
    async (text) => {
      const asked = (text ?? question).trim();
      if (!asked || busy) return;

      setBusy(true);
      setError("");
      setQuestion("");

      try {
        const response = await askAssistant(asked);
        setExchanges((previous) => [...previous, response.data.data]);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [question, busy]
  );

  const suggestions = isOwner ? OWNER_SUGGESTIONS : EMPLOYEE_SUGGESTIONS;

  return (
    <>
      <div className="page-toolbar">
        <h2 className="panel__title">Ask your inventory</h2>
        {status && (
          <span className="field-hint">
            {status.configured
              ? `AI budget ${status.budgetRemainingPercent}% remaining`
              : "Assistant not configured"}
          </span>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="panel ask">
        {exchanges.length === 0 && !busy && (
          <div className="ask__intro">
            <p>
              Ask a question in plain English. The assistant looks the answer up
              through the same data the rest of the app uses — it never
              estimates, and it only sees what your role is allowed to see.
            </p>
            <div className="ask__suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="ask__suggestion"
                  onClick={() => submit(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {exchanges.map((exchange, index) => (
          <div className="ask__exchange" key={index}>
            <p className="ask__question">{exchange.question}</p>

            <div className={`ask__answer${exchange.refused ? " ask__answer--refused" : ""}`}>
              <p>{exchange.answer}</p>

              {exchange.toolCalls.length > 0 && (
                <div className="ask__tools">
                  <span className="ask__tools-label">Looked up</span>
                  {exchange.toolCalls.map((call, callIndex) => (
                    <code
                      key={`${call.name}-${callIndex}`}
                      className={call.refused ? "ask__tool ask__tool--refused" : "ask__tool"}
                    >
                      {call.name}
                      {call.refused ? " (not permitted)" : ""}
                    </code>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && <Spinner label="Looking that up…" />}

        <div ref={endRef} />

        <form
          className="ask__form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            id="ask-question"
            type="text"
            value={question}
            placeholder="Which products made the most profit last month?"
            maxLength={500}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || question.trim().length === 0}>
            Ask
          </Button>
        </form>
      </div>
    </>
  );
};

export default Ask;
