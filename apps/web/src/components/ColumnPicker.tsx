type Props = {
  title: string;
  columns: { key: string; label: string }[];
  visibleKeys: string[];
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
};

export function ColumnPicker({ title, columns, visibleKeys, onToggle, onSelectAll, onDeselectAll }: Props) {
  return (
    <section className="panel compact-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <div className="actions-inline">
          <button className="ghost small" onClick={onSelectAll}>
            Select all
          </button>
          <button className="ghost small" onClick={onDeselectAll}>
            Deselect all
          </button>
        </div>
      </div>
      <div className="toggle-grid">
        {columns.map((column) => (
          <label key={column.key} className="toggle-chip">
            <input
              type="checkbox"
              checked={visibleKeys.includes(column.key)}
              onChange={() => onToggle(column.key)}
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
