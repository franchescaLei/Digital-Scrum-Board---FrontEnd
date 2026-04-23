import { useState, useCallback, useEffect, useRef } from 'react';
import '../../styles/pagination.css';

export interface PaginationProps {
    currentPage: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    pageSizeOptions?: number[];
    className?: string;
    showInfo?: boolean;
    showPageSize?: boolean;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function generatePageNumbers(current: number, total: number, maxVisible = 7): (number | '...')[] {
    const pages: (number | '...')[] = [];

    if (total <= maxVisible) {
        for (let i = 1; i <= total; i++) {
            pages.push(i);
        }
        return pages;
    }

    const half = Math.floor(maxVisible / 2);

    if (current <= half) {
        for (let i = 1; i <= maxVisible - 1; i++) {
            pages.push(i);
        }
        pages.push('...');
        pages.push(total);
    } else if (current >= total - half + 1) {
        pages.push(1);
        pages.push('...');
        for (let i = total - maxVisible + 2; i <= total; i++) {
            pages.push(i);
        }
    } else {
        pages.push(1);
        pages.push('...');
        const start = current - Math.floor((maxVisible - 4) / 2);
        const end = current + Math.floor((maxVisible - 4) / 2);
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        pages.push('...');
        pages.push(total);
    }

    return pages;
}

export function Pagination({
    currentPage,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    className,
    showInfo = true,
    showPageSize = true,
}: PaginationProps) {
    const [goToPage, setGoToPage] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    const handleGoToPage = useCallback(() => {
        const page = parseInt(goToPage, 10);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
            onPageChange(page);
            setGoToPage('');
        }
    }, [goToPage, totalPages, onPageChange]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleGoToPage();
            } else if (e.key === 'Escape') {
                setGoToPage('');
                inputRef.current?.blur();
            }
        },
        [handleGoToPage]
    );

    const handlePageSizeChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            const newPageSize = parseInt(e.target.value, 10);
            if (!isNaN(newPageSize) && newPageSize > 0) {
                onPageSizeChange(newPageSize);
                onPageChange(1);
            }
        },
        [onPageSizeChange, onPageChange]
    );

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            onPageChange(totalPages);
        }
    }, [pageSize, totalPages, currentPage, onPageChange]);

    if (total === 0) {
        return null;
    }

    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, total);

    return (
        <div className={`pagination-root ${className || ''}`}>
            {showInfo ? (
                <div className="pagination-info">
                    <span className="pagination-range">
                        Showing {startItem}–{endItem} of {total}
                    </span>
                </div>
            ) : (
                <div className="pagination-info pagination-info--hidden" aria-hidden="true" />
            )}

            <div className="pagination-center">
                <nav className="pagination-nav" role="navigation" aria-label="Pagination">
                    <button
                        type="button"
                        className="pagination-btn pagination-btn--nav"
                        disabled={currentPage <= 1}
                        onClick={() => onPageChange(currentPage - 1)}
                        aria-label="Previous page"
                    >
                        ‹
                    </button>

                    {pageNumbers.map((page, idx) =>
                        page === '...' ? (
                            <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                                …
                            </span>
                        ) : (
                            <button
                                key={page}
                                type="button"
                                className={`pagination-btn pagination-btn--page${
                                    page === currentPage ? ' pagination-btn--active' : ''
                                }`}
                                onClick={() => onPageChange(page)}
                                aria-label={`Page ${page}`}
                                aria-current={page === currentPage ? 'page' : undefined}
                            >
                                {page}
                            </button>
                        )
                    )}

                    <button
                        type="button"
                        className="pagination-btn pagination-btn--nav"
                        disabled={currentPage >= totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                        aria-label="Next page"
                    >
                        ›
                    </button>
                </nav>
            </div>

            <div className="pagination-right">
                {showPageSize && (
                    <div className="pagination-page-size">
                        <label htmlFor="pagination-page-size" className="pagination-page-size-label">
                            Rows:
                        </label>
                        <select
                            id="pagination-page-size"
                            className="pagination-select"
                            value={pageSize}
                            onChange={handlePageSizeChange}
                        >
                            {pageSizeOptions.map((size) => (
                                <option key={size} value={size}>
                                    {size}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="pagination-go-to">
                    <label htmlFor="pagination-go-to" className="pagination-go-to-label">
                        Go to page:
                    </label>
                    <input
                        ref={inputRef}
                        id="pagination-go-to"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="pagination-input"
                        value={goToPage}
                        onChange={(e) => setGoToPage(e.target.value.replace(/[^0-9]/g, ''))}
                        onKeyDown={handleKeyDown}
                        onBlur={handleGoToPage}
                        placeholder="#"
                        aria-label="Go to page number"
                    />
                </div>
            </div>
        </div>
    );
}
