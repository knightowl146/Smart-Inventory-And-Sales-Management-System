const Button = ({ variant = "primary", type = "button", disabled, onClick, children }) => {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`btn btn--${variant}`}>
      {children}
    </button>
  );
};

export default Button;