import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { Filter, Heart, LayoutList, Search, Sparkles, Star, Table2, X } from 'lucide-react';
import FacetRail from './FacetRail';
import UseCaseGrid from './UseCaseGrid';
import ColumnChooser from './ColumnChooser';
import SavedViews from './SavedViews';
import UseCaseDrawer from '../UseCaseDrawer';
import ImplementStatusBadge from '../ImplementStatusBadge';
import { PRIORITY_ORDER, priorityPillClass } from '../../lib/useCaseFields';
import { STRATEGY_NOT_ALIGNED } from '../../lib/v130UseCase';
import {
  GENIE_LABELS,
  activeFilters,
  builtInViews,
  catalogFacetDefs,
  emptyFacetState,
  extraJsonFacets,
  facetIndex,
  filterRows,
  loadSavedViews,
  removeSavedView,
  sameFacetState,
  storeSavedView,
  toggleFacetValue,
} from '../../lib/useCaseFacets';

const DEFAULT_COLUMN_VISIBILITY = Object.freeze({
  subdomain: false,
  type: false,
  priority: false,
  value: false,
  feasibility: false,
  beneficiary: false,
  sponsor: false,
  strategy: false,
  feedback: false,
});

const text = (v) => (v ? v : undefined);
const tierRank = (label) => {
  const i = PRIORITY_ORDER.indexOf(String(label || '').trim());
  return i < 0 ? undefined : i;
};
const dash = <span className="text-text-tertiary">—</span>;
const plain = (v, mono = false) => (v ? <span className={`block truncate ${mono ? 'font-mono text-[11px]' : ''}`} title={String(v)}>{v}</span> : dash);
const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? <span className="tabular-nums">{v.toFixed(1)}</span> : dash);

function textColumn(id, header, get, extra = {}) {
  return { id, header, accessorFn: (r) => text(get(r)), sortUndefined: 'last', sortDescFirst: false, cell: (c) => plain(c.getValue()), ...extra };
}

function catalogColumns({ maxInspire = 0, onToggleFavorite } = {}) {
  return [
    {
      id: 'favorite',
      header: () => <span className="sr-only">Favorite</span>,
      enableSorting: false,
      enableHiding: false,
      size: 36, meta: { label: 'Favorite' },
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(row.original); }}
          aria-pressed={row.original.favorite}
          aria-label={row.original.favorite ? `Remove ${row.original.title} from favorites` : `Add ${row.original.title} to favorites`}
          className={`rounded p-0.5 ${row.original.favorite ? 'text-db-red-fg' : 'text-text-disabled hover:text-db-red-fg'}`}
        >
          <Heart size={13} className={row.original.favorite ? 'fill-current' : ''} />
        </button>
      ),
    },
    textColumn('id', 'ID', (r) => r.id, { size: 88, meta: { label: 'ID' }, cell: (c) => plain(c.getValue(), true) }),
    {
      id: 'title',
      header: 'Use case',
      accessorFn: (r) => r.title,
      sortDescFirst: false,
      enableHiding: false,
      size: 240,
      meta: { label: 'Use case', grow: true },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {r.bob && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-warning/35 bg-warning-bg px-1 text-[9px] font-bold text-warning-fg" title={`Best of best${r.bob.rank ? ` #${r.bob.rank}` : ''}`}>
                <Star size={9} className="fill-current" />{r.bob.rank ? `#${r.bob.rank}` : ''}
              </span>
            )}
            <span className="min-w-0 truncate font-semibold text-text-primary" title={r.title}>{r.title}</span>
            {r.genie === GENIE_LABELS.shipped && (
              <Sparkles size={11} className="shrink-0 text-db-red-fg" aria-label="Has Genie code" />
            )}
          </div>
        );
      },
    },
    textColumn('domain', 'Domain', (r) => r.domain, { size: 120, meta: { label: 'Domain' } }),
    textColumn('subdomain', 'Subdomain', (r) => r.subdomain, { size: 160, meta: { label: 'Subdomain' } }),
    textColumn('technique', 'Technique', (r) => r.technique, { size: 136, meta: { label: 'Technique' } }),
    textColumn('type', 'Type', (r) => r.type, { size: 112, meta: { label: 'Type' } }),
    {
      id: 'quality',
      header: 'Quality',
      accessorFn: (r) => tierRank(r.quality),
      sortUndefined: 'last',
      sortDescFirst: false,
      size: 96, meta: { label: 'Quality' },
      cell: ({ row }) => (row.original.quality
        ? <span className={`inline-block rounded-full border px-1.5 py-px text-[10px] font-semibold ${priorityPillClass(row.original.quality)}`}>{row.original.quality}</span>
        : dash),
    },
    {
      id: 'priority',
      header: 'Priority',
      accessorFn: (r) => tierRank(r.priority),
      sortUndefined: 'last',
      sortDescFirst: false,
      size: 112, meta: { label: 'Priority' },
      cell: ({ row }) => (row.original.priority
        ? <span className={`inline-block rounded-full border px-1.5 py-px text-[10px] font-semibold ${priorityPillClass(row.original.priority)}`}>{row.original.priority}</span>
        : dash),
    },
    {
      id: 'inspire',
      header: 'Inspire',
      accessorFn: (r) => (typeof r.inspire === 'number' && Number.isFinite(r.inspire) ? r.inspire : undefined),
      sortUndefined: 'last',
      sortDescFirst: true,
      size: 104, meta: { label: 'Inspire score' },
      cell: ({ row }) => {
        const v = row.original.inspire;
        if (!(typeof v === 'number' && Number.isFinite(v))) return dash;
        const pct = maxInspire > 0 ? Math.max(4, Math.min(100, (v / maxInspire) * 100)) : 0;
        return (
          <div className="flex items-center gap-2" title={`Inspire score ${v.toFixed(2)}`}>
            <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-text-primary">{v.toFixed(1)}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
              <span className="block h-full rounded-full bg-db-red" style={{ width: `${pct}%` }} />
            </span>
          </div>
        );
      },
    },
    {
      id: 'value',
      header: 'Value',
      accessorFn: (r) => r.value ?? undefined,
      sortUndefined: 'last',
      sortDescFirst: true,
      size: 80, meta: { label: 'Value score' },
      cell: (c) => number(c.getValue()),
    },
    {
      id: 'feasibility',
      header: 'Feasibility',
      accessorFn: (r) => r.feasibility ?? undefined,
      sortUndefined: 'last',
      sortDescFirst: true,
      size: 96, meta: { label: 'Feasibility score' },
      cell: (c) => number(c.getValue()),
    },
    textColumn('beneficiary', 'Beneficiary', (r) => r.beneficiary, { size: 160, meta: { label: 'Beneficiary' } }),
    textColumn('sponsor', 'Sponsor', (r) => r.sponsor, { size: 160, meta: { label: 'Sponsor' } }),
    textColumn('strategy', 'Strategy', (r) => r.strategyPaths[0] || (r.strategy[0] === STRATEGY_NOT_ALIGNED ? STRATEGY_NOT_ALIGNED : ''), {
      size: 224, meta: { label: 'Strategy path' },
      cell: ({ row }) => {
        const r = row.original;
        const first = r.strategyPaths[0] || (r.strategy[0] === STRATEGY_NOT_ALIGNED ? STRATEGY_NOT_ALIGNED : '');
        if (!first) return dash;
        const more = r.strategyPaths.length - 1;
        return <span className="block truncate" title={r.strategyPaths.join('\n') || first}>{first}{more > 0 ? ` +${more}` : ''}</span>;
      },
    }),
    textColumn('feedback', 'Feedback', (r) => (r.feedbackStatus ? r.feedback : ''), { size: 112, meta: { label: 'Feedback' } }),
    {
      id: 'poc',
      header: 'PoC',
      accessorFn: (r) => (r.status?.label ? r.status.label : undefined),
      sortUndefined: 'last',
      sortDescFirst: false,
      size: 128, meta: { label: 'PoC status' },
      cell: ({ row }) => (row.original.status?.label ? <ImplementStatusBadge state={row.original.status} /> : dash),
    },
  ];
}

const segment = (active) => `inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
  active ? 'bg-db-red-50 text-db-red-fg' : 'text-text-secondary hover:bg-bg-subtle'
}`;

export default function UseCaseCatalog({
  rows,
  business,
  state,
  onStateChange,
  strategyOrder,
  bizPriorityOrder,
  renderCard,
  renderDetail,
  renderActions,
  onToggleFavorite,
  onOpenImplement,
  embedded = false,
  storage = globalThis.localStorage,
}) {
  const [mode, setMode] = useState('grid');
  const [density, setDensity] = useState('compact');
  const [sorting, setSorting] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({ ...DEFAULT_COLUMN_VISIBILITY });
  const [activeKey, setActiveKey] = useState('');
  const [expandedKey, setExpandedKey] = useState('');
  const [saved, setSaved] = useState(() => loadSavedViews(storage, business));
  const [viewError, setViewError] = useState('');

  useEffect(() => {
    setSaved(loadSavedViews(storage, business));
    setViewError('');
  }, [storage, business]);

  const defs = useMemo(
    () => catalogFacetDefs({ strategyOrder, bizPriorityOrder, extra: extraJsonFacets(rows.map((r) => r.uc)) }),
    [rows, strategyOrder, bizPriorityOrder],
  );
  const index = useMemo(() => facetIndex(rows, defs), [rows, defs]);
  const filtered = useMemo(() => filterRows(index, rows, state), [index, rows, state]);
  const maxInspire = useMemo(
    () => rows.reduce((m, r) => (typeof r.inspire === 'number' && Number.isFinite(r.inspire) && r.inspire > m ? r.inspire : m), 0),
    [rows],
  );
  const columns = useMemo(() => catalogColumns({ maxInspire, onToggleFavorite }), [maxInspire, onToggleFavorite]);
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.key,
  });
  const ordered = table.getRowModel().rows.map((r) => r.original);
  const builtIns = useMemo(() => builtInViews(index), [index]);
  const activeView = [...builtIns, ...saved].find((v) => sameFacetState(v.state, state));
  const chips = activeFilters(index, state);
  const position = ordered.findIndex((r) => r.key === activeKey);
  const activeRow = position >= 0 ? ordered[position] : null;

  useEffect(() => {
    if (activeKey && !activeRow) setActiveKey('');
  }, [activeKey, activeRow]);

  useEffect(() => {
    if (!activeKey || typeof document === 'undefined') return;
    const el = document.querySelector(`[data-row-key="${CSS.escape(activeKey)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeKey]);

  const applyView = useCallback((view) => {
    onStateChange(view.state);
    setViewError('');
    if (view.builtIn) return;
    setSorting(view.sorting || []);
    setColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY, ...(view.columns || {}) });
    setDensity(view.density || 'compact');
    setMode(view.mode || 'grid');
  }, [onStateChange]);

  const saveView = (name) => {
    const res = storeSavedView(storage, business, saved, { name, state, sorting, columns: columnVisibility, density, mode });
    setSaved(res.views);
    setViewError(res.error);
    return !res.error;
  };

  const deleteView = (id) => {
    const res = removeSavedView(storage, business, saved, id);
    setSaved(res.views);
    setViewError(res.error);
  };

  const railHeight = embedded ? 'top-4 max-h-[min(32rem,72vh)]' : 'top-20 max-h-[calc(100dvh-5rem)]';
  const listHeight = embedded ? 'h-[min(28rem,60vh)]' : 'h-[min(calc(100dvh-14rem),56rem)]';

  return (
    <div className="flex min-h-0 items-stretch gap-4" data-use-case-catalog="">
      <FacetRail
        index={index}
        rows={rows}
        state={state}
        onChange={onStateChange}
        className={`sticky z-10 w-60 shrink-0 self-start ${railHeight}`}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 shrink-0 rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-3 py-2">
            <SavedViews
              builtIns={builtIns}
              saved={saved}
              activeId={activeView?.id || ''}
              onApply={applyView}
              onSave={saveView}
              onDelete={deleteView}
              error={viewError}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="search"
                value={state.q || ''}
                onChange={(e) => onStateChange({ ...state, q: e.target.value })}
                placeholder="Search use cases, tables, KPIs…"
                aria-label="Search use cases"
                className="w-full rounded-lg border border-border bg-bg py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-tertiary focus:border-db-red/30 focus:outline-none focus:ring-1 focus:ring-db-red/20"
              />
            </div>
            <span className="text-[11px] text-text-secondary" aria-live="polite">
              <span className="font-semibold tabular-nums text-text-primary">{ordered.length}</span> of{' '}
              <span className="font-semibold tabular-nums text-text-primary">{rows.length}</span> use cases
            </span>
            <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Layout">
              <button type="button" aria-pressed={mode === 'grid'} onClick={() => setMode('grid')} className={segment(mode === 'grid')}>
                <Table2 size={12} /> Grid
              </button>
              <button type="button" aria-pressed={mode === 'cards'} onClick={() => setMode('cards')} className={`${segment(mode === 'cards')} border-l border-border`}>
                <LayoutList size={12} /> Cards
              </button>
            </div>
            {mode === 'grid' && (
              <>
                <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Row density">
                  <button type="button" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')} className={segment(density === 'compact')}>Compact</button>
                  <button type="button" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')} className={`${segment(density === 'comfortable')} border-l border-border`}>Comfortable</button>
                </div>
                <ColumnChooser table={table} onReset={() => setColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY })} />
              </>
            )}
          </div>
          {(chips.length > 0 || String(state.q || '').trim()) && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-db-red-50/40 px-3 py-2">
              <Filter size={11} className="shrink-0 text-db-red-fg" />
              {chips.map((chip) => (
                <span key={`${chip.key}:${chip.value}`} className="inline-flex max-w-[18rem] items-center gap-1 rounded-full border border-db-red/20 bg-surface px-2 py-0.5 text-[10px] font-medium text-text-primary" title={chip.value}>
                  <span className="text-text-tertiary">{chip.label}:</span>
                  <span className="truncate">{chip.text}</span>
                  <button type="button" onClick={() => onStateChange(toggleFacetValue(state, chip.key, chip.value))} className="text-text-tertiary hover:text-text-primary" aria-label={`Remove ${chip.label} ${chip.text}`}>
                    <X size={10} />
                  </button>
                </span>
              ))}
              {String(state.q || '').trim() && (
                <span className="inline-flex items-center gap-1 rounded-full border border-db-red/20 bg-surface px-2 py-0.5 text-[10px] font-medium text-text-primary">
                  “{state.q}”
                  <button type="button" onClick={() => onStateChange({ ...state, q: '' })} className="text-text-tertiary hover:text-text-primary" aria-label="Clear search">
                    <X size={10} />
                  </button>
                </span>
              )}
              <button type="button" onClick={() => onStateChange(emptyFacetState())} className="ml-1 text-[10px] font-semibold text-db-red-fg hover:underline">
                Clear all
              </button>
            </div>
          )}
        </div>

        {ordered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-sm">
            <Search size={20} className="mx-auto mb-3 text-text-tertiary" />
            <p className="text-sm text-text-secondary">No use cases match your filters.</p>
            <button type="button" onClick={() => onStateChange(emptyFacetState())} className="mt-2 text-xs font-medium text-db-red-fg hover:underline">
              Clear all filters
            </button>
          </div>
        ) : mode === 'grid' ? (
          <UseCaseGrid table={table} density={density} activeKey={activeKey} onOpen={(row) => setActiveKey(row.key)} className={listHeight} />
        ) : (
          <div className={`overflow-y-auto overscroll-y-contain pr-0.5 ${listHeight}`} role="region" aria-label="Use case list">
            <div className="space-y-3 pb-2">
              {ordered.map((row) => renderCard(row, {
                expanded: expandedKey === row.key,
                onToggle: () => setExpandedKey((k) => (k === row.key ? '' : row.key)),
              }))}
            </div>
          </div>
        )}
      </div>

      {activeRow && (
        <UseCaseDrawer
          row={activeRow}
          position={position}
          total={ordered.length}
          onClose={() => setActiveKey('')}
          onPrev={position > 0 ? () => setActiveKey(ordered[position - 1].key) : undefined}
          onNext={position < ordered.length - 1 ? () => setActiveKey(ordered[position + 1].key) : undefined}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(activeRow) : undefined}
          onOpenImplement={onOpenImplement ? () => onOpenImplement(activeRow) : undefined}
          actions={renderActions ? renderActions(activeRow) : null}
        >
          {renderDetail(activeRow)}
        </UseCaseDrawer>
      )}
    </div>
  );
}
