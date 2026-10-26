import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X, ExternalLink, RefreshCw, Pencil, RotateCcw } from 'lucide-react';
import {
  statusChip, statusReason, caseIdOf, caseNameOf, nextSpecFrom, retryableOutputs, lostTables, lostTablesText, genieQuestions, appStatusRows, editedNotebook,
  resultTierOptions, runProfileText, versionActive, historyStatus,
} from '../lib/implementWizard';
import BodyPortal from '../components/BodyPortal';

const TABS = ['Progress', 'Results', 'Dashboard', 'Genie', 'App', 'Alert', 'History'];
const TAB_OUTPUT = { Dashboard: 'dashboard', Genie: 'genie_space', App: 'app', Alert: 'alert' };

export default function UseCaseStudio({
  sessionId,
  settings,
  useCaseId,
  useCases = [],
  apiFetch,
  apiPostJson,
  onClose,
  onEdit,
  onOpenUseCase,
}) {
  const [historyRows, setHistoryRows] = useState([]);
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState('Progress');
  const [results, setResults] = useState({ rows: [], summary: [] });
  const [error, setError] = useState('');
  const [overrides, setOverrides] = useState({});
  const [rerunBusy, setRerunBusy] = useState(false);
  const [rerunError, setRerunError] = useState(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [filters, setFilters] = useState({ tier: '', segment: '' });

  const qBase = useMemo(() => {
    const p = new URLSearchParams({
      inspire_database: settings.inspireDatabase,
      warehouse_id: settings.warehouseId,
      session_id: String(sessionId),
    });
    return p.toString();
  }, [settings.inspireDatabase, settings.warehouseId, sessionId]);

  const loadRail = useCallback(async () => {
    const data = await apiFetch(`/api/inspire/implement/history?${qBase}`);
    setHistoryRows(data.latest || []);
  }, [apiFetch, qBase]);

  const loadStatus = useCallback(async () => {
    if (!useCaseId) return;
    const data = await apiFetch(`/api/inspire/implement/status?${qBase}&use_case_id=${encodeURIComponent(useCaseId)}`);
    setStatus(data);
  }, [apiFetch, qBase, useCaseId]);

  useEffect(() => {
    loadRail().catch((e) => setError(e.message));
  }, [loadRail]);

  useEffect(() => {
    setOverrides({});
    setFilters({ tier: '', segment: '' });
    setRerunError(null);
    setError('');
  }, [useCaseId]);

  useEffect(() => {
    loadStatus().catch((e) => setError(e.message));
    const id = setInterval(() => {
      loadStatus().catch(() => {});
      loadRail().catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [loadStatus, loadRail]);

  useEffect(() => {
    if (tab !== 'Results' || !useCaseId) return undefined;
    let cancelled = false;
    const shown = new URLSearchParams({ use_case_id: useCaseId, tier: filters.tier, segment: filters.segment });
    apiFetch(`/api/inspire/implement/results?${qBase}&${shown.toString()}`)
      .then((data) => { if (!cancelled) setResults(data); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [tab, useCaseId, apiFetch, qBase, filters.tier, filters.segment]);

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

  const names = Object.fromEntries(useCases.map((uc) => [caseIdOf(uc), caseNameOf(uc) || caseIdOf(uc)]));

  return (
    <BodyPortal>
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" data-studio-overlay="">
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface">
        <div>
          <h2 className="text-sm font-semibold">Use Case Studio</h2>
          <p className="text-[11px] text-text-secondary">{names[useCaseId] || useCaseId}</p>
        </div>
        <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary" aria-label="Close">
          <X size={16} />
        </button>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-56 shrink-0 border-r border-border overflow-y-auto p-3 space-y-1">
          {historyRows.map((row) => {
            const c = statusChip(row.status, row.stalled);
            return (
              <button
                key={row.use_case_id}
                type="button"
                onClick={() => onOpenUseCase(row.use_case_id)}
                className={`w-full text-left rounded-md px-2.5 py-2 text-xs ${row.use_case_id === useCaseId ? 'bg-db-red-50 text-db-red' : 'text-text-primary hover:bg-bg'}`}
              >
                <div className="font-medium truncate">{names[row.use_case_id] || row.use_case_id}</div>
                <div className={`mt-0.5 text-[10px] uppercase tracking-wide ${toneClass(c.tone)}`}>{c.label}</div>
              </button>
            );
          })}
          {historyRows.length === 0 && <p className="text-[11px] text-text-tertiary">No implementations yet.</p>}
        </aside>
        <section className="flex-1 min-w-0 flex flex-col">
          <div className="flex gap-1 px-4 pt-3 border-b border-border">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setTab(name)}
                className={`px-3 py-2 text-xs font-medium ${tab === name ? 'text-db-red border-b-2 border-db-red' : 'text-text-secondary'}`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {error && <p className="text-xs text-error bg-error-bg border border-error/20 rounded-md px-3 py-2">{error}</p>}
            {missing.length > 0 && (
              <div className="border border-error/30 bg-error-bg rounded-md px-3 py-2 text-[12px] space-y-2">
                <p className="text-error">{lostTablesText(missing)}</p>
                <button
                  type="button"
                  disabled={active}
                  onClick={() => onEdit(useCaseId, { step: 'data', missingTables: missing })}
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
          </div>
        </section>
        <aside className="w-64 shrink-0 border-l border-border p-4 space-y-3 overflow-y-auto">
          <button
            type="button"
            disabled={active}
            onClick={() => onEdit(useCaseId)}
            className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-border disabled:opacity-50"
          >
            <Pencil size={12} /> {active ? 'Edit applies after this run' : 'Edit'}
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
        </aside>
      </div>
    </div>
    </BodyPortal>
  );
}

function toneClass(tone) {
  if (tone === 'success') return 'text-success';
  if (tone === 'warning') return 'text-warning';
  if (tone === 'error') return 'text-error';
  if (tone === 'busy') return 'text-db-red';
  return 'text-text-tertiary';
}
