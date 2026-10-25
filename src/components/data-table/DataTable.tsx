'use client';

import { useMemo, useState } from 'react';
import {
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Check,
  CheckCircle2,
  Search as SearchIcon,
  Filter as FilterIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface Column<TData> {
  key: string;
  header: string;
  cell?: (row: TData) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<TData> {
  columns: Column<TData>[];
  data: TData[];
  enableBulkActions?: boolean;
  pageSize?: number;
  className?: string;
  onBulkAction?: (action: string, ids: (string | number)[]) => void;
  getRowId?: (row: TData) => string | number;
  emptyState?: React.ReactNode;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
  rowKey?: keyof TData;
}

export function DataTable<TData>({
  columns,
  data,
  enableBulkActions = false,
  pageSize = 10,
  className,
  onBulkAction,
  getRowId,
  emptyState,
  toolbarLeft,
  toolbarRight,
  rowKey = 'id' as keyof TData,
}: DataTableProps<TData>) {
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [globalFilter, setGlobalFilter] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredData = useMemo(() => {
    const q = globalFilter.toLowerCase();
    return data.filter((row) => {
      if (!q) return true;
      return columns.some((col) => {
        const val = (row as any)[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      });
    });
  }, [data, globalFilter, columns]);

  const sortedData = useMemo(() => {
    if (!sortField) return filteredData;
    return [...filteredData].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = pageIndex * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pageIndex, pageSize]);

  const isSelected = (id: string | number) => selectedIds.has(id);
  const toggleSelect = (id: string | number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const allIds = paginatedData.map((r) => (getRowId ? getRowId(r) : (r as any)[rowKey]));
    if (selectedIds.size === paginatedData.length && paginatedData.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const handleBulkAction = (action: string) => {
    onBulkAction?.(action, Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const headerClass = (col: Column<TData>) =>
    'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted/50' +
    (col.sortable ? ' cursor-pointer select-none' : '') +
    (col.className ? ' ' + col.className : '');

  const cellClass = (col: Column<TData>) =>
    'px-4 py-3 text-sm' + (col.className ? ' ' + col.className : '');

  return (
    <Card className={className}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {toolbarLeft}
          <div className="relative w-64">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toolbarRight}
          <Button variant="outline" size="icon" aria-label="Filters">
            <FilterIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="More options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              {enableBulkActions && (
                <th className="w-[40px]">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center justify-center h-10 w-full"
                  >
                    {selectedIds.size === paginatedData.length && paginatedData.length > 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-success fill-success" />
                    ) : (
                      <Check className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={headerClass(col)}
                  onClick={
                    col.sortable
                      ? () => {
                          if (sortField === col.key) {
                            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortField(col.key);
                            setSortDir('asc');
                          }
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                </th>
              ))}
              {enableBulkActions && <th className="w-[40px]" />}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (enableBulkActions ? 2 : 0)}
                  className="h-32 text-center"
                >
                  {emptyState || (
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <p className="text-sm">No matching records found.</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => {
                const id = getRowId ? getRowId(row) : (row as any)[rowKey];
                return (
                  <tr
                    key={id}
                    className={`border-b border-border/50 hover:bg-accent/50 transition-colors ${
                      selectedIds.has(id) ? 'bg-accent/10' : ''
                    }`}
                  >
                    {enableBulkActions && (
                      <td className="w-[40px]">
                        <button
                          onClick={() => toggleSelect(id)}
                          className="flex items-center justify-center h-full w-full"
                        >
                          {isSelected(id) ? (
                            <CheckCircle2 className="h-4 w-4 text-success fill-success" />
                          ) : (
                            <Check className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className={cellClass(col)}>
                        {col.cell ? col.cell(row) : (row as any)[col.key]}
                      </td>
                    ))}
                    {enableBulkActions && (
                      <td className="w-[40px] text-right" />
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </CardContent>
      {pageCount > 1 && (
        <div className="border-t border-border flex items-center justify-between px-4 py-3 bg-muted/50 rounded-b-xl">
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-medium">{pageIndex * pageSize + 1}</span> to{' '}
            <span className="font-medium">
              {Math.min((pageIndex + 1) * pageSize, sortedData.length)}
            </span>{' '} of <span className="font-medium">{sortedData.length}</span> results
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((p) => Math.max(p - 1, 0))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pageIndex === pageCount - 1}
              onClick={() => setPageIndex((p) => Math.min(p + 1, pageCount - 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {enableBulkActions && selectedIds.size > 0 && (
        <div className="border-t border-border bg-muted p-3 flex items-center justify-between rounded-b-xl">
          <span className="text-xs font-medium text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('resolve')}>
              Resolve selected
            </Button>
            <Button variant="destructive" size="sm" onClick={() => handleBulkAction('delete')}>
              Delete selected
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
