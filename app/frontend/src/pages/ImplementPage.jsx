import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, AppWindow, BellRing, CheckCircle2, ChevronDown, CircleDashed, ExternalLink, FileText, Hammer, History, LayoutDashboard, Loader2,
  NotebookPen, Pencil, Radar, RefreshCw, Rocket, RotateCcw, Search, Sparkles, Wand2, XCircle,
} from 'lucide-react';
import {
  statusChip, statusReason, nextSpecFrom, retryableOutputs, lostTables, lostTablesText, genieQuestions, appStatusRows, editedNotebook,
  runProfileText, versionActive, historyStatus, implementGroups, notebookRunEnded, notebookStatus, START_POC_LABEL, IMPLEMENT_ACTIVE_STATUSES,
  vibesPreview, vibesProblem,
} from '../lib/implementWizard';
import { makeApiFetch, makeApiPostJson } from '../lib/apiClient';
import { buildUseCaseList } from '../lib/useCaseList';
import { workspaceNotebookUrl } from '../lib/workspaceLinks';
import { subtitleOfUseCase } from '../lib/useCaseFields';
import { reducedMotion } from '../lib/motion';
import { formatWhen } from '../lib/formatWhen';
import ImplementStatusBadge from '../components/ImplementStatusBadge';
import ImplementWizard from './ImplementWizard';
import ImplementControlTower, { NotebookFacts, NotebookLinks } from '../components/ImplementControlTower';
import DrawerShell from '../components/DrawerShell';
import UseCaseDrawer from '../components/UseCaseDrawer';
import UseCaseDetailBody from '../components/UseCaseDetailBody';
import InspireScoreBadge from '../components/InspireScoreBadge';
import Celebration from '../components/Celebration';
import GenieLogo from '../components/GenieLogo';
import VibesEditor from '../components/VibesEditor';
import { Counter, CounterDivider, IconChip, PANEL_CLASS, SectionTitle } from '../components/BuildUi';
import { catalogRow } from '../lib/useCaseFacets';
import {
  CONTROL_REFRESH_MS, CONTROL_TAB, PROGRESS_TAB, buildSummary, deliveredOutputs, implementDefaultTab, removeChanges, vibeCards, vibeChanges, rollbackChanges,
} from '../lib/implementControl';
import { pocStages, pocProgressSummary, feedArrivals } from '../lib/pocProgress';
import PocProgress from '../components/PocProgress';
import GenieFeed from '../components/GenieFeed';

const TABS = [[PROGRESS_TAB, Activity], [CONTROL_TAB, Radar]];
const OUTPUT_ICONS = { notebook: NotebookPen, dashboard: LayoutDashboard, genie_space: GenieLogo, app: AppWindow, alert: BellRing };
const OUTPUT_NAMES = { dashboard: 'Dashboard', genie_space: 'Genie Agent', app: 'App', alert: 'Alert' };
const DETAILS_LOOK = {
  notebook: { title: 'Genie Code notebook', hint: '' },
  dashboard: { title: 'Dashboard', hint: 'The decision list, trend and run health Genie built' },
  genie_space: { title: 'Genie Agent', hint: 'Ask the result and source tables in plain language' },
  app: { title: 'App', hint: 'The Databricks App with the decision list, row detail and export' },
  alert: { title: 'Alert', hint: 'Emails people when the latest run has rows to act on' },
};
const NO_RAIL = { latest: [], notebook_run: null, notebook_run_error: '' };
const READY_STATUSES = ['ready', 'ready_with_warnings'];
const ERROR_BOX = 'text-xs text-error-fg bg-error-bg border border-error/20 rounded-lg px-3 py-2';
const OUTLINE_BUTTON = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-surface text-text-primary hover:bg-bg-subtle disabled:opacity-50';
const PRIMARY_BUTTON = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red-solid hover:bg-db-red-solid-hover shadow-sm shadow-db-red/20 disabled:opacity-50';
const LINK = 'text-sm font-semibold text-db-red-fg inline-flex items-center gap-1 hover:underline';

const GROUP_LOOK = {
  in_progress: { icon: Loader2, tone: 'red', hint: 'Genie is working on these' },
  ready: { icon: CheckCircle2, tone: 'success', hint: 'Built and ready to use' },
  failed: { icon: XCircle, tone: 'error', hint: 'Open one to see why' },
  not_started: { icon: CircleDashed, tone: 'idle', hint: 'Start a PoC/MVP with Genie' },
};

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function PageHeader({ summary, loading, query, onQuery }) {
  const subtitle = loading
    ? 'Every use case of this session: what has a PoC/MVP or a Genie Code notebook, what is running, and what has not started.'
    : `Every use case of this session: ${plural(summary.pocs, 'PoC/MVP')}, ${plural(summary.notebooks, 'Genie Code notebook')}, ${summary.notStarted} not started yet.`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface shadow-sm">
          <Hammer size={20} className="text-db-red-fg" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] bg-gradient-to-br from-text-primary via-text-primary to-db-red bg-clip-text text-transparent">Build</h1>
          <p className="text-sm text-text-secondary">{subtitle}</p>
        </div>
      </div>
      <label className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
        <input
          type="search"
          aria-label="Search use cases"
          placeholder="Search by name, id or domain"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="w-72 pl-9 pr-3 py-2.5 text-sm border border-border rounded-xl bg-surface text-text-primary shadow-sm glow-focus"
        />
      </label>
    </div>
  );
}

function SummaryBanner({ summary }) {
  const { building } = summary;
  let mark = { icon: Sparkles, tone: 'idle' };
  let title = 'No PoC/MVP started yet';
  let line = 'Pick a use case on the left and start one with Genie.';
  if (building.length) {
    mark = { icon: Rocket, tone: 'red', live: true };
    title = `${plural(building.length, 'PoC/MVP')} building now`;
    line = building.map((item) => `${item.id}${item.latest?.status_message ? `: ${item.latest.status_message}` : ''}`).join(' · ');
  } else if (summary.pocs) {
    mark = summary.failed ? { icon: AlertTriangle, tone: 'warning' } : { icon: CheckCircle2, tone: 'success' };
    title = `${summary.ready} of ${plural(summary.pocs, 'PoC/MVP')} ready`;
    line = summary.failed ? `${summary.failed} failed or stopped. Open one to see why.` : 'Every PoC/MVP of this session has finished building.';
  }
  return (
    <section aria-label="Build summary" className={PANEL_CLASS}>
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            {mark.live && <span className="absolute inset-0 rounded-xl bg-db-red/25 motion-safe:animate-ping" aria-hidden />}
            <span className="relative"><IconChip icon={mark.icon} tone={mark.tone} size="lg" /></span>
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text-primary tracking-tight">{title}</h2>
            <p className="text-[12px] text-text-secondary line-clamp-1">{line}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Counter value={summary.pocs} label="PoC/MVPs" />
          <CounterDivider />
          <Counter value={building.length} label="Building" tone="red" />
          <CounterDivider />
          <Counter value={summary.ready} label="Ready" tone="success" />
          {summary.failed > 0 && (
            <>
              <CounterDivider />
              <Counter value={summary.failed} label="Failed" tone="error" />
            </>
          )}
          <CounterDivider />
          <Counter value={summary.notebooks} label="Notebooks" />
          <CounterDivider />
          <Counter value={summary.notStarted} label="Not started" />
        </div>
      </div>
      {summary.delivered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-t border-border bg-bg-subtle/60">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary mr-1">Delivered so far</span>
          {summary.delivered.map((entry) => {
            const Icon = OUTPUT_ICONS[entry.id];
            return (
              <span key={entry.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success-bg text-success-fg text-[11px] font-medium">
                <Icon size={12} aria-hidden /> {entry.text}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OutputIcons({ latest }) {
  const ids = deliveredOutputs(latest);
  if (!ids.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {ids.map((id) => {
        const Icon = OUTPUT_ICONS[id];
        return (
          <span key={id} className="h-5 w-5 rounded-md bg-bg-subtle text-text-secondary flex items-center justify-center" aria-hidden>
            <Icon size={11} />
          </span>
        );
      })}
      <span className="sr-only">Delivered: {ids.map((id) => OUTPUT_NAMES[id]).join(', ')}</span>
    </span>
  );
}

function Rail({ groups, listLoading, query, shownId, onSelect }) {
  return (
    <nav aria-label="Use cases" className="w-80 shrink-0 space-y-3 max-h-[calc(100dvh-11rem)] overflow-y-auto pr-1">
      {listLoading && (
        <p className="flex items-center gap-2 px-1 text-[12px] text-text-secondary"><Loader2 size={14} className="animate-spin" /> Loading the use cases…</p>
      )}
      {!listLoading && query.trim() && groups.every((group) => group.items.length === 0) && (
        <p className="px-1 text-[12px] text-text-secondary">No use case matches &quot;{query.trim()}&quot;.</p>
      )}
      {!listLoading && groups.map((group) => {
        const look = GROUP_LOOK[group.id] || GROUP_LOOK.not_started;
        return (
          <section key={group.id} aria-label={group.label} className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-gradient-to-b from-db-red-50 to-surface">
              <IconChip icon={look.icon} tone={look.tone} size="sm" />
              <div className="flex-1 min-w-0">
                <h2 className="text-xs font-bold text-text-primary">{group.label}<span className="sr-only"> ({group.items.length})</span></h2>
                <p className="text-[10px] text-text-secondary">{look.hint}</p>
              </div>
              <span className="text-[11px] font-mono font-semibold text-text-secondary bg-bg-subtle rounded-md px-1.5 py-0.5" aria-hidden>{group.items.length}</span>
            </div>
            <div className="p-1.5 space-y-0.5">
              {group.items.length === 0 && <p className="px-3 py-2 text-[11px] text-text-secondary">None</p>}
              {group.items.map((item) => {
                const on = item.id === shownId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    onClick={() => onSelect(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-smooth ${on ? 'bg-db-red-50 border-db-red/25' : 'border-transparent hover:bg-bg-subtle'}`}
                  >
                    <div className={`text-[12.5px] font-semibold leading-snug line-clamp-2 ${on ? 'text-db-red-fg' : 'text-text-primary'}`}>{item.name}</div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="font-mono text-[10px] text-text-secondary">{item.id}</span>
                        <ImplementStatusBadge state={item.state} />
                      </span>
                      <OutputIcons latest={item.latest} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

export default function ImplementPage({ settings, sessionId, focusId = null, onFocus }) {
  const { token, databricksHost } = settings;
  const apiFetch = useMemo(() => makeApiFetch({ token, databricksHost }), [token, databricksHost]);
  const apiPostJson = useMemo(() => makeApiPostJson({ token, databricksHost }), [token, databricksHost]);
  const [useCases, setUseCases] = useState([]);
  const [discoveryType, setDiscoveryType] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [rail, setRail] = useState(NO_RAIL);
  const [railError, setRailError] = useState('');
  const [query, setQuery] = useState('');
  const [chosenId, setChosenId] = useState(focusId);
  const [wizard, setWizard] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [listVersion, setListVersion] = useState(0);
  const lastNotebookRun = useRef(null);
  const [views, setViews] = useState({});
  const rememberView = useCallback((id, view) => setViews((prev) => (prev[id] === view ? prev : { ...prev, [id]: view })), []);

  const qBase = useMemo(() => new URLSearchParams({
    inspire_database: settings.inspireDatabase,
    warehouse_id: settings.warehouseId,
    session_id: String(sessionId),
  }).toString(), [settings.inspireDatabase, settings.warehouseId, sessionId]);

  const fetchUseCases = useCallback(async () => {
    const [res, rows] = await Promise.allSettled([
      apiFetch(`/api/inspire/results?${qBase}`),
      apiFetch(`/api/inspire/usecases?${qBase}`),
    ]);
    const results = res.status === 'fulfilled' ? res.value?.results || null : null;
    const tracked = rows.status === 'fulfilled' ? rows.value?.usecases || null : null;
    if (!results && !tracked?.length) {
      const failed = [res, rows].find((r) => r.status === 'rejected');
      throw new Error(failed ? failed.reason.message : 'This session has no use cases yet.');
    }
    return { discoveryType: results?.discovery_type || '', list: buildUseCaseList(results, tracked) };
  }, [apiFetch, qBase]);

  const loadRail = useCallback(async () => {
    const data = await apiFetch(`/api/inspire/implement/history?${qBase}`);
    const run = data.notebook_run || null;
    const prev = lastNotebookRun.current;
    lastNotebookRun.current = run;
    if (notebookRunEnded(prev, run)) setListVersion((n) => n + 1);
    setRail({ latest: data.latest || [], notebook_run: run, notebook_run_error: data.notebook_run_error || '' });
    setRailError('');
  }, [apiFetch, qBase]);

  useEffect(() => {
    let cancelled = false;
    fetchUseCases()
      .then((got) => {
        if (cancelled) return;
        setDiscoveryType(got.discoveryType);
        setUseCases(got.list);
        setListError('');
      })
      .catch((e) => { if (!cancelled) setListError(e.message); })
      .finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [fetchUseCases, listVersion]);

  useEffect(() => {
    const tick = () => loadRail().catch((e) => setRailError(e.message));
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [loadRail]);

  const groups = useMemo(() => implementGroups(useCases, rail.latest, rail.notebook_run, query), [useCases, rail.latest, rail.notebook_run, query]);
  const allItems = useMemo(() => implementGroups(useCases, rail.latest, rail.notebook_run).flatMap((g) => g.items), [useCases, rail.latest, rail.notebook_run]);
  const summary = useMemo(() => buildSummary(allItems), [allItems]);
  const shownId = chosenId || allItems[0]?.id || null;
  const selected = allItems.find((item) => item.id === shownId) || null;

  const select = (id) => {
    setChosenId(id);
    onFocus?.(id);
  };

  const onImplemented = (data) => {
    setWizard(null);
    if (data?.use_case_id) select(data.use_case_id);
    setRefreshKey((n) => n + 1);
    loadRail().catch((e) => setRailError(e.message));
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-4" data-implement-page="">
      <PageHeader summary={summary} loading={listLoading} query={query} onQuery={setQuery} />
      {!listLoading && !listError && <SummaryBanner summary={summary} />}
      {listError && <p className={ERROR_BOX}>{listError}</p>}
      {railError && <p className={ERROR_BOX}>{railError}</p>}
      <div className="flex gap-4 items-start">
        <Rail groups={groups} listLoading={listLoading} query={query} shownId={shownId} onSelect={select} />
        <section aria-label="Use case" className="flex-1 min-w-0 space-y-4">
          {selected ? (
            <UseCaseDetail
              key={selected.id}
              item={selected}
              sessionId={sessionId}
              settings={settings}
              qBase={qBase}
              apiFetch={apiFetch}
              apiPostJson={apiPostJson}
              databricksHost={databricksHost}
              notebookRunError={rail.notebook_run_error}
              refreshKey={refreshKey}
              savedView={views[selected.id] || null}
              onView={(view) => rememberView(selected.id, view)}
              onEdit={(focus) => setWizard({ uc: selected.uc, focus })}
            />
          ) : (
            !listLoading && !listError && <p className={`${PANEL_CLASS} p-6 text-[12px] text-text-secondary`}>This session has no use cases yet.</p>
          )}
        </section>
      </div>
      {wizard && (
        <ImplementWizard
          uc={wizard.uc}
          sessionId={sessionId}
          settings={settings}
          discoveryType={discoveryType}
          apiFetch={apiFetch}
          apiPostJson={apiPostJson}
          focus={wizard.focus}
          onClose={() => setWizard(null)}
          onImplemented={onImplemented}
          onOpenBuild={() => setWizard(null)}
        />
      )}
    </div>
  );
}

function VersionRow({ card, version, locked, pending, confirming, onAsk, onCancel, onConfirm }) {
  const confirmRef = useRef(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [confirming]);
  return (
    <li data-version={version.version} className="px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-text-primary">v{version.version}</span>
        {version.at && <span className="text-text-secondary">{formatWhen(version.at, version.at)}</span>}
        <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-text-secondary">{statusChip(version.status).label}</span>
        <button type="button" disabled={locked || confirming} onClick={onAsk} className={`ml-auto ${OUTLINE_BUTTON}`}>
          <History size={12} /> Roll back to v{version.version}
        </button>
      </div>
      <p className="truncate text-text-secondary" title={version.vibes || undefined}>
        {version.vibes ? `“${vibesPreview(version.vibes)}”` : 'no vibes'}
      </p>
      {confirming && (
        <div ref={confirmRef} role="group" aria-label={`Confirm the roll back to v${version.version}`}
          className="rounded-lg border border-border-strong bg-bg-subtle px-3 py-2 space-y-2 motion-safe:animate-terminal-line">
          <p className="text-text-primary">Roll back the {card.label} to v{version.version}? This replaces the live {card.label}; Genie is not called.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={locked} onClick={onConfirm} className={PRIMARY_BUTTON}>
              {pending ? <Loader2 size={12} className="animate-spin" /> : <History size={12} />} Roll back
            </button>
            <button type="button" onClick={onCancel} className={OUTLINE_BUTTON}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

function VibeCard({ card, draft, locked, onDraft, onRebuild, onRollback }) {
  const [pending, setPending] = useState('');
  const [confirming, setConfirming] = useState(null);
  const text = draft ?? card.vibes;
  const changed = text.trim() !== card.vibes;
  const problem = vibesProblem(card.id, text);
  const title = card.rebuild ? `Vibe the ${card.label}` : `The ${card.label}`;
  const rebuild = async () => {
    setPending('rebuild');
    const ok = await onRebuild(card.id, text);
    setPending('');
    if (ok) onDraft(card.id, null);
  };
  const rollback = async (version) => {
    setPending(`v${version.version}`);
    const ok = await onRollback(card.id, version);
    setPending('');
    if (ok) setConfirming(null);
  };
  return (
    <article data-vibe-card={card.id} aria-label={title} className="rounded-lg border border-border bg-surface p-3 space-y-2.5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <IconChip icon={OUTPUT_ICONS[card.id]} size="sm" /> {title}
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <p data-live="" className="text-[11px] text-text-secondary">
            {card.live
              ? <>Live: built from <span className="font-semibold text-text-primary">v{card.live.version}</span>{card.live.at ? `, ${formatWhen(card.live.at, card.live.at)}` : ''}</>
              : 'Not live on the latest version'}
          </p>
          {card.url && <a className={LINK} href={card.url} target="_blank" rel="noreferrer">Open the {card.label} <ExternalLink size={12} /></a>}
        </div>
      </header>
      {card.rebuild && (
        <>
          <VibesEditor id={card.id} value={text} onChange={(value) => onDraft(card.id, value)} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button type="button" disabled={locked || Boolean(problem) || Boolean(pending)} onClick={rebuild} className={changed ? PRIMARY_BUTTON : OUTLINE_BUTTON}>
              {pending === 'rebuild' ? <Loader2 size={12} className="animate-spin" /> : changed ? <Wand2 size={12} /> : <RotateCcw size={12} />}
              {changed ? 'Rebuild with these vibes' : `Rebuild the ${card.label}`}
            </button>
            {changed && (
              <button type="button" disabled={Boolean(pending)} onClick={() => onDraft(card.id, null)} className="text-[11px] font-semibold text-text-secondary underline hover:text-text-primary">
                Discard my edits
              </button>
            )}
            <span className="text-[11px] text-text-secondary">
              {card.id === 'notebook'
                ? (changed ? 'Genie rewrites the notebook with your asks, runs it, and refreshes every output from the new result.'
                  : 'Genie checks every cell against the current rules, runs the notebook, and refreshes every output from the new result.')
                : (changed ? `Genie rebuilds only the ${card.label} with your asks and replaces the live one.` : `Genie writes the ${card.label} again from this version.`)}
            </span>
          </div>
        </>
      )}
      {card.warnings.length > 0 && (
        <ul aria-label={`Vibes Genie could not do on the ${card.label}`} className="space-y-0.5">
          {card.warnings.map((w) => <li key={w} className="flex items-start gap-1.5 text-[11px] text-warning-fg"><AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />{w}</li>)}
        </ul>
      )}
      {card.versions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Versions</p>
          <ul aria-label={`Earlier versions of the ${card.label}`} className="divide-y divide-border border border-border rounded-lg">
            {card.versions.map((version) => (
              <VersionRow
                key={version.version}
                card={card}
                version={version}
                locked={locked || Boolean(pending)}
                pending={pending === `v${version.version}`}
                confirming={confirming === version.version}
                onAsk={() => setConfirming(version.version)}
                onCancel={() => setConfirming(null)}
                onConfirm={() => rollback(version)}
              />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function VibePanel({ card, draft, locked, active, onDraft, onRebuild, onRollback }) {
  return (
    <section aria-label="Rebuild and roll back" className="min-w-0 space-y-2.5">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Rebuild and roll back</h3>
      <p className="text-text-secondary">
        Your asks win over Inspire&apos;s defaults. Genie rebuilds only the output you vibe and replaces the live one, and every earlier version it saved can come back. Vibing the notebook reruns it and refreshes every output.
      </p>
      {active && <p className="font-medium text-text-primary">A version is building now; vibes and roll backs apply after it finishes.</p>}
      <VibeCard card={card} draft={draft} locked={locked} onDraft={onDraft} onRebuild={onRebuild} onRollback={onRollback} />
    </section>
  );
}

function DetailsDrawer({ id, useCaseId, onClose, children }) {
  const look = DETAILS_LOOK[id];
  return (
    <DrawerShell
      data-details-drawer={id}
      label={`${look.title} details`}
      closeLabel={`Close the ${look.title} details`}
      onClose={onClose}
      title={(
        <div className="flex items-start gap-3">
          <IconChip icon={OUTPUT_ICONS[id]} size="lg" />
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold text-text-secondary">{useCaseId}</p>
            <h2 className="mt-0.5 text-xl font-bold leading-snug text-text-primary">{look.title}</h2>
            {look.hint && <p className="mt-1 text-sm text-text-secondary leading-snug">{look.hint}</p>}
          </div>
        </div>
      )}
    >
      <div className="space-y-4 text-[12px]">{children}</div>
    </DrawerShell>
  );
}

function UseCaseDetail({ item, sessionId, settings, qBase, apiFetch, apiPostJson, databricksHost, notebookRunError, refreshKey, savedView,
  onView, onEdit }) {
  const useCaseId = item.id;
  const hasPoc = Boolean(item.latest);
  const viewId = useId();
  const tabRefs = useRef({});
  const [status, setStatus] = useState(null);
  const [view, setView] = useState(savedView);
  const [details, setDetails] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState('');
  const [overrides, setOverrides] = useState({});
  const [rerunBusy, setRerunBusy] = useState(false);
  const [rerunError, setRerunError] = useState(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [live, setLive] = useState(null);
  const [liveError, setLiveError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [celebrations, setCelebrations] = useState(0);
  const [vibeDrafts, setVibeDrafts] = useState({});
  const lastStatus = useRef(null);

  const [arrivals, setArrivals] = useState(null);

  const loadStatus = useCallback(async () => {
    const data = await apiFetch(`/api/inspire/implement/status?${qBase}&use_case_id=${encodeURIComponent(useCaseId)}`);
    setStatus(data);
    setArrivals((prev) => feedArrivals(prev, data.feed, Date.now()));
  }, [apiFetch, qBase, useCaseId]);

  const loadLive = useCallback(async () => {
    try {
      setLive(await apiFetch(`/api/inspire/implement/live?${qBase}&use_case_id=${encodeURIComponent(useCaseId)}`));
      setLiveError('');
    } catch (e) {
      setLiveError(e.message);
    }
  }, [apiFetch, qBase, useCaseId]);

  useEffect(() => {
    if (!hasPoc) return undefined;
    loadLive();
    const id = setInterval(loadLive, CONTROL_REFRESH_MS);
    return () => clearInterval(id);
  }, [hasPoc, loadLive, refreshKey]);

  useEffect(() => {
    if (!hasPoc) return undefined;
    loadStatus().catch((e) => setError(e.message));
    const id = setInterval(() => { loadStatus().catch(() => {}); }, 10000);
    return () => clearInterval(id);
  }, [hasPoc, loadStatus, refreshKey]);

  const latest = status ? status.latest : item.latest;
  const stalled = (status ? status.stalled : item.latest?.stalled) || null;
  const chip = statusChip(latest?.status, stalled);
  const spec = latest?.spec_json || {};
  const widgets = Array.isArray(status?.rerun_widgets) ? status.rerun_widgets : [];
  const active = versionActive(latest, stalled);
  const missing = lostTables(latest, rerunError);
  const edited = latest?.status === 'failed' ? editedNotebook(latest) : null;
  const reason = missing.length || edited ? '' : statusReason(latest, stalled);
  const genie = genieQuestions(latest);
  const genieAsset = latest?.asset_status?.genie_space || {};
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  const stages = useMemo(() => pocStages(status?.steps, latest, { now, stalled }), [status?.steps, latest, now, stalled]);
  const progress = pocProgressSummary(stages, latest, { now, stalled });
  const row = useMemo(() => (item.uc ? catalogRow(item.uc, 0, { statusOf: () => item.state }) : null), [item.uc, item.state]);
  const subtitle = item.uc ? subtitleOfUseCase(item.uc, item.name) : '';

  const shown = implementDefaultTab(view, active);
  if (shown !== view) {
    setView(shown);
    if (shown.tab !== CONTROL_TAB && details) setDetails(null);
  }
  const tab = shown.tab;
  useEffect(() => {
    if (view) onView?.(view);
  }, [view, onView]);

  useEffect(() => {
    const current = latest?.status || null;
    const was = lastStatus.current;
    lastStatus.current = current;
    if (was && IMPLEMENT_ACTIVE_STATUSES.includes(was) && READY_STATUSES.includes(current) && !reducedMotion()) setCelebrations((n) => n + 1);
  }, [latest?.status]);

  const showTab = (name) => {
    setView(implementDefaultTab(shown, active, name));
    if (name !== CONTROL_TAB) setDetails(null);
  };
  const openDetails = (id) => {
    if (hasPoc) setView(implementDefaultTab(shown, active, CONTROL_TAB));
    setDetails(id);
  };
  const seeBuild = () => {
    showTab(PROGRESS_TAB);
    tabRefs.current[PROGRESS_TAB]?.focus();
  };
  const onTabKey = (e) => {
    const at = TABS.findIndex(([name]) => name === tab);
    const last = TABS.length - 1;
    const next = { ArrowRight: at === last ? 0 : at + 1, ArrowLeft: at === 0 ? last : at - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const [name] = TABS[next];
    showTab(name);
    tabRefs.current[name]?.focus();
  };
  const tabKey = (name) => name.toLowerCase().replace(/\s+/g, '-');

  const rerun = async () => {
    setRerunBusy(true);
    setError('');
    setRerunError(null);
    try {
      await apiPostJson(`/api/inspire/implement/rerun?${qBase}&use_case_id=${encodeURIComponent(useCaseId)}`, { overrides });
      await loadStatus();
    } catch (e) {
      setError(e.message);
      setRerunError(e.body || null);
    } finally {
      setRerunBusy(false);
    }
  };

  const submitNext = async (changes) => {
    if (!latest || active || submitBusy) return false;
    setSubmitBusy(true);
    setError('');
    try {
      await apiPostJson('/api/inspire/implement/submit', {
        inspire_database: settings.inspireDatabase,
        warehouse_id: settings.warehouseId,
        session_id: String(sessionId),
        notebook_path: settings.notebookPath,
        spec: nextSpecFrom(latest, changes),
      });
      await loadStatus();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setSubmitBusy(false);
    }
  };

  const toggleSchedule = () => submitNext({ schedule: { ...(spec.schedule || {}), enabled: !spec.schedule?.enabled } });
  const retryOutput = (name) => submitNext({ retry_outputs: [name] });
  const removeOutput = (name) => submitNext(removeChanges(latest, name));
  const vibeOutput = (name, text) => submitNext(vibeChanges(latest, name, text));
  const rollbackOutput = (name, version) => submitNext(rollbackChanges(latest, name, version.version, version.vibes));

  const runControl = async (a) => {
    setActionBusy(`${a.asset}:${a.action}`);
    setError('');
    try {
      const got = await apiPostJson(`/api/inspire/implement/control?${qBase}&use_case_id=${encodeURIComponent(useCaseId)}`, { asset: a.asset, action: a.action });
      if (got.audit_error) setError(got.audit_error);
      await loadStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      await loadLive();
      setActionBusy('');
    }
  };
  const failedOutputs = retryableOutputs(latest);
  const notebookPath = item.uc?.notebook_path || '';
  const vibeTargets = vibeCards(status?.history, latest, stalled, workspaceNotebookUrl(databricksHost, notebookPath));
  const alertAsset = latest?.asset_status?.alert || {};
  const notebookState = item.notebook || (vibeTargets.some((c) => c.id === 'notebook') ? notebookStatus({ has_genie_code: 'Y' }, null) : null);
  const notebook = notebookState && {
    state: notebookState,
    path: notebookPath,
    href: notebookState.state === 'ready' ? workspaceNotebookUrl(databricksHost, notebookPath) : '',
    runUrl: notebookState.url || '',
    runError: notebookRunError || '',
  };
  const failedStage = stages.find((s) => s.state === 'error') || null;
  const stopped = Boolean(stalled) && IMPLEMENT_ACTIVE_STATUSES.includes(String(latest?.status || ''));
  const versionCount = status?.history?.length ?? 0;
  const runCount = status?.runs?.ok === false ? null : status?.runs?.runs?.length ?? 0;
  const historyHint = status
    ? `${plural(versionCount, 'spec version')} · ${runCount === null ? 'job runs unknown' : plural(runCount, 'job run')}`
    : 'Loading…';

  const retryBanner = (name) => {
    const failed = failedOutputs.find((o) => o.id === name);
    if (!failed) return null;
    return (
      <div className="border border-error/30 bg-error-bg rounded-lg px-3 py-2 text-[12px] space-y-2">
        <p className="text-error-fg">The {failed.label} failed on v{failed.spec_version}: {failed.error || 'no error text was recorded'}</p>
        <button type="button" disabled={active || submitBusy} onClick={() => retryOutput(name)} className={PRIMARY_BUTTON}>
          {submitBusy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Retry the {failed.label}
        </button>
      </div>
    );
  };

  const detailsBody = (id) => {
    if (id === 'notebook') {
      if (!notebook) return null;
      return (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text-primary">Genie Code notebook</span>
            <ImplementStatusBadge state={notebook.state} />
          </div>
          <div className="space-y-0.5"><NotebookFacts notebook={notebook} /></div>
          {(notebook.href || notebook.runUrl) && <div className="flex flex-wrap gap-2"><NotebookLinks notebook={notebook} /></div>}
        </>
      );
    }
    if (id === 'dashboard') {
      return latest?.dashboard_url
        ? <a className={LINK} href={latest.dashboard_url} target="_blank" rel="noreferrer">Open dashboard <ExternalLink size={12} /></a>
        : <p className="text-text-secondary">No dashboard on this version.</p>;
    }
    if (id === 'genie_space') {
      if (!latest?.genie_space_url) return <p className="text-text-secondary">No Genie Agent on this version.</p>;
      return (
        <>
          <a className={LINK} href={latest.genie_space_url} target="_blank" rel="noreferrer">Open Genie Agent <ExternalLink size={12} /></a>
          {genie.questions.length > 0 && (
            <div>
              <p className="font-medium text-text-primary">{genie.source === 'space' ? 'Sample questions in the Genie Agent' : 'Questions you asked for'}</p>
              <ul className="list-disc pl-5">{genie.questions.map((question, i) => (
                <li key={question}>
                  <span>{question}</span>
                  {genie.notes[i] && <p className="text-text-secondary">{genie.notes[i]}</p>}
                </li>
              ))}</ul>
            </div>
          )}
          {genieAsset.check_question && <p>Inspire checked the Genie Agent with: {genieAsset.check_question}</p>}
          {genieAsset.check_sql && <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap border border-border rounded-lg bg-bg-subtle p-2">{genieAsset.check_sql}</pre>}
        </>
      );
    }
    if (id === 'app') {
      if (!latest?.app_url) return <p className="text-text-secondary">No App on this version.</p>;
      return (
        <>
          <a className={LINK} href={latest.app_url} target="_blank" rel="noreferrer">Open App <ExternalLink size={12} /></a>
          <table className="text-[12px]">
            <tbody>
              {appStatusRows(status?.app_status, latest?.asset_status?.app).map(([label, value]) => (
                <tr key={label}><td className="pr-3 py-0.5 text-text-secondary">{label}</td><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      );
    }
    if (!latest?.alert_url) return <p className="text-text-secondary">No alert on this version.</p>;
    return (
      <>
        <a className={LINK} href={latest.alert_url} target="_blank" rel="noreferrer">Open alert <ExternalLink size={12} /></a>
        <p>Fires when: {alertAsset.trigger || '—'}</p>
        {alertAsset.condition_sql && <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap border border-border rounded-lg bg-bg-subtle p-2">{alertAsset.condition_sql}</pre>}
        <p>Notifies: {spec.outputs?.alert_recipients?.join(', ') || 'no email recipients'}
          {(spec.outputs?.alert_destinations || []).length ? `; ${spec.outputs.alert_destinations.map((d) => d.name || d.id).join(', ')}` : ''}
        </p>
        <p>Subscribers on the job task: {alertAsset.subscribers ?? '—'}</p>
        <p>Last check: {alertAsset.check_state || '—'}</p>
        <p className="text-text-secondary">It runs after each scheduled or full run of the job and notifies once per run, only when the condition holds. Preview re-runs never send it.</p>
      </>
    );
  };
  const detailsCard = details ? vibeTargets.find((card) => card.id === details) || null : null;

  const failureBanner = hasPoc && chip.tone === 'error' && (
    <section aria-label="Build failed" className="rounded-lg border border-error/30 bg-error-bg px-3.5 py-3 text-[12px] space-y-2.5">
      <div className="flex items-start gap-2.5">
        <XCircle size={16} className="mt-px shrink-0 text-error-fg" aria-hidden />
        <div className="min-w-0 space-y-0.5 text-error-fg">
          <p className="text-[13px] font-semibold">{stopped ? 'The build stopped' : 'The build failed'}</p>
          {failedStage && <p>Step: <span className="font-semibold">{failedStage.label}</span></p>}
          {reason && <p>{reason}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={seeBuild} className={OUTLINE_BUTTON}>
          <Activity size={12} /> See the build
        </button>
        <button type="button" onClick={() => onEdit(null)} className={PRIMARY_BUTTON}>
          <Pencil size={12} /> Edit the PoC/MVP
        </button>
      </div>
    </section>
  );

  return (
    <>
      {celebrations > 0 && <Celebration key={celebrations} trigger />}
      <div className={PANEL_CLASS}>
        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-border bg-gradient-to-r from-db-red-50 to-surface">
          {row?.domain && <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-db-red-fg">{row.domain}</span>}
          {row?.domain && row?.subdomain && <span className="text-text-secondary text-[11px]" aria-hidden>›</span>}
          {row?.subdomain && <span className="text-[11px] text-text-secondary">{row.subdomain}</span>}
          <span className="font-mono text-[11px] text-text-secondary">{item.id}</span>
          <span className="ml-auto flex items-center gap-2">
            <ImplementStatusBadge state={item.state} />
            {latest?.spec_version != null && <span className="font-mono text-[11px] text-text-secondary">v{latest.spec_version}</span>}
          </span>
        </div>
        <div className="px-5 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-text-primary leading-snug">{item.name}</h2>
            {subtitle && <p className="mt-1.5 text-sm text-text-secondary leading-snug line-clamp-2">{subtitle}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {item.uc && (
                <button type="button" onClick={() => setDetailsOpen(true)} className={OUTLINE_BUTTON}>
                  <FileText size={13} /> Use case details
                </button>
              )}
              {hasPoc ? (
                <button
                  type="button"
                  disabled={active}
                  title={active ? 'Edit applies after this run' : undefined}
                  onClick={() => onEdit(null)}
                  className={OUTLINE_BUTTON}
                >
                  <Pencil size={13} /> Edit the PoC/MVP
                </button>
              ) : (
                <button type="button" onClick={() => onEdit(null)} className={PRIMARY_BUTTON}>
                  <Sparkles size={13} /> {START_POC_LABEL}
                </button>
              )}
            </div>
          </div>
          {row && <InspireScoreBadge score={row.inspire} />}
        </div>
        {!hasPoc && (
          <p className="px-5 pb-5 text-[12px] text-text-secondary">
            No PoC/MVP yet. {START_POC_LABEL} builds one, or writes only the Genie Code notebook when you choose Notebook only.
          </p>
        )}
      </div>
      {detailsOpen && row && (
        <UseCaseDrawer row={row} onClose={() => setDetailsOpen(false)}>
          <UseCaseDetailBody uc={item.uc} v130={item.uc._v130 || null} token={settings.token} databricksHost={databricksHost} />
        </UseCaseDrawer>
      )}
      {!hasPoc && notebook && <ImplementControlTower poc={false} notebook={notebook} onDetails={openDetails} />}
      {hasPoc && (
        <>
          {failedOutputs.length > 0 && (
            <p className={`${ERROR_BOX} flex flex-wrap items-center gap-x-3 gap-y-1`}>
              {failedOutputs.map((o) => `The ${o.label}`).join(', ')} failed.
              {failedOutputs.map((o) => (
                <button key={o.id} type="button" className="underline font-semibold" onClick={() => openDetails(o.id)}>Open the {o.label} details</button>
              ))}
            </p>
          )}
          {error && <p className={ERROR_BOX}>{error}</p>}
          {missing.length > 0 && (
            <div className="border border-error/30 bg-error-bg rounded-lg px-3 py-2 text-[12px] space-y-2">
              <p className="text-error-fg">{lostTablesText(missing)}</p>
              <button type="button" disabled={active} onClick={() => onEdit({ step: 'data', missingTables: missing })} className={PRIMARY_BUTTON}>
                <Pencil size={12} /> Edit the Data step
              </button>
            </div>
          )}
          {edited && (
            <div className="border border-error/30 bg-error-bg rounded-lg px-3 py-2 text-[12px] space-y-2">
              <p className="text-error-fg">
                {statusReason(latest) || 'The notebook was edited after Inspire last built it, so this version did not rebuild it.'}
              </p>
              <button type="button" disabled={active || submitBusy} onClick={() => submitNext({ confirm_notebook_overwrite: true })} className={PRIMARY_BUTTON}>
                {submitBusy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Rebuild and overwrite the edits
              </button>
            </div>
          )}
          <div role="tablist" aria-label="PoC/MVP views" className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-bg-subtle border border-border">
            {TABS.map((entry) => {
              const [name, TabIcon] = entry;
              return (
                <button
                  key={name}
                  ref={(node) => { tabRefs.current[name] = node; }}
                  type="button"
                  role="tab"
                  id={`${viewId}-tab-${tabKey(name)}`}
                  aria-selected={tab === name}
                  aria-controls={`${viewId}-panel-${tabKey(name)}`}
                  tabIndex={tab === name ? 0 : -1}
                  onClick={() => showTab(name)}
                  onKeyDown={onTabKey}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-smooth ${
                    tab === name ? 'bg-surface text-db-red-fg shadow-sm ring-1 ring-inset ring-db-red/20' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <TabIcon size={13} aria-hidden />{name}
                </button>
              );
            })}
          </div>
          <div role="tabpanel" id={`${viewId}-panel-${tabKey(PROGRESS_TAB)}`} aria-labelledby={`${viewId}-tab-${tabKey(PROGRESS_TAB)}`} hidden={tab !== PROGRESS_TAB}
            className="space-y-4">
            {tab === PROGRESS_TAB && (
              <>
                <PocProgress stages={stages} summary={progress} chip={chip} reason={reason} toneClass={toneClass} version={latest?.spec_version}>
                  <GenieFeed feed={status ? status.feed || [] : null} arrivals={arrivals} active={progress.active} working={progress.headline} />
                </PocProgress>
                {stalled?.run_url && (
                  <a className="text-[12px] font-semibold text-db-red-fg inline-flex items-center gap-1" href={stalled.run_url} target="_blank" rel="noreferrer">
                    Open the run that stopped <ExternalLink size={12} />
                  </a>
                )}
              </>
            )}
          </div>
          <div role="tabpanel" id={`${viewId}-panel-${tabKey(CONTROL_TAB)}`} aria-labelledby={`${viewId}-tab-${tabKey(CONTROL_TAB)}`} hidden={tab !== CONTROL_TAB}
            className="space-y-4">
            {tab === CONTROL_TAB && (
              <>
                <ImplementControlTower
                  notebook={notebook}
                  banner={failureBanner}
                  failed={failedOutputs}
                  live={live}
                  liveError={liveError}
                  latest={latest}
                  useCaseId={useCaseId}
                  active={active}
                  buildingNow={progress.current?.state === 'running' ? progress.current.id : ''}
                  actionBusy={actionBusy}
                  submitBusy={submitBusy}
                  onAction={runControl}
                  onRemove={removeOutput}
                  onToggleSchedule={toggleSchedule}
                  onRefresh={loadLive}
                  onAddOutput={() => onEdit({ step: 'delivery' })}
                  onRetry={retryOutput}
                  onDetails={openDetails}
                />
                <section aria-label="Run and schedule" className={PANEL_CLASS}>
                  <SectionTitle icon={RefreshCw} title="Run and schedule" hint="Edit, schedule and retry build a new version; a preview re-run does not" />
                  <div className="p-4 grid gap-5 md:grid-cols-2 text-[12px]">
                    <div className="space-y-4">
                      <button
                        type="button"
                        disabled={active}
                        onClick={() => onEdit(null)}
                        className={`w-full justify-center ${OUTLINE_BUTTON}`}
                      >
                        <Pencil size={12} /> {active ? 'Edit applies after this run' : 'Edit the PoC/MVP'}
                      </button>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary mb-1">Quick re-run</div>
                        {widgets.map((w) => (
                          <label key={w.name} className="block text-[11px] mb-1">
                            {w.label || w.name}
                            {Array.isArray(w.choices) && w.choices.length > 0 ? (
                              <select
                                className="mt-0.5 w-full px-2 py-1 border border-border rounded-lg bg-surface"
                                value={overrides[w.name] ?? ''}
                                onChange={(e) => setOverrides((prev) => ({ ...prev, [w.name]: e.target.value }))}
                              >
                                <option value="">{w.default ? `Keep ${w.default}` : 'Keep the job value'}</option>
                                {w.choices.map((choice) => <option key={String(choice)} value={String(choice)}>{String(choice)}</option>)}
                              </select>
                            ) : (
                              <input
                                className="mt-0.5 w-full px-2 py-1 border border-border rounded-lg bg-surface"
                                value={overrides[w.name] ?? ''}
                                placeholder={w.default == null ? '' : String(w.default)}
                                onChange={(e) => setOverrides((prev) => ({ ...prev, [w.name]: e.target.value }))}
                              />
                            )}
                            {w.allowed && <span className="block text-[10px] text-text-secondary">{w.allowed}</span>}
                          </label>
                        ))}
                        {widgets.length === 0 && <p className="text-[11px] text-text-secondary">No widgets to change; the re-run uses the job&apos;s values.</p>}
                        <p className="text-[10px] text-text-secondary">A preview of the notebook only. Blank fields keep the job&apos;s values, and the alert never fires on a preview.</p>
                        <button
                          type="button"
                          disabled={rerunBusy || !latest?.job_id}
                          onClick={rerun}
                          className={`mt-2 w-full justify-center ${PRIMARY_BUTTON}`}
                        >
                          {rerunBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Preview re-run
                        </button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="flex items-center gap-2 text-[12px]">
                        <input type="checkbox" checked={!!spec.schedule?.enabled} disabled={active || !latest || submitBusy} onChange={toggleSchedule} />
                        Schedule on
                      </label>
                      {failedOutputs.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Failed outputs</div>
                          {failedOutputs.map((o) => (
                            <button
                              key={o.id}
                              type="button"
                              disabled={active || submitBusy}
                              onClick={() => retryOutput(o.id)}
                              title={o.error}
                              className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-error/40 bg-surface text-error-fg disabled:opacity-50"
                            >
                              <RotateCcw size={12} /> Retry the {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
                <section aria-label="History" className={PANEL_CLASS}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={historyOpen}
                      aria-controls={`${viewId}-history`}
                      onClick={() => setHistoryOpen((open) => !open)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-gradient-to-r from-db-red-50 to-surface"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <IconChip icon={History} size="sm" />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-db-red-fg">History</span>
                          <span className="block text-[11px] text-text-secondary">{historyHint}</span>
                        </span>
                      </span>
                      <ChevronDown size={14} className={`shrink-0 text-text-secondary transition-transform ${historyOpen ? 'rotate-180' : ''}`} aria-hidden />
                    </button>
                  </h3>
                  <div id={`${viewId}-history`} hidden={!historyOpen} className="p-4 space-y-3 text-[12px] border-t border-border">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Spec versions</div>
                    {!status && <p className="text-[12px] text-text-secondary">Loading the versions and job runs…</p>}
                    {(status?.history || []).map((entry) => (
                      <div key={entry.spec_version} className="border border-border rounded-lg bg-surface px-3 py-2 text-[12px]">
                        <div>v{entry.spec_version} · {historyStatus(entry, latest, stalled)} · {entry.change_classes || 'initial'}</div>
                        <div className="text-text-secondary">{entry.created_by} · {entry.updated_at}</div>
                      </div>
                    ))}
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary pt-2">Job runs</div>
                    {status?.runs?.ok === false && <p className="text-[12px] text-error-fg">{status.runs.error}</p>}
                    {(status?.runs?.runs || []).map((run) => (
                      <div key={run.run_id} className="border border-border rounded-lg bg-surface px-3 py-2 text-[12px]">
                        <div>{run.state || 'unknown'} · {runProfileText(run.profile)} · {run.trigger === 'PERIODIC' ? 'scheduled' : 'started by hand'}</div>
                        <div className="text-text-secondary">
                          {run.started} · {run.duration_s}s
                          {run.url && <> · <a className="text-db-red-fg" href={run.url} target="_blank" rel="noreferrer">Open run</a></>}
                        </div>
                        {run.message && <div className="text-text-secondary">{run.message}</div>}
                      </div>
                    ))}
                    {status?.runs?.ok && status.runs.runs.length === 0 && <p className="text-[12px] text-text-secondary">No job runs yet.</p>}
                    {status && !status.runs && <p className="text-[12px] text-text-secondary">This use case has no job yet.</p>}
                  </div>
                </section>
              </>
            )}
          </div>
        </>
      )}
      {details && (
        <DetailsDrawer id={details} useCaseId={useCaseId} onClose={() => setDetails(null)}>
          {retryBanner(details)}
          {detailsBody(details)}
          {detailsCard && (
            <VibePanel
              card={detailsCard}
              draft={vibeDrafts[detailsCard.id] ?? null}
              locked={active || submitBusy}
              active={active}
              onDraft={(name, text) => setVibeDrafts((prev) => ({ ...prev, [name]: text }))}
              onRebuild={vibeOutput}
              onRollback={rollbackOutput}
            />
          )}
        </DetailsDrawer>
      )}
    </>
  );
}

function toneClass(tone) {
  if (tone === 'success') return 'text-success-fg';
  if (tone === 'warning') return 'text-warning-fg';
  if (tone === 'error') return 'text-error-fg';
  if (tone === 'busy') return 'text-db-red-fg';
  return 'text-text-tertiary';
}
