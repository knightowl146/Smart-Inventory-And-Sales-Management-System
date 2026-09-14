import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext";
import Spinner from "../components/Spinner";

const Login = () => {
  const { signIn, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") {
    return <Navigate to={location.state?.from || "/"} replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signIn(email, password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      // The API deliberately returns the same message for an unknown account
      // and a wrong password, so there is nothing to refine here.
      setError(err.message || "Could not sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

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
            {submitting ? <Spinner /> : "Sign in"}
          </button>
        </form>

        {/*
          Demo credentials for the deployed portfolio build. Set
          VITE_DEMO_OWNER / VITE_DEMO_EMPLOYEE in the Vercel project to show
          them; leave unset and this block never renders, so a real deployment
          is unaffected.
        */}
        {import.meta.env.VITE_DEMO_OWNER && (
          <div className="login__demo">
            <p className="login__demo-title">Demo accounts</p>
            <p>
              <strong>Owner</strong> <code>{import.meta.env.VITE_DEMO_OWNER}</code>
            </p>
            <p>
              <strong>Employee</strong> <code>{import.meta.env.VITE_DEMO_EMPLOYEE}</code>
            </p>
            <p className="field-hint">
              Sign in as both to see how the permissions differ.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
