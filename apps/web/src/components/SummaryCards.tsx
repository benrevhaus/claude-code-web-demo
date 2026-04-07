type Props = {
  summary: {
    views: number;
    sessions: number;
    totalUsers: number;
    pageCount: number;
    eventCount: number;
    distinctEvents: number;
  } | null;
  latestSync: {
    sync_type: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    days_back: number;
    pages_rows: number;
    events_rows: number;
    pages_new: number;
    pages_changed: number;
    events_new: number;
    events_changed: number;
  } | null;
};

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SummaryCards({ summary, latestSync }: Props) {
  const cards = summary
    ? [
        ["Views", summary.views],
        ["Sessions", summary.sessions],
        ["Users", summary.totalUsers],
        ["Pages", summary.pageCount],
        ["Events", summary.eventCount],
        ["Distinct Events", summary.distinctEvents],
      ]
    : [];

  return (
    <section className="summary-grid">
      {cards.map(([label, value]) => (
        <article key={label} className="summary-card">
          <span>{label}</span>
          <strong>{Number(value).toLocaleString()}</strong>
        </article>
      ))}
      <article className="summary-card sync-card">
        <span>Latest Sync</span>
        {latestSync ? (
          <>
            <strong>{formatTimestamp(latestSync.finished_at ?? latestSync.started_at)}</strong>
            <small>
              {latestSync.events_new != null ? (
                <>
                  {latestSync.events_new.toLocaleString()} new, {latestSync.events_changed.toLocaleString()} changed
                  {" — "}
                  {(latestSync.events_rows - latestSync.events_new - latestSync.events_changed).toLocaleString()} unchanged
                </>
              ) : (
                <>{latestSync.events_rows.toLocaleString()} events synced</>
              )}
            </small>
            <small className="muted">
              {latestSync.sync_type === "incremental_sync" ? "incremental" : "full backfill"}
              {` — last ${latestSync.days_back} days of GA4 data`}
            </small>
          </>
        ) : (
          <>
            <strong>none</strong>
            <small>Run a backfill to populate data</small>
          </>
        )}
      </article>
    </section>
  );
}
