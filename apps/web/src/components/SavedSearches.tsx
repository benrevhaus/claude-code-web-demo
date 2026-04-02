import type { Filters } from "../lib/api";

export type SavedSearch = {
  id: string;
  name: string;
  filters: Filters;
};

type Props = {
  searches: SavedSearch[];
  onLoad: (search: SavedSearch) => void;
  onDelete: (id: string) => void;
};

export function SavedSearches({ searches, onLoad, onDelete }: Props) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Saved Searches</h2>
      </div>
      {searches.length === 0 ? (
        <p className="muted">No saved searches yet.</p>
      ) : (
        <div className="saved-search-list">
          {searches.map((search) => (
            <div key={search.id} className="saved-search-item">
              <button className="linkish" onClick={() => onLoad(search)}>
                {search.name}
              </button>
              <button className="ghost" onClick={() => onDelete(search.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
