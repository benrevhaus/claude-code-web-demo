import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SavedSearches({ searches, onLoad, onDelete }) {
    return (_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-heading", children: _jsx("h2", { children: "Saved Searches" }) }), searches.length === 0 ? (_jsx("p", { className: "muted", children: "No saved searches yet." })) : (_jsx("div", { className: "saved-search-list", children: searches.map((search) => (_jsxs("div", { className: "saved-search-item", children: [_jsx("button", { className: "linkish", onClick: () => onLoad(search), children: search.name }), _jsx("button", { className: "ghost", onClick: () => onDelete(search.id), children: "Delete" })] }, search.id))) }))] }));
}
