import { useCallback, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext";
import Spinner from "../components/Spinner";

/**
 * Demo credentials arrive as one string per role, "email / password", from
 * VITE_DEMO_OWNER and VITE_DEMO_EMPLOYEE. Split on the first slash only, so a
 * password containing one still parses.
 */
const parseDemoAccount = (value, role) => {
  if (!value) return null;

  const separator = value.indexOf("/");
  if (separator === -1) return null;

  const email = value.slice(0, separator).trim();
  const password = value.slice(separator + 1).trim();

  if (!email || !password) return null;

  return { role, email, password };
};

const Login = () => {
  const { signIn, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /**
   * One sign-in path, whether the credentials were typed, autofilled by a
   * password manager, or filled by a demo button.
   *
   * Note the deliberate absence of any autocomplete trickery on the fields
   * below. `autoComplete="username"` and `"current-password"` are what tell a
   * password manager this is a real login form, and suppressing them - the
   * usual trick being autoComplete="new-password" - breaks 1Password, Bitwarden
   * and Chrome's own manager for every real user, to solve a problem that only
   * exists while demoing. The demo buttons solve that instead: they overwrite
   * whatever was prefilled and sign in directly.
   */
  const doSignIn = useCallback(
    async (emailValue, passwordValue) => {
      setError("");
      setSubmitting(true);

      try {
        await signIn(emailValue, passwordValue);
        navigate(location.state?.from || "/", { replace: true });
      } catch (err) {
        // The API returns the same message for an unknown account and a wrong
        // password, so there is nothing to refine here.
        setError(err.message || "Could not sign in. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [signIn, navigate, location.state]
  );

  if (status === "authenticated") {
    return <Navigate to={location.state?.from || "/"} replace />;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    doSignIn(email, password);
  };

  const signInAs = (account) => {
    // Fill the visible fields too, so what happens is not a mystery - and so a
    // manager's prefilled values are visibly replaced rather than silently
    // ignored.
    setEmail(account.email);
    setPassword(account.password);
    doSignIn(account.email, account.password);
  };

  const demoAccounts = [
    parseDemoAccount(import.meta.env.VITE_DEMO_OWNER, "owner"),
    parseDemoAccount(import.meta.env.VITE_DEMO_EMPLOYEE, "employee"),
  ].filter(Boolean);

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <span className="sidebar__brand-mark">SI</span>
          <span>Smart Inventory</span>
        </div>

        <h1 className="login__title">Sign in</h1>
        <p className="login__subtitle">
          Accounts are created by the shop owner. There is no public sign-up.
        </p>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <form className="login__form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button type="submit" className="btn btn--primary login__submit" disabled={submitting}>
            {submitting ? <Spinner label="Signing in…" /> : "Sign in"}
          </button>
        </form>

        {/*
          Only renders when VITE_DEMO_OWNER is set, so a real deployment never
          shows it. Format per role: "email / password".
        */}
        {demoAccounts.length > 0 && (
          <div className="login__demo">
            <p className="login__demo-title">Try it</p>
            <p className="field-hint">
              Two roles, the same app. The employee cannot see cost prices,
              margins or anyone else&apos;s sales.
            </p>

            <div className="login__demo-buttons">
              {demoAccounts.map((account) => (
                <button
                  key={account.role}
                  type="button"
                  className="btn btn--secondary"
                  disabled={submitting}
                  onClick={() => signInAs(account)}
                >
                  Sign in as {account.role}
                </button>
              ))}
            </div>

            <ul className="login__demo-list">
              {demoAccounts.map((account) => (
                <li key={account.role}>
                  <span className="login__demo-role">{account.role}</span>
                  <code>{account.email}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
