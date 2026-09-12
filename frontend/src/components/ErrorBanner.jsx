import Button from "./Button";

const ErrorBanner = ({ message, onRetry }) => {
  return (
    <div className="error-banner" role="alert">
      <p>{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
};

export default ErrorBanner;