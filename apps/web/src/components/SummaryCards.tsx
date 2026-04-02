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
    status: string;
    started_at: string;
    finished_at: string | null;
    pages_rows: number;
    events_rows: number;
  } | null;
};

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
        <strong>{latestSync?.status ?? "none"}</strong>
        <small>
          {latestSync
            ? `${latestSync.pages_rows} page rows, ${latestSync.events_rows} event rows`
            : "Run a backfill to populate data"}
        </small>
      </article>
    </section>
  );
}
