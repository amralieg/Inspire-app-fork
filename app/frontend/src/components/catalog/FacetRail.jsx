import { useState } from 'react';
import { ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { clearFacet, facetCounts, facetOptions, selectedValues, toggleFacetValue, visibleFacetDefs } from '../../lib/useCaseFacets';

const PREVIEW = 6;
const FIND_AT = 8;
const OPEN_BY_DEFAULT = new Set(['domain', 'priority', 'quality', 'bob', 'genie', 'poc', 'strategy']);

function Facet({ def, options, counts, selected, open, onToggleOpen, onToggleValue, onClear }) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const q = query.trim().toLowerCase();
  const display = (v) => (def.format ? def.format(v) : v);
  const matching = q ? options.filter((v) => v.toLowerCase().includes(q)) : options;
  const shown = showAll || q ? matching : matching.filter((v, i) => i < PREVIEW || selected.includes(v));
  const hidden = matching.length - shown.length;
  const panelId = `facet-${def.key.replace(/[^a-z0-9]+/gi, '-')}`;

  return (
    <div className="border-b border-border last:border-b-0" data-facet={def.key}>
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight size={12} className={`shrink-0 text-text-tertiary transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="truncate text-[11px] font-semibold text-text-primary">{def.label}</span>
          {selected.length > 0 && (
            <span className="shrink-0 rounded-full bg-db-red-50 px-1.5 text-[10px] font-semibold tabular-nums text-db-red-fg">{selected.length}</span>
          )}
        </button>
        {selected.length > 0 && (
          <button type="button" onClick={onClear} className="shrink-0 text-[10px] font-medium text-db-red-fg hover:underline" aria-label={`Clear ${def.label}`}>
            Clear
          </button>
        )}
      </div>
      {open && (
        <div id={panelId} className="px-3 pb-2.5">
          {options.length > FIND_AT && (
            <div className="relative mb-1.5">
              <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Find ${def.label.toLowerCase()}`}
                aria-label={`Find ${def.label}`}
                className="w-full rounded-md border border-border bg-bg py-1 pl-6 pr-2 text-[11px] text-text-primary placeholder:text-text-tertiary focus:border-db-red/30 focus:outline-none"
              />
            </div>
          )}
          <ul className="space-y-px" role="group" aria-label={def.label}>
            {shown.map((value) => {
              const checked = selected.includes(value);
              const count = counts.get(value) || 0;
              const depth = def.depth ? def.depth(value) : 0;
              return (
                <li key={value}>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-bg-subtle ${checked ? 'bg-db-red-50' : ''} ${!checked && count === 0 ? 'opacity-50' : ''}`}
                    style={depth ? { paddingLeft: `${0.375 + depth * 0.75}rem` } : undefined}
                    title={value}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleValue(value)}
                      className="h-3.5 w-3.5 shrink-0 accent-db-red"
                    />
                    <span className={`min-w-0 flex-1 truncate text-[11px] ${checked ? 'font-semibold text-text-primary' : 'text-text-secondary'} ${def.mono ? 'font-mono text-[10px]' : ''}`}>
                      {display(value)}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-text-tertiary">{count}</span>
                  </label>
                </li>
              );
            })}
            {q && matching.length === 0 && <li className="px-1.5 py-1 text-[11px] text-text-tertiary">No match</li>}
          </ul>
          {!q && (hidden > 0 || (showAll && matching.length > PREVIEW)) && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 px-1.5 text-[10px] font-medium text-db-red-fg hover:underline">
              {showAll ? 'Show fewer' : `Show ${hidden} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function FacetRail({ index, rows, state, onChange, className = '' }) {
  const [openMap, setOpenMap] = useState({});
  const defs = visibleFacetDefs(index, state);
  const activeCount = defs.reduce((n, d) => n + selectedValues(state, d.key).length, 0);
  const groups = [];
  for (const def of defs) {
    const group = groups.find((g) => g.name === def.group);
    if (group) group.defs.push(def);
    else groups.push({ name: def.group, defs: [def] });
  }

  return (
    <aside className={`flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm ${className}`} aria-label="Filters">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <SlidersHorizontal size={13} className="text-db-red-fg" />
        <span className="flex-1 text-xs font-bold text-text-primary">Filters</span>
        {activeCount > 0 && (
          <button type="button" onClick={() => onChange({ ...state, sel: {} })} className="text-[10px] font-semibold text-db-red-fg hover:underline">
            Clear all
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {groups.map((group) => (
          <section key={group.name} aria-label={group.name}>
            <h3 className="bg-bg-subtle/60 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-text-tertiary">{group.name}</h3>
            {group.defs.map((def) => {
              const selected = selectedValues(state, def.key);
              const open = openMap[def.key] ?? (OPEN_BY_DEFAULT.has(def.key) || selected.length > 0);
              return (
                <Facet
                  key={def.key}
                  def={def}
                  options={facetOptions(index, state, def.key)}
                  counts={open ? facetCounts(index, rows, state, def.key) : new Map()}
                  selected={selected}
                  open={open}
                  onToggleOpen={() => setOpenMap((m) => ({ ...m, [def.key]: !open }))}
                  onToggleValue={(value) => onChange(toggleFacetValue(state, def.key, value))}
                  onClear={() => onChange(clearFacet(state, def.key))}
                />
              );
            })}
          </section>
        ))}
        {groups.length === 0 && <p className="px-3 py-4 text-[11px] text-text-tertiary">Nothing to filter on yet.</p>}
      </div>
    </aside>
  );
}
