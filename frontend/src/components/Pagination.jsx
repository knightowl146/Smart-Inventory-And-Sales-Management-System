import Button from "./Button";

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <div className="pagination">
      <Button variant="secondary" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>Previous</Button>
      <span className="pagination__status">Page {currentPage} of {totalPages}</span>
      <Button variant="secondary" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Next</Button>
    </div>
  );
};

export default Pagination;