'use client';

import { ArrowDown, ArrowUp, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  sortValue?: (row: T) => string | number | Date | null | undefined;
}

type SortState = {
  key: string;
  direction: 'asc' | 'desc';
};

const SORT_KEY_CANDIDATES = ['createdAt', 'date', 'chequeDate', 'updatedAt', 'id'] as const;

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | unknown;
  loading?: boolean;
  emptyMessage?: string;
  keyField?: keyof T;
  searchPlaceholder?: string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  defaultSortKey?: string;
  defaultSortDirection?: 'asc' | 'desc';
  hideSearch?: boolean;
}

function collectSearchableText(value: unknown, seen = new WeakSet<object>()): string {
  if (value == null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value ?? '');
  }
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => collectSearchableText(item, seen)).join(' ');
  if (typeof value === 'object') {
    if (seen.has(value)) return '';
    seen.add(value);
    return Object.values(value as Record<string, unknown>).map((item) => collectSearchableText(item, seen)).join(' ');
  }
  return '';
}

function normalizeSortValue(value: string | number | Date | null | undefined): string | number {
  if (value == null) return '';
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return String(value).toLowerCase();
}

function inferDefaultSortKey(rows: unknown[]) {
  const sample = rows.find((row) => row && typeof row === 'object') as Record<string, unknown> | undefined;
  if (!sample) return '';
  for (const key of SORT_KEY_CANDIDATES) {
    if (key in sample) return key;
  }
  return '';
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'base' });
}

function getSortValue<T>(row: T, key: string, column?: Column<T>) {
  if (column?.sortValue) return column.sortValue(row);
  return (row as Record<string, unknown>)[key] as string | number | Date | null | undefined;
}

export default function DataTable<T>({
  columns,
  data,
  loading,
  emptyMessage = 'No records found',
  keyField,
  searchPlaceholder = 'Search records...',
  pageSizeOptions = [10, 25, 50],
  defaultPageSize = 10,
  defaultSortKey,
  defaultSortDirection = 'desc',
  hideSearch = false,
}: DataTableProps<T>) {
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const inferredSortKey = useMemo(() => inferDefaultSortKey(rows), [rows]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sortState, setSortState] = useState<SortState>(() => ({
    key: defaultSortKey ?? inferredSortKey,
    direction: defaultSortKey || inferredSortKey ? defaultSortDirection : 'asc',
  }));

  const sortKey = sortState.key;
  const sortDirection = sortState.direction;

  useEffect(() => {
    if (defaultSortKey || sortState.key || !inferredSortKey) return;
    setSortState({ key: inferredSortKey, direction: 'desc' });
  }, [defaultSortKey, inferredSortKey, sortState.key]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => collectSearchableText(row).toLowerCase().includes(normalized));
  }, [query, rows]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const column = columns.find((item) => item.key === sortKey);
    const direction = sortDirection === 'asc' ? 1 : -1;
    const fallbackKeys = SORT_KEY_CANDIDATES.filter((candidate) => candidate !== sortKey);
    
    return [...filteredRows].sort((a, b) => {
      const left = normalizeSortValue(getSortValue(a, sortKey, column));
      const right = normalizeSortValue(getSortValue(b, sortKey, column));
      let result = compareSortValues(left, right);

      if (result === 0) {
        for (const fallbackKey of fallbackKeys) {
          const fallbackColumn = columns.find((item) => item.key === fallbackKey);
          const fallbackLeft = normalizeSortValue(getSortValue(a, fallbackKey, fallbackColumn));
          const fallbackRight = normalizeSortValue(getSortValue(b, fallbackKey, fallbackColumn));
          result = compareSortValues(fallbackLeft, fallbackRight);
          if (result !== 0) break;
        }
      }
      return result * direction;
    });
  }, [columns, filteredRows, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visibleRows = sortedRows.slice(start, start + pageSize);
  const showingStart = sortedRows.length === 0 ? 0 : start + 1;
  const showingEnd = sortedRows.length === 0 ? 0 : Math.min(start + pageSize, sortedRows.length);

  const toggleSort = (key: string) => {
    setPage(1);
    setSortState((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      {!hideSearch && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
          <div className="relative w-full sm:max-w-md group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
              className="field-control pl-10"
            />
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="surface-card animate-fade-in overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="border-b" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}>
              <tr>
                {columns.map((c) => {
                  const canSort = c.sortable !== false && c.label.trim().length > 0;
                  const isSorted = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      className="px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-slate-500"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className={`group w-full flex items-center hover:text-slate-900 transition-colors ${
                            c.align === 'center' ? 'justify-center' : c.align === 'right' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {/* Left spacer for centering balance */}
                          {c.align === 'center' && (
                            <span className="flex flex-col invisible mr-2">
                              <ArrowUp size={10} />
                              <ArrowDown size={10} />
                            </span>
                          )}
                          
                          {/* Right icons for left alignment */}
                          {c.align === 'right' && (
                            <span className={`flex flex-col mr-2 transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}>
                              <ArrowUp size={10} className={isSorted && sortDirection === 'asc' ? 'text-emerald-600' : 'text-slate-300'} />
                              <ArrowDown size={10} className={isSorted && sortDirection === 'desc' ? 'text-emerald-600' : 'text-slate-300'} />
                            </span>
                          )}

                          <span>{c.label}</span>

                          {/* Right icons for left/center alignment */}
                          {(c.align === 'left' || c.align === 'center' || !c.align) && (
                            <span className={`flex flex-col ml-2 transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}>
                              <ArrowUp size={10} className={isSorted && sortDirection === 'asc' ? 'text-emerald-600' : 'text-slate-300'} />
                              <ArrowDown size={10} className={isSorted && sortDirection === 'desc' ? 'text-emerald-600' : 'text-slate-300'} />
                            </span>
                          )}
                        </button>
                      ) : (
                        <div className={`${
                          c.align === 'center' ? 'text-center' : c.align === 'right' ? 'text-right' : 'text-left'
                        }`}>
                          {c.label}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-4">
                        <div className="skeleton h-4 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-300">
                        <Search size={24} />
                      </div>
                      <p className="text-sm font-medium text-slate-500">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, i) => (
                  <tr 
                    key={keyField ? String(row[keyField]) : `${safePage}-${i}`}
                    className="group transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20"
                  >
                    {columns.map((c) => (
                      <td 
                        key={c.key} 
                        className={`px-4 py-3.5 text-sm ${
                          c.align === 'center' ? 'text-center' : c.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        {!loading && filteredRows.length > 0 && (
          <div className="no-print flex flex-col items-center justify-between gap-4 border-t px-4 py-4 sm:flex-row" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}>
            <div className="text-xs font-medium text-slate-500 order-2 sm:order-1">
              Showing <span className="text-slate-900 font-bold">{showingStart}</span> to <span className="text-slate-900 font-bold">{showingEnd}</span> of <span className="text-slate-900 font-bold">{filteredRows.length}</span> records
            </div>
            
            <div className="flex items-center gap-6 order-1 sm:order-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="bg-white border border-slate-200 rounded-lg text-xs font-bold px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {pageSizeOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all shadow-sm"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="text-xs font-bold text-slate-700 min-w-[60px] text-center">
                  {safePage} <span className="text-slate-400 font-medium mx-1">of</span> {pageCount}
                </div>
                <button
                  onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                  disabled={safePage >= pageCount}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all shadow-sm"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
