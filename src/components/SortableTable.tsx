import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

type Dir = 'asc' | 'desc';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  /** Returns the cell content. */
  render: (row: T) => ReactNode;
  /** Returns a comparable value (number or string) for sorting. */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T, idx: number) => string | number;
  initialSort?: { key: string; dir: Dir };
  emptyMessage?: ReactNode;
  rowClassName?: (row: T) => string;
  /**
   * If set, pagination is enabled. The supplied number is the default page
   * size; the user can switch between sizes from the pager dropdown.
   */
  pageSize?: number;
  /** Page-size options shown in the dropdown. Defaults to [10, 25, 50, 100]. */
  pageSizeOptions?: number[];
}

/**
 * Lightweight sortable HTML table. Click a header to sort; click again to
 * toggle direction; a third click clears the sort and falls back to insertion
 * order. Optional pagination via `pageSize`.
 */
export function SortableTable<T>({
  data,
  columns,
  rowKey,
  initialSort,
  emptyMessage,
  rowClassName,
  pageSize: initialPageSize,
  pageSizeOptions = [10, 25, 50, 100],
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(initialSort ?? null);
  const [pageSize, setPageSize] = useState<number>(initialPageSize ?? 0);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data, sort, columns]);

  const paginated = pageSize > 0;
  const total = sorted.length;
  const pageCount = paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  // Reset page if data shrinks below the current offset (e.g. after sort change).
  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [page, pageCount]);
  // Reset to first page on sort change so the user always sees the new top.
  useEffect(() => { setPage(0); }, [sort]);

  const visible = paginated ? sorted.slice(page * pageSize, page * pageSize + pageSize) : sorted;

  const onHeaderClick = (key: string) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'desc' };
      if (s.dir === 'desc') return { key, dir: 'asc' };
      return null;
    });
  };

  if (data.length === 0) {
    return <div className="text-center py-12 text-sm opacity-50">{emptyMessage ?? 'No data.'}</div>;
  }

  const fromRow = paginated ? page * pageSize + 1 : 1;
  const toRow = paginated ? Math.min(total, page * pageSize + pageSize) : total;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#141414]">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !c.sortable ? null : active ? (sort?.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                return (
                  <th
                    key={c.key}
                    className={`col-header py-2 px-2 whitespace-nowrap text-${c.align ?? 'left'} ${c.sortable ? 'cursor-pointer select-none hover:bg-[#141414]/5' : ''} ${c.className ?? ''}`}
                    onClick={c.sortable ? () => onHeaderClick(c.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {Icon && <Icon size={11} className={active ? 'opacity-100' : 'opacity-30'} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={rowKey(row, page * pageSize + i)} className={`border-b border-[#141414]/5 hover:bg-[#141414]/5 ${rowClassName ? rowClassName(row) : ''}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`py-3 px-2 text-${c.align ?? 'left'} ${c.className ?? ''}`}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginated && total > pageSizeOptions[0] && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#141414]/70">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="border border-[#141414]/20 bg-white rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-indigo-500"
            >
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="opacity-60">
              {fromRow.toLocaleString()}–{toRow.toLocaleString()} of {total.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <PagerBtn disabled={page === 0} onClick={() => setPage(0)} title="First page"><ChevronsLeft size={13} /></PagerBtn>
            <PagerBtn disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} title="Previous page"><ChevronLeft size={13} /></PagerBtn>
            <span className="font-mono px-2">
              <span className="font-bold">{page + 1}</span><span className="opacity-50"> / {pageCount}</span>
            </span>
            <PagerBtn disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} title="Next page"><ChevronRight size={13} /></PagerBtn>
            <PagerBtn disabled={page >= pageCount - 1} onClick={() => setPage(pageCount - 1)} title="Last page"><ChevronsRight size={13} /></PagerBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function PagerBtn({ children, disabled, onClick, title }: { children: ReactNode; disabled?: boolean; onClick?: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center justify-center w-7 h-7 border border-[#141414]/15 bg-white rounded hover:bg-[#141414]/5 disabled:opacity-30 disabled:cursor-not-allowed transition"
    >
      {children}
    </button>
  );
}
