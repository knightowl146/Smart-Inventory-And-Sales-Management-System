import Modal from "./Modal";
import Button from "./Button";

const ConfirmDialog = ({ title, message, confirmLabel = "Confirm", onConfirm, onCancel, busy }) => {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
};

export default ConfirmDialog;