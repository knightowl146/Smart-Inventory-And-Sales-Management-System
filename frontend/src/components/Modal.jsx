import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({ title, onClose, children, footer }) => {
  const modalRef = useRef(null);

  /**
   * `onClose` is almost always an inline arrow or a plain function defined in
   * the parent's body, so it is a brand-new value on every render. Depending on
   * it directly would re-run the focus effect after every keystroke in a form
   * field - moving focus back to the first focusable element and making the
   * input impossible to type in. Reading it through a ref lets the effects
   * below mount once while still calling the current handler.
   */
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus management belongs to the modal's lifetime, not to any render.
  useEffect(() => {
    const previouslyFocused = document.activeElement;

    const focusables = modalRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
    (focusables?.[0] || modalRef.current)?.focus();

    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  // Escape to close, Tab to cycle inside the dialog.
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onCloseRef.current?.();
        return;
      }

      if (event.key === "Tab" && modalRef.current) {
        const nodes = modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
        if (nodes.length === 0) return;

        const first = nodes[0];
        const last = nodes[nodes.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="modal-overlay" onMouseDown={() => onCloseRef.current?.()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2>{title}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={() => onCloseRef.current?.()}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
