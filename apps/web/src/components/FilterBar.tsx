import type { Filters } from "../lib/api";

type FilterOptions = {
  pagePaths: string[];
  eventNames: string[];
  deviceCategories: string[];
  sourceMediums: string[];
  eventClasses?: string[];
};

type Props = {
  filters: Filters;
  options: FilterOptions;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
  onSaveSearch: () => void;
  onQuickRange: (days: number) => void;
};

export function FilterBar({ filters, options, onChange, onReset, onSaveSearch, onQuickRange }: Props) {
  const selectedEventNames = filters.eventNames ?? [];

  function toggleEventName(eventName: string) {
    const nextEventNames = selectedEventNames.includes(eventName)
      ? selectedEventNames.filter((value) => value !== eventName)
      : [...selectedEventNames, eventName];
    onChange({ eventNames: nextEventNames });
  }

  return (
    <section className="panel filters-panel">
      <div className="panel-heading">
        <h2>Filters</h2>
        <div className="actions-inline">
          <button onClick={onSaveSearch}>Save Search</button>
          <button className="ghost" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>
      <div className="quick-range-row">
        <span className="muted">Range</span>
        <button className="ghost small" onClick={() => onQuickRange(7)}>
          7d
        </button>
        <button className="ghost small" onClick={() => onQuickRange(30)}>
          30d
        </button>
        <button className="ghost small" onClick={() => onQuickRange(90)}>
          90d
        </button>
      </div>
      <div className="filters-grid">
        <label>
          Start
          <input type="date" value={filters.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
        </label>
        <label>
          End
          <input type="date" value={filters.endDate} onChange={(e) => onChange({ endDate: e.target.value })} />
        </label>
        <label>
          Search
          <input
            type="text"
            placeholder="Page or event"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
          />
        </label>
        <label>
          Page
          <select value={filters.pagePath} onChange={(e) => onChange({ pagePath: e.target.value })}>
            <option value="">All pages</option>
            {options.pagePaths.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {(options.eventClasses ?? []).length > 1 ? (
          <label>
            Event Class
            <select value={filters.eventClass ?? "valid_event"} onChange={(e) => onChange({ eventClass: e.target.value })}>
              {(options.eventClasses ?? ["valid_event"]).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Device
          <select value={filters.deviceCategory} onChange={(e) => onChange({ deviceCategory: e.target.value })}>
            <option value="">All devices</option>
            {options.deviceCategories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source / Medium
          <select value={filters.sourceMedium} onChange={(e) => onChange({ sourceMedium: e.target.value })}>
            <option value="">All sources</option>
            {options.sourceMediums.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Conversions
          <select value={filters.conversionOnly ?? ""} onChange={(e) => onChange({ conversionOnly: e.target.value })}>
            <option value="">All events</option>
            <option value="true">Conversions only</option>
          </select>
        </label>
        <label>
          Group By
          <select value={filters.groupBy ?? "detail"} onChange={(e) => onChange({ groupBy: e.target.value })}>
            <option value="detail">Detail</option>
            <option value="page">Page total</option>
            <option value="device">Device total</option>
            <option value="source_medium">Source / medium total</option>
            <option value="event">Event total</option>
          </select>
        </label>
      </div>
      <div className="event-checkboxes">
        <div className="event-checkboxes__header">
          <span>Top Events</span>
          <div className="actions-inline">
            <button className="ghost small" onClick={() => onChange({ eventNames: options.eventNames })}>
              Select all
            </button>
            <button className="ghost small" onClick={() => onChange({ eventNames: [] })}>
              Deselect all
            </button>
          </div>
        </div>
        <div className="event-checkboxes__grid">
          {options.eventNames.map((value) => (
            <label key={value} className="checkbox-pill">
              <input
                type="checkbox"
                checked={selectedEventNames.includes(value)}
                onChange={() => toggleEventName(value)}
              />
              <span>{value}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
