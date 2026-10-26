import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ExternalLink, RefreshCw, Pencil, RotateCcw, Search, Sparkles } from 'lucide-react';
import {
  statusChip, statusReason, nextSpecFrom, retryableOutputs, lostTables, lostTablesText, genieQuestions, appStatusRows, editedNotebook,
  resultTierOptions, runProfileText, versionActive, historyStatus, implementGroups, notebookRunEnded,
} from '../lib/implementWizard';
import { makeApiFetch, makeApiPostJson } from '../lib/apiClient';
import { buildUseCaseList } from '../lib/useCaseList';
import { workspaceNotebookUrl } from '../lib/workspaceLinks';
import ImplementStatusBadge from '../components/ImplementStatusBadge';
import ImplementWizard from './ImplementWizard';

const TABS = ['Progress', 'Results', 'Dashboard', 'Genie', 'App', 'Alert', 'History', 'Edit'];
const TAB_OUTPUT = { Dashboard: 'dashboard', Genie: 'genie_space', App: 'app', Alert: 'alert' };
const NO_RAIL = { latest: [], notebook_run: null, notebook_run_error: '' };

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Implement</h1>
          <p className="text-[12px] text-text-secondary">
            Every use case of this session: what has a PoC or a Genie Code notebook, what is running, and what has not started.
          </p>
        </div>
        <label className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
          <input
            type="search"
            aria-label="Search use cases"
            placeholder="Search by name, id or domain"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72 pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary glow-focus"
          />
        </label>
      </div>
      {listError && <p className="text-xs text-error bg-error-bg border border-error/20 rounded-md px-3 py-2">{listError}</p>}
      {railError && <p className="text-xs text-error bg-error-bg border border-error/20 rounded-md px-3 py-2">{railError}</p>}
      <div className="flex gap-4 items-start">
        <nav aria-label="Use cases" className="w-72 shrink-0 bg-surface border border-border rounded-xl p-3 space-y-4 max-h-[calc(100dvh-11rem)] overflow-y-auto">
          {listLoading && (
            <p className="flex items-center gap-2 text-[12px] text-text-secondary"><Loader2 size={14} className="animate-spin" /> Loading the use cases…</p>
          )}
          {!listLoading && query.trim() && groups.every((group) => group.items.length === 0) && (
            <p className="text-[12px] text-text-secondary">No use case matches &quot;{query.trim()}&quot;.</p>
          )}
          {!listLoading && groups.map((group) => (
            <section key={group.id} aria-label={group.label} className="space-y-1">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">{group.label} ({group.items.length})</h2>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={item.id === shownId ? 'true' : undefined}
                  onClick={() => select(item.id)}
                  className={`w-full text-left rounded-md px-2.5 py-2 text-xs ${item.id === shownId ? 'bg-db-red-50' : 'hover:bg-bg'}`}
                >
                  <div className={`font-medium truncate ${item.id === shownId ? 'text-db-red' : 'text-text-primary'}`}>{item.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] text-text-tertiary">{item.id}</span>
                    <ImplementStatusBadge state={item.state} />
                  </div>
                </button>
              ))}
              {group.items.length === 0 && <p className="text-[11px] text-text-tertiary px-2.5">None</p>}
            </section>
          ))}
        </nav>
        <section aria-label="Use case" className="flex-1 min-w-0 bg-surface border border-border rounded-xl min-h-[24rem]">
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
              onEdit={(focus) => setWizard({ uc: selected.uc, focus })}
            />
          ) : (
            !listLoading && !listError && <p className="p-6 text-[12px] text-text-tertiary">This session has no use cases yet.</p>
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
        />
      )}
    </div>
  );
}

function NotebookPanel({ notebook, notebookPath, databricksHost, notebookRunError }) {
  const href = notebook.state === 'ready' ? workspaceNotebookUrl(databricksHost, notebookPath) : '';
  return (
    <section aria-label="Genie Code notebook" className="mx-5 mt-4 border border-border rounded-md px-3 py-2 text-[12px] space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-text-primary">Genie Code notebook</span>
        <ImplementStatusBadge state={notebook} />
      </div>
      {notebook.reason && <p className={notebook.state === 'failed' ? 'text-error' : 'text-text-secondary'}>{notebook.reason}</p>}
      {notebookRunError && <p className="text-error">{notebookRunError}</p>}
      {notebookPath && <p className="font-mono text-[11px] text-text-secondary break-all">{notebookPath}</p>}
      <div className="flex flex-wrap gap-3">
        {href && (
          <a className="text-db-red inline-flex items-center gap-1" href={href} target="_blank" rel="noreferrer">Open the notebook <ExternalLink size={12} /></a>
        )}
        {notebook.url && (
          <a className="text-db-red inline-flex items-center gap-1" href={notebook.url} target="_blank" rel="noreferrer">Open the notebook run <ExternalLink size={12} /></a>
        )}
      </div>
    </section>
  );
}

function UseCaseDetail({ item, sessionId, settings, qBase, apiFetch, apiPostJson, databricksHost, notebookRunError, refreshKey, onEdit }) {
  const useCaseId = item.id;
  const hasPoc = Boolean(item.latest);
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState('Progress');
  const [results, setResults] = useState({ rows: [], summary: [] });
  const [error, setError] = useState('');
  const [overrides, setOverrides] = useState({});
  const [rerunBusy, setRerunBusy] = useState(false);
  const [rerunError, setRerunError] = useState(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [filters, setFilters] = useState({ tier: '', segment: '' });

  const loadStatus = useCallback(async () => {
    const data = await apiFetch(`/api/inspire/implement/status?${qBase}&use_case_id=${encodeURIComponent(useCaseId)}`);
    setStatus(data);
  }, [apiFetch, qBase, useCaseId]);

  useEffect(() => {
    if (!hasPoc) return undefined;
    loadStatus().catch((e) => setError(e.message));
    const id = setInterval(() => { loadStatus().catch(() => {}); }, 10000);
    return () => clearInterval(id);
  }, [hasPoc, loadStatus, refreshKey]);

  useEffect(() => {
    if (tab !== 'Results' || !hasPoc) return undefined;
    let cancelled = false;
    const shown = new URLSearchParams({ use_case_id: useCaseId, tier: filters.tier, segment: filters.segment });
    apiFetch(`/api/inspire/implement/results?${qBase}&${shown.toString()}`)
      .then((data) => { if (!cancelled) setResults(data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [tab, hasPoc, useCaseId, apiFetch, qBase, filters.tier, filters.segment]);

  const latest = status?.latest;
  const stalled = status?.stalled || null;
  const chip = statusChip(latest?.status, stalled);
  const spec = latest?.spec_json || {};
  const widgets = Array.isArray(status?.rerun_widgets) ? status.rerun_widgets : [];
  const active = versionActive(latest, stalled);
  const missing = lostTables(latest, rerunError);
  const edited = latest?.status === 'failed' ? editedNotebook(latest) : null;
  const reason = missing.length || edited ? '' : statusReason(latest, stalled);
  const tiers = resultTierOptions(results.summary);
  const genie = genieQuestions(latest);
  const genieAsset = latest?.asset_status?.genie_space || {};

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
    if (!latest || active || submitBusy) return;
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
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitBusy(false);
    }
  };

  const toggleSchedule = () => submitNext({ schedule: { ...(spec.schedule || {}), enabled: !spec.schedule?.enabled } });
  const retryOutput = (name) => submitNext({ retry_outputs: [name] });
  const failedOutputs = retryableOutputs(latest);
  const alertAsset = latest?.asset_status?.alert || {};

  const retryBanner = (name) => {
    const failed = failedOutputs.find((o) => o.id === name);
    if (!failed) return null;
    return (
      <div className="border border-error/30 bg-error-bg rounded-md px-3 py-2 text-[12px] space-y-2">
        <p className="text-error">The {failed.label} failed on v{failed.spec_version}: {failed.error || 'no error text was recorded'}</p>
        <button
          type="button"
          disabled={active || submitBusy}
          onClick={() => retryOutput(name)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-db-red disabled:opacity-50"
        >
          {submitBusy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Retry the {failed.label}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary">{item.name}</h2>
          <p className="text-[11px] text-text-secondary">{[item.id, item.domain].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImplementStatusBadge state={item.state} />
          {!hasPoc && (
            <button
              type="button"
              onClick={() => onEdit(null)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red hover:bg-db-red-hover shadow-sm shadow-db-red/20"
            >
              <Sparkles size={13} /> Start Use Case PoC with Genie
            </button>
          )}
        </div>
      </header>
      {item.notebook && (
        <NotebookPanel notebook={item.notebook} notebookPath={item.uc?.notebook_path || ''} databricksHost={databricksHost} notebookRunError={notebookRunError} />
      )}
      {!hasPoc && (
        <p className="px-5 py-4 text-[12px] text-text-tertiary">
          No PoC yet. Start Use Case PoC with Genie builds one, or writes only the Genie Code notebook when you choose Notebook only.
        </p>
      )}
      {hasPoc && (
        <>
          <div role="tablist" aria-label="PoC views" className="flex flex-wrap gap-1 px-4 pt-3 border-b border-border">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
                className={`px-3 py-2 text-xs font-medium ${tab === name ? 'text-db-red border-b-2 border-db-red' : 'text-text-secondary'}`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="p-4 space-y-3">
            {failedOutputs.length > 0 && tab !== 'Edit' && (
              <p className="text-xs text-error bg-error-bg border border-error/20 rounded-md px-3 py-2">
                {failedOutputs.map((o) => `The ${o.label}`).join(', ')} failed.{' '}
                <button type="button" className="underline font-semibold" onClick={() => setTab('Edit')}>Retry on the Edit tab</button>
              </p>
            )}
            {error && <p className="text-xs text-error bg-error-bg border border-error/20 rounded-md px-3 py-2">{error}</p>}
            {missing.length > 0 && (
              <div className="border border-error/30 bg-error-bg rounded-md px-3 py-2 text-[12px] space-y-2">
                <p className="text-error">{lostTablesText(missing)}</p>
                <button
                  type="button"
                  disabled={active}
                  onClick={() => onEdit({ step: 'data', missingTables: missing })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-db-red disabled:opacity-50"
                >
                  <Pencil size={12} /> Edit the Data step
                </button>
              </div>
            )}
            {edited && (
              <div className="border border-error/30 bg-error-bg rounded-md px-3 py-2 text-[12px] space-y-2">
                <p className="text-error">
                  {statusReason(latest) || 'The notebook was edited after Inspire last built it, so this version did not rebuild it.'}
                </p>
                <button
                  type="button"
                  disabled={active || submitBusy}
                  onClick={() => submitNext({ confirm_notebook_overwrite: true })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-db-red disabled:opacity-50"
                >
                  {submitBusy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Rebuild and overwrite the edits
                </button>
              </div>
            )}
            {tab === 'Progress' && (
              <div className="space-y-2">
                <p className={`text-xs font-semibold ${toneClass(chip.tone)}`}>{chip.label}</p>
                {reason && <p className={`text-[12px] ${toneClass(chip.tone)}`}>{reason}</p>}
                {stalled?.run_url && (
                  <a className="text-[12px] text-db-red inline-flex items-center gap-1" href={stalled.run_url} target="_blank" rel="noreferrer">
                    Open the run that stopped <ExternalLink size={12} />
                  </a>
                )}
                {(status?.steps || []).map((s) => (
                  <div key={`${s.step_id}-${s.step_name}`} className="border border-border rounded-md px-3 py-2 text-[12px]">
                    <div className="font-medium">{s.step_name} {s.sub_step_name ? `/ ${s.sub_step_name}` : ''}</div>
                    <div className="text-text-secondary">{s.status} — {s.message}</div>
                  </div>
                ))}
                {(status?.log_lines || []).slice(-40).map((line, i) => (
                  <pre key={i} className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap">{line}</pre>
                ))}
              </div>
            )}
            {tab === 'Results' && results.exists === false && (
              <p className="text-[12px] text-text-tertiary">
                {results.result_table
                  ? `No results yet. The first run creates ${results.result_table} and writes its rows there.`
                  : 'No results yet. Implement this use case to create them.'}
              </p>
            )}
            {tab === 'Results' && results.exists !== false && (
              <div className="overflow-x-auto space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <label className="inline-flex items-center gap-1">
                    Tier
                    <select className="px-2 py-1 border border-border rounded bg-surface" value={filters.tier}
                      onChange={(e) => setFilters((prev) => ({ ...prev, tier: e.target.value }))}>
                      <option value="">All</option>
                      {tiers.map((t) => <option key={t.tier} value={t.tier}>{t.tier} ({t.rows})</option>)}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-1">
                    Segment
                    <select className="px-2 py-1 border border-border rounded bg-surface" value={filters.segment}
                      onChange={(e) => setFilters((prev) => ({ ...prev, segment: e.target.value }))}>
                      <option value="">All</option>
                      {(results.segments || []).map((s) => (
                        <option key={s.segment_or_item} value={s.segment_or_item}>{s.segment_or_item} ({s.rows})</option>
                      ))}
                    </select>
                  </label>
                  <span className="text-text-tertiary">
                    {(results.rows || []).length} row(s) of the latest run{results.result_table ? ` in ${results.result_table}` : ''}
                  </span>
                </div>
                <table className="min-w-full text-[11px]">
                  <thead>
                    <tr>{Object.keys(results.rows[0] || {}).map((c) => <th key={c} className="text-left p-1 border-b border-border">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(results.rows || []).slice(0, 200).map((row, i) => (
                      <tr key={i}>
                        {Object.keys(results.rows[0] || {}).map((c) => <td key={c} className="p-1 border-b border-border/50">{String(row[c] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {results.rows?.length === 0 && <p className="text-[12px] text-text-tertiary">No result rows yet.</p>}
              </div>
            )}
            {TAB_OUTPUT[tab] && retryBanner(TAB_OUTPUT[tab])}
            {tab === 'Dashboard' && (
              latest?.dashboard_url
                ? <a className="text-sm text-db-red inline-flex items-center gap-1" href={latest.dashboard_url} target="_blank" rel="noreferrer">Open dashboard <ExternalLink size={12} /></a>
                : <p className="text-[12px] text-text-tertiary">No dashboard on this version.</p>
            )}
            {tab === 'Genie' && (
              latest?.genie_space_url ? (
                <div className="space-y-2 text-[12px]">
                  <a className="text-sm text-db-red inline-flex items-center gap-1" href={latest.genie_space_url} target="_blank" rel="noreferrer">Open Genie space <ExternalLink size={12} /></a>
                  {genie.questions.length > 0 && (
                    <div>
                      <p className="font-medium">{genie.source === 'space' ? 'Sample questions in the space' : 'Questions you asked for'}</p>
                      <ul className="list-disc pl-5">{genie.questions.map((question, i) => (
                        <li key={question}>
                          <span>{question}</span>
                          {genie.notes[i] && <p className="text-text-tertiary">{genie.notes[i]}</p>}
                        </li>
                      ))}</ul>
                    </div>
                  )}
                  {genieAsset.check_question && <p>Inspire checked the space with: {genieAsset.check_question}</p>}
                  {genieAsset.check_sql && <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap border border-border rounded p-2">{genieAsset.check_sql}</pre>}
                </div>
              ) : <p className="text-[12px] text-text-tertiary">No Genie space on this version.</p>
            )}
            {tab === 'App' && (
              latest?.app_url ? (
                <div className="space-y-2 text-[12px]">
                  <a className="text-sm text-db-red inline-flex items-center gap-1" href={latest.app_url} target="_blank" rel="noreferrer">Open App <ExternalLink size={12} /></a>
                  <table className="text-[12px]">
                    <tbody>
                      {appStatusRows(status?.app_status, latest?.asset_status?.app).map(([label, value]) => (
                        <tr key={label}><td className="pr-3 py-0.5 text-text-tertiary">{label}</td><td>{value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-[12px] text-text-tertiary">No App on this version.</p>
            )}
            {tab === 'Alert' && (
              latest?.alert_url ? (
                <div className="space-y-2 text-[12px]">
                  <a className="text-sm text-db-red inline-flex items-center gap-1" href={latest.alert_url} target="_blank" rel="noreferrer">Open alert <ExternalLink size={12} /></a>
                  <p>Fires when: {alertAsset.trigger || '—'}</p>
                  {alertAsset.condition_sql && <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap border border-border rounded p-2">{alertAsset.condition_sql}</pre>}
                  <p>Notifies: {spec.outputs?.alert_recipients?.join(', ') || 'no email recipients'}
                    {(spec.outputs?.alert_destinations || []).length ? `; ${spec.outputs.alert_destinations.map((d) => d.name || d.id).join(', ')}` : ''}
                  </p>
                  <p>Subscribers on the job task: {alertAsset.subscribers ?? '—'}</p>
                  <p>Last check: {alertAsset.check_state || '—'}</p>
                  <p className="text-text-tertiary">It runs after each scheduled or full run of the job and notifies once per run, only when the condition holds. Preview re-runs never send it.</p>
                </div>
              ) : <p className="text-[12px] text-text-tertiary">No alert on this version.</p>
            )}
            {tab === 'History' && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Spec versions</div>
                {(status?.history || []).map((row) => (
                  <div key={row.spec_version} className="border border-border rounded-md px-3 py-2 text-[12px]">
                    <div>v{row.spec_version} · {historyStatus(row, latest, stalled)} · {row.change_classes || 'initial'}</div>
                    <div className="text-text-tertiary">{row.created_by} · {row.updated_at}</div>
                  </div>
                ))}
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary pt-2">Job runs</div>
                {status?.runs?.ok === false && <p className="text-[12px] text-error">{status.runs.error}</p>}
                {(status?.runs?.runs || []).map((run) => (
                  <div key={run.run_id} className="border border-border rounded-md px-3 py-2 text-[12px]">
                    <div>{run.state || 'unknown'} · {runProfileText(run.profile)} · {run.trigger === 'PERIODIC' ? 'scheduled' : 'started by hand'}</div>
                    <div className="text-text-tertiary">
                      {run.started} · {run.duration_s}s
                      {run.url && <> · <a className="text-db-red" href={run.url} target="_blank" rel="noreferrer">Open run</a></>}
                    </div>
                    {run.message && <div className="text-text-secondary">{run.message}</div>}
                  </div>
                ))}
                {status?.runs?.ok && status.runs.runs.length === 0 && <p className="text-[12px] text-text-tertiary">No job runs yet.</p>}
                {!status?.runs && <p className="text-[12px] text-text-tertiary">This use case has no job yet.</p>}
              </div>
            )}
            {tab === 'Edit' && (
              <section aria-label="Edit the PoC" className="max-w-sm space-y-3">
                <button
                  type="button"
                  disabled={active}
                  onClick={() => onEdit(null)}
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-border disabled:opacity-50"
                >
                  <Pencil size={12} /> {active ? 'Edit applies after this run' : 'Edit the PoC'}
                </button>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary mb-1">Quick re-run</div>
                  {widgets.map((w) => (
                    <label key={w.name} className="block text-[11px] mb-1">
                      {w.label || w.name}
                      {Array.isArray(w.choices) && w.choices.length > 0 ? (
                        <select
                          className="mt-0.5 w-full px-2 py-1 border border-border rounded bg-surface"
                          value={overrides[w.name] ?? ''}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [w.name]: e.target.value }))}
                        >
                          <option value="">{w.default ? `Keep ${w.default}` : 'Keep the job value'}</option>
                          {w.choices.map((choice) => <option key={String(choice)} value={String(choice)}>{String(choice)}</option>)}
                        </select>
                      ) : (
                        <input
                          className="mt-0.5 w-full px-2 py-1 border border-border rounded bg-surface"
                          value={overrides[w.name] ?? ''}
                          placeholder={w.default == null ? '' : String(w.default)}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [w.name]: e.target.value }))}
                        />
                      )}
                      {w.allowed && <span className="block text-[10px] text-text-tertiary">{w.allowed}</span>}
                    </label>
                  ))}
                  {widgets.length === 0 && <p className="text-[11px] text-text-tertiary">No widgets to change; the re-run uses the job's values.</p>}
                  <p className="text-[10px] text-text-tertiary">A preview of the notebook only. Blank fields keep the job's values, and the alert never fires on a preview.</p>
                  <button
                    type="button"
                    disabled={rerunBusy || !latest?.job_id}
                    onClick={rerun}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-db-red disabled:opacity-50"
                  >
                    {rerunBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Preview re-run
                  </button>
                </div>
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={!!spec.schedule?.enabled} disabled={active || !latest || submitBusy} onChange={toggleSchedule} />
                  Schedule on
                </label>
                {failedOutputs.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Failed outputs</div>
                    {failedOutputs.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={active || submitBusy}
                        onClick={() => retryOutput(o.id)}
                        title={o.error}
                        className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-error/40 text-error disabled:opacity-50"
                      >
                        <RotateCcw size={12} /> Retry the {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function toneClass(tone) {
  if (tone === 'success') return 'text-success';
  if (tone === 'warning') return 'text-warning';
  if (tone === 'error') return 'text-error';
  if (tone === 'busy') return 'text-db-red';
  return 'text-text-tertiary';
}
