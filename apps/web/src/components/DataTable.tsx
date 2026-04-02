type Column<T> = {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDirection: "asc" | "desc";
  onSort: (sortBy: string) => void;
  onPageChange: (page: number) => void;
  loading?: boolean;
  emptyMessage?: string;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  total,
  page,
  pageSize,
  sortBy,
  sortDirection,
  onSort,
  onPageChange,
  loading = false,
  emptyMessage = "No rows match the current filters.",
}: Props<T>) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasVisibleColumns = columns.length > 0;

  return (
    <section className="panel">
      <div className="table-wrap">
        {hasVisibleColumns ? (
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={String(column.key)}>
                    {column.sortable ? (
                      <button className="sort-button" onClick={() => onSort(String(column.key))}>
                        {column.label}
                        {sortBy === column.key ? ` ${sortDirection === "asc" ? "↑" : "↓"}` : ""}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="table-status">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="table-status">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={String(column.key)}>{column.render ? column.render(row) : String(row[column.key] ?? "")}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <div className="table-status">No visible columns selected.</div>
        )}
      </div>
      <div className="table-footer">
        <span>
          Page {page} of {pageCount} • {total.toLocaleString()} rows
        </span>
        <div className="actions-inline">
          <button className="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Prev
          </button>
          <button className="ghost" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
