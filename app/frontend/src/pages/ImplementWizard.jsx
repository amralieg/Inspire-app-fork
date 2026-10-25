import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X, ChevronLeft, ChevronRight, LayoutDashboard, Sparkles, AppWindow, Bell } from 'lucide-react';
import {
  IMPLEMENT_STEPS,
  IMPLEMENT_OUTPUTS,
  ALERT_TIER_OPTIONS,
  ALERT_OPERATORS,
  defaultSpecFromUseCase,
  specFromLatest,
  tablesOf,
  primaryTableOf,
  removeTable,
  restoreTable,
  removalBlocker,
  filterValues,
  setFilterValues,
  readinessScope,
  planLines,
  editedNotebook,
  tableOfRef as refTable,
  columnOfRef as refColumn,
  VALUE_LIMIT,
  guessColumnRole,
  defaultAlertRecipients,
  withDecisionOwner,
  cronInWords,
  cronProblem,
  alertTriggerText,
  stepErrors,
  widgetValueProblem,
  profileFieldProblem,
  initialStepIndex,
  lostTablesText,
  profileEstimate,
  costHint,
  PREFLIGHT_LABELS,
  PROFILE_FIELDS,
  APP_NAME_RE,
} from '../lib/implementWizard';

const ICONS = { dashboard: LayoutDashboard, genie_space: Sparkles, app: AppWindow, alert: Bell };
const NO_WIDGET_GROUPS = { business: [], model: [], ai: [], extras: [], extras_kept_default: [] };
const COLUMN_ROLES = ['entity_id', 'event_date', 'measure', 'label', 'segment'];
const ALL_FEATURES = { apps: true, genie_spaces: true, alerts: true };

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-2.5 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus';

function ProfileInput({ spec, path, onChange }) {
  const [section, name] = path.split('.');
  const value = spec.config.profiles[section]?.[name] ?? '';
  const problem = profileFieldProblem(path, value);
  return (
    <Field label={`${PROFILE_FIELDS[path].label} (${PROFILE_FIELDS[path].allowed})`}>
      <input className={inputCls} value={value} onChange={(e) => onChange(section, { ...spec.config.profiles[section], [name]: e.target.value })} />
      {problem && <p className="text-[11px] text-error">{problem}</p>}
    </Field>
  );
}

function WidgetInput({ widget, value, endpoints, onChange }) {
  const problem = value === undefined ? '' : widgetValueProblem(widget.name, value, widget.allowed);
  const allowed = widget.allowed || (widget.type === 'dropdown' ? 'one of the listed choices' : 'any value');
  let input;
  if (widget.name === 'ai_endpoint') {
    input = (
      <select className={inputCls} value={value ?? widget.default ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value={widget.default || ''}>{widget.default || 'Pick an endpoint'}</option>
        {endpoints.filter((e) => e.name !== widget.default).map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
      </select>
    );
  } else if (widget.type === 'dropdown' && (widget.choices || []).length) {
    input = (
      <select className={inputCls} value={value ?? widget.default ?? ''} onChange={(e) => onChange(e.target.value === widget.default ? '' : e.target.value)}>
        {widget.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
      </select>
    );
  } else {
    input = <input className={inputCls} value={value ?? ''} placeholder={widget.default ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-mono text-[11px] text-text-primary">{widget.name}</span>
        <span className="text-[10px] text-text-tertiary">
          default {widget.default === '' || widget.default == null ? 'empty' : widget.default} · allowed {allowed}
        </span>
      </div>
      {input}
      {widget.label && <p className="text-[11px] text-text-secondary">Used for: {widget.label}</p>}
      {problem && <p className="text-[11px] text-error">{problem}</p>}
    </div>
  );
}

export default function ImplementWizard({
  uc,
  sessionId,
  settings,
  discoveryType,
  apiFetch,
  apiPostJson,
  onClose,
  onImplemented,
  focus = null,
}) {
  const warehouseId = settings.warehouseId;
  const inspireDatabase = settings.inspireDatabase;
  const [step, setStep] = useState(() => initialStepIndex(focus));
  const [spec, setSpec] = useState(() => defaultSpecFromUseCase(uc, { warehouseId, inspireDatabase }));
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [columnsByTable, setColumnsByTable] = useState({});
  const [confirmedRoles, setConfirmedRoles] = useState({});
  const [preflight, setPreflight] = useState(null);
  const [outputCheck, setOutputCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState('');
  const [notice, setNotice] = useState(() => lostTablesText(focus?.missingTables));
  const lostReason = (table) => (focus?.missingTables || []).find((m) => String(m.table).toLowerCase() === table.toLowerCase())?.reason;
  const [excludeRef, setExcludeRef] = useState('');
  const [swaps, setSwaps] = useState({});
  const [values, setValues] = useState({});
  const [readiness, setReadiness] = useState(null);
  const [principalQ, setPrincipalQ] = useState('');
  const [principals, setPrincipals] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [destinations, setDestinations] = useState(null);
  const [destinationsError, setDestinationsError] = useState('');

  const q = useMemo(() => {
    const p = new URLSearchParams({
      inspire_database: inspireDatabase,
      warehouse_id: warehouseId,
      session_id: String(sessionId),
      use_case_id: spec.use_case_id,
    });
    return p.toString();
  }, [inspireDatabase, warehouseId, sessionId, spec.use_case_id]);

  const patch = (path, value) => {
    setSpec((prev) => {
      const next = { ...prev };
      const parts = path.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        cur[key] = Array.isArray(cur[key]) ? [...cur[key]] : { ...(cur[key] || {}) };
        cur = cur[key];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/inspire/implement/context?${q}`);
        if (cancelled) return;
        setContext(data);
        const fallback = defaultSpecFromUseCase(data.use_case || uc, {
          warehouseId,
          inspireDatabase,
          owner: data.me?.username,
        });
        const next = specFromLatest(data.latest, fallback);
        if (!next.config.warehouse_id) next.config.warehouse_id = warehouseId;
        setSpec(next);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const ucRow = context?.use_case || uc;
  const notebookEdit = editedNotebook(context?.latest);
  const trainsModel = context?.trains_model !== false;
  const removedTables = spec.data.removed_tables || [];
  const isRemoved = (table) => removedTables.some((r) => r.toLowerCase() === table.toLowerCase());
  const sourceTables = useMemo(() => {
    const removed = spec.data.removed_tables || [];
    return tablesOf(ucRow)
      .filter((t) => !removed.some((r) => r.toLowerCase() === t.toLowerCase()))
      .map((t) => spec.data.tables[t] || t);
  }, [ucRow, spec.data.tables, spec.data.removed_tables]);

  const loadColumns = useCallback(async (table) => {
    if (!table || columnsByTable[table]) return;
    try {
      const data = await apiFetch(`/api/inspire/implement/columns?${q}&table=${encodeURIComponent(table)}`);
      setColumnsByTable((prev) => ({ ...prev, [table]: data.columns || [] }));
      setSpec((prev) => {
        const roles = { ...prev.data.column_roles };
        for (const col of data.columns || []) {
          const guess = guessColumnRole(col.column_name);
          if (guess === 'label' && !trainsModel) continue;
          if (guess && !Object.values(roles).some((v) => String(v).endsWith(`.${col.column_name}`))) {
            if (!roles[guess]) roles[guess] = `${table}.${col.column_name}`;
          }
        }
        return { ...prev, data: { ...prev.data, column_roles: roles } };
      });
    } catch (e) {
      setError(e.message);
    }
  }, [apiFetch, q, columnsByTable, trainsModel]);

  useEffect(() => {
    if (!context) return;
    sourceTables.forEach((t) => { loadColumns(t); });
  }, [context, sourceTables.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = context?.widget_groups || NO_WIDGET_GROUPS;
  const segmentRef = spec.data.column_roles.segment || '';
  const exclusionRefs = (spec.data.filters || []).filter((f) => f.op === 'not in').map((f) => `${f.table}.${f.column}`);
  const unconfirmedRoles = Object.entries(spec.data.column_roles)
    .filter(([role, ref]) => ref && !confirmedRoles[role] && guessColumnRole(String(ref).split('.').pop()) !== role)
    .map(([role]) => role);

  const currentErrors = stepErrors(IMPLEMENT_STEPS[step].id, spec, { unconfirmedRoles, widgets: context?.widgets || [], trainsModel });
  const primaryOriginal = primaryTableOf(ucRow);
  const primaryChosen = spec.data.tables[primaryOriginal] || primaryOriginal;
  const eventRef = spec.data.column_roles.event_date || '';
  const estimate = (windowDays, extra = {}) => profileEstimate({
    evidence: context?.evidence,
    table: primaryChosen,
    dateColumn: eventRef && refTable(eventRef).toLowerCase() === primaryChosen.toLowerCase() ? refColumn(eventRef) : '',
    windowDays,
    dataWindow: spec.data.window,
    discoveryType,
    ...extra,
  }).text;

  const setProfile = (section, value) => patch(`config.profiles.${section}`, value);

  const setWidget = (name, value) => setSpec((prev) => {
    const widgets = { ...prev.config.widgets };
    if (value === '') delete widgets[name];
    else widgets[name] = value;
    const config = { ...prev.config, widgets };
    if (name === 'ai_endpoint') config.ai_endpoint = value;
    return { ...prev, config };
  });

  const goNext = async () => {
    setError('');
    if (currentErrors.length) {
      setError(currentErrors.join('; '));
      return;
    }
    if (IMPLEMENT_STEPS[step].id === 'data') {
      try {
        const check = await apiFetch(`/api/inspire/implement/output-check?${q}&table=${encodeURIComponent(spec.config.result_table)}`);
        setOutputCheck(check);
        if (!check.ok) {
          setError(check.write?.ok ? check.safety?.detail : check.write?.detail);
          return;
        }
      } catch (e) {
        setError(e.message);
        return;
      }
    }
    if (IMPLEMENT_STEPS[step].id === 'data' && discoveryType && discoveryType !== 'Standard') {
      try {
        const scope = readinessScope(spec, ucRow);
        if (scope.table) {
          const data = await apiPostJson(`/api/inspire/implement/readiness?${q}`, {
            table: scope.table,
            discovery_type: discoveryType,
            columns: scope.columns,
            filters: scope.filters,
            window: scope.window,
          });
          setReadiness(data);
        }
      } catch (e) {
        setError(e.message);
        return;
      }
    }
    if (IMPLEMENT_STEPS[step].id === 'use_it') {
      try {
        const checks = new URLSearchParams({
          result_table: spec.config.result_table,
          app_name: spec.outputs.app ? spec.outputs.app_name : '',
          alert: spec.outputs.alert ? '1' : '0',
          genie: spec.outputs.genie_space ? '1' : '0',
          share: (spec.sharing.principals || []).length ? '1' : '0',
          principals: JSON.stringify((spec.sharing.principals || []).map((p) => p.name)),
        });
        const data = await apiFetch(`/api/inspire/implement/preflight?${q}&${checks.toString()}`);
        setPreflight(data);
      } catch (e) {
        setError(e.message);
        return;
      }
      setPlan(null);
      setPlanError('');
      try {
        setPlan(await apiPostJson('/api/inspire/implement/plan', {
          inspire_database: inspireDatabase,
          warehouse_id: warehouseId,
          session_id: String(sessionId),
          spec,
        }));
      } catch (e) {
        setPlanError(e.message);
      }
    }
    setStep((s) => Math.min(IMPLEMENT_STEPS.length - 1, s + 1));
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiPostJson('/api/inspire/implement/submit', {
        inspire_database: inspireDatabase,
        warehouse_id: warehouseId,
        session_id: String(sessionId),
        notebook_path: settings.notebookPath,
        spec,
      });
      onImplemented(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const loadSwaps = async (table) => {
    try {
      const data = await apiPostJson(`/api/inspire/implement/swaps?${q}`, { table, required_columns: [] });
      setSwaps((prev) => ({ ...prev, [table]: data.swaps || [] }));
    } catch (e) {
      setError(e.message);
    }
  };

  const loadValues = async (table, column) => {
    const key = `${table}.${column}`;
    if (values[key]) return;
    try {
      const data = await apiFetch(`/api/inspire/implement/values?${q}&table=${encodeURIComponent(table)}&column=${encodeURIComponent(column)}&limit=${VALUE_LIMIT}`);
      setValues((prev) => ({ ...prev, [key]: data.values || [] }));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (step !== 2) return undefined;
    let cancelled = false;
    apiFetch(`/api/inspire/implement/serving-endpoints?${q}`)
      .then((data) => { if (!cancelled) setEndpoints(data.endpoints || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [step, apiFetch, q]);

  useEffect(() => {
    if (IMPLEMENT_STEPS[step].id !== 'use_it' || !spec.outputs.alert || destinations !== null) return undefined;
    let cancelled = false;
    apiFetch('/api/inspire/implement/destinations')
      .then((data) => { if (!cancelled) setDestinations(data.destinations || []); })
      .catch((e) => {
        if (cancelled) return;
        setDestinations([]);
        setDestinationsError(e.message);
      });
    return () => { cancelled = true; };
  }, [step, spec.outputs.alert, destinations, apiFetch]);

  useEffect(() => {
    if (principalQ.length < 2) {
      setPrincipals([]);
      return undefined;
    }
    const t = setTimeout(() => {
      apiFetch(`/api/inspire/implement/principals?${q}&q=${encodeURIComponent(principalQ)}`)
        .then((data) => setPrincipals(data.principals || []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [principalQ, apiFetch, q]);

  if (loading) {
    return (
      <Overlay onClose={onClose}>
        <div className="flex items-center gap-2 p-8 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Loading the use case…
        </div>
      </Overlay>
    );
  }

  const features = preflight?.features || context?.features || ALL_FEATURES;
  const chosenDestinations = spec.outputs.alert_destinations || [];

  return (
    <Overlay onClose={onClose}>
      <div className="flex h-full min-h-[70vh]">
        <aside className="w-48 shrink-0 border-r border-border bg-panel p-4 space-y-1">
          {IMPLEMENT_STEPS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-current={i === step ? 'step' : undefined}
              onClick={() => i <= step && setStep(i)}
              className={`w-full text-left px-2.5 py-2 rounded-md text-xs font-medium ${i === step ? 'bg-db-red-50 text-db-red' : i < step ? 'text-text-primary' : 'text-text-tertiary'}`}
            >
              <span className="font-mono mr-1">{String(i + 1).padStart(2, '0')}</span>
              {item.label}
            </button>
          ))}
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Implement with Genie</h2>
              <p className="text-[11px] text-text-secondary">{spec.use_case_name || spec.use_case_id}</p>
            </div>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary" aria-label="Close">
              <X size={16} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && <p className="text-xs text-error bg-error-bg border border-error/20 rounded-md px-3 py-2">{error}</p>}

            {IMPLEMENT_STEPS[step].id === 'use_case' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  {[
                    ['Decision', ucRow.statement || ucRow.Statement],
                    ['Beneficiary', ucRow.beneficiary || ucRow.Beneficiary],
                    ['Sponsor', ucRow.sponsor || ucRow.Sponsor],
                    ['Technique', ucRow.analytics_technique || ucRow.Technique],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-bg border border-border rounded-lg p-3">
                      <div className="text-[9px] uppercase tracking-[0.18em] font-bold text-text-tertiary">{label}</div>
                      <div className="mt-1 text-text-secondary">{val || '—'}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-text-tertiary">
                  {discoveryType === 'Deep'
                    ? 'Deep discovery: row counts are checked on the Data step.'
                    : 'metadata only, readiness checked at preview run'}
                </p>
                <Field label="Goal sentence">
                  <textarea className={inputCls} rows={3} value={spec.use_case.goal} onChange={(e) => patch('use_case.goal', e.target.value)} />
                </Field>
                <Field label="Decision owner">
                  <input className={inputCls} value={spec.use_case.decision_owner} onChange={(e) => { const owner = e.target.value; setSpec((prev) => withDecisionOwner(prev, owner)); }} />
                </Field>
                {[0, 1, 2].map((i) => (
                  <Field key={i} label={i === 0 ? 'Success measures' : `Measure ${i + 1} (optional)`}>
                    <input
                      className={inputCls}
                      value={spec.use_case.success_measures[i] || ''}
                      onChange={(e) => {
                        const next = [...spec.use_case.success_measures];
                        next[i] = e.target.value;
                        patch('use_case.success_measures', next.filter((m, idx) => m || idx < i));
                      }}
                    />
                  </Field>
                ))}
              </div>
            )}

            {IMPLEMENT_STEPS[step].id === 'data' && (
              <div className="space-y-3">
                {notice && <p className="text-[11px] text-text-secondary bg-bg border border-border rounded-md px-3 py-2">{notice}</p>}
                {tablesOf(ucRow).map((original) => {
                  const chosen = spec.data.tables[original] || original;
                  const removed = isRemoved(original);
                  const blocker = removalBlocker(ucRow, spec, original);
                  const primary = original.toLowerCase() === primaryTableOf(ucRow).toLowerCase();
                  const lost = removed ? '' : lostReason(chosen);
                  return (
                    <div key={original} className={`border rounded-lg p-3 space-y-2 ${lost ? 'border-error/50' : 'border-border'} ${removed ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-mono text-[11px] text-text-primary ${removed ? 'line-through' : ''}`}>
                          {chosen}
                          {primary && <span className="ml-2 not-italic font-sans text-[9px] uppercase tracking-[0.18em] text-text-tertiary">Primary</span>}
                          {lost && <span className="ml-2 not-italic font-sans text-[9px] uppercase tracking-[0.18em] text-error">{lost}</span>}
                        </span>
                        {removed ? (
                          <button type="button" className="text-[11px] text-db-red" onClick={() => { setSpec((prev) => restoreTable(prev, original)); setNotice(''); }}>
                            Restore
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button type="button" className="text-[11px] text-db-red" onClick={() => loadSwaps(original)}>Swap</button>
                            <button
                              type="button"
                              className="text-[11px] text-text-secondary"
                              onClick={() => patch('data.tables', { ...spec.data.tables, [original]: original })}
                            >
                              Keep
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-text-secondary disabled:opacity-40"
                              disabled={Boolean(blocker)}
                              title={blocker || 'Genie builds the notebook without this table'}
                              onClick={() => {
                                const { spec: next, cleared } = removeTable(spec, original);
                                setSpec(next);
                                const parts = [];
                                if (cleared.roles.length) parts.push(`its column roles (${cleared.roles.map((r) => r.replace('_', ' ')).join(', ')})`);
                                if (cleared.filters) parts.push(`${cleared.filters} filter(s) on it`);
                                setNotice(parts.length ? `Removed ${original} and cleared ${parts.join(' and ')}.` : `Removed ${original}.`);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                      {!removed && (swaps[original] || []).map((s) => (
                        <button
                          key={s.table}
                          type="button"
                          className="block text-[11px] font-mono text-text-secondary hover:text-db-red"
                          onClick={() => patch('data.tables', { ...spec.data.tables, [original]: s.table })}
                        >
                          {s.table} ({s.matched}/{s.total} columns)
                        </button>
                      ))}
                    </div>
                  );
                })}
                <div className="grid grid-cols-2 gap-2">
                  {COLUMN_ROLES.filter((role) => trainsModel || role !== 'label').map((role) => (
                    <Field key={role} label={role.replace('_', ' ')}>
                      <select
                        className={inputCls}
                        value={spec.data.column_roles[role] || ''}
                        onChange={(e) => {
                          patch('data.column_roles', { ...spec.data.column_roles, [role]: e.target.value });
                          setConfirmedRoles((prev) => ({ ...prev, [role]: true }));
                        }}
                      >
                        <option value="">Not mapped</option>
                        {sourceTables.flatMap((table) => (columnsByTable[table] || []).map((c) => (
                          <option key={`${table}.${c.column_name}`} value={`${table}.${c.column_name}`}>
                            {table}.{c.column_name}
                          </option>
                        )))}
                      </select>
                    </Field>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Window start">
                    <input type="date" className={inputCls} value={spec.data.window.start} onChange={(e) => patch('data.window', { ...spec.data.window, start: e.target.value })} />
                  </Field>
                  <Field label="Window end">
                    <input type="date" className={inputCls} value={spec.data.window.end} onChange={(e) => patch('data.window', { ...spec.data.window, end: e.target.value })} />
                  </Field>
                </div>
                {segmentRef && (
                  <ValuePicker
                    label={`Segment filter (optional): keep only these ${segmentRef}`}
                    values={values[segmentRef]}
                    selected={filterValues(spec, refTable(segmentRef), refColumn(segmentRef), 'in')}
                    onLoad={() => loadValues(refTable(segmentRef), refColumn(segmentRef))}
                    onChange={(picked) => setSpec((prev) => setFilterValues(prev, refTable(segmentRef), refColumn(segmentRef), 'in', picked))}
                  />
                )}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Exclusions (optional)</span>
                  <div className="flex gap-2">
                    <select className={inputCls} value={excludeRef} onChange={(e) => setExcludeRef(e.target.value)}>
                      <option value="">Pick a column to exclude values from</option>
                      {sourceTables.flatMap((table) => (columnsByTable[table] || []).map((c) => (
                        <option key={`${table}.${c.column_name}`} value={`${table}.${c.column_name}`}>{table}.{c.column_name}</option>
                      )))}
                    </select>
                  </div>
                  {[...new Set([excludeRef, ...exclusionRefs].filter(Boolean))].map((ref) => (
                    <ValuePicker
                      key={ref}
                      label={`Leave out these ${ref}`}
                      values={values[ref]}
                      selected={filterValues(spec, refTable(ref), refColumn(ref), 'not in')}
                      onLoad={() => loadValues(refTable(ref), refColumn(ref))}
                      onChange={(picked) => setSpec((prev) => setFilterValues(prev, refTable(ref), refColumn(ref), 'not in', picked))}
                    />
                  ))}
                </div>
                <Field label="Output table">
                  <input className={inputCls} value={spec.config.result_table} onChange={(e) => { patch('config.result_table', e.target.value); setOutputCheck(null); }} />
                  {outputCheck ? (
                    <div className="text-[11px] space-y-0.5">
                      <p className={outputCheck.write?.ok ? 'text-success' : 'text-error'}>{outputCheck.write?.detail}</p>
                      {outputCheck.write?.ok && <p className={outputCheck.safety?.ok ? 'text-success' : 'text-error'}>{outputCheck.safety?.detail}</p>}
                      {outputCheck.write?.ok && outputCheck.safety?.ok && (
                        <p className="text-text-tertiary">Sharing: {outputCheck.grant?.detail}</p>
                      )}
                      {outputCheck.identity && <p className="text-text-tertiary">Checked live as {outputCheck.identity}.</p>}
                    </div>
                  ) : (
                    <p className="text-[11px] text-text-tertiary">Next checks live that you can create or write this table. Inspire writes only here.</p>
                  )}
                </Field>
                {readiness && !readiness.skipped && (
                  <p className="text-[11px] text-text-secondary">Preview window: {readiness.row_count} rows</p>
                )}
                {discoveryType === 'Standard' && (
                  <p className="text-[11px] text-text-tertiary">metadata only, readiness checked at preview run</p>
                )}
              </div>
            )}

            {IMPLEMENT_STEPS[step].id === 'configure' && (
              <div className="space-y-4">
                {[['Business rules', groups.business], ['Model', groups.model], ['AI', groups.ai], ['Use-case extras', groups.extras]].map(([label, list]) => (
                  <div key={label} className="space-y-3">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">{label}</h3>
                    {(list || []).length === 0 && <p className="text-[11px] text-text-tertiary">None on this instruction yet. Genie will fill them on the first build.</p>}
                    {(list || []).map((w) => (
                      <WidgetInput
                        key={w.name}
                        widget={w}
                        value={spec.config.widgets[w.name] ?? (w.name === 'ai_endpoint' && spec.config.ai_endpoint ? spec.config.ai_endpoint : undefined)}
                        endpoints={endpoints}
                        onChange={(value) => setWidget(w.name, value)}
                      />
                    ))}
                    {label === 'Use-case extras' && (groups.extras_kept_default || []).length > 0 && (
                      <p className="text-[11px] text-text-tertiary">
                        {groups.extras_kept_default.length} more widget(s) keep their defaults here: {groups.extras_kept_default.join(', ')}. Change them in the notebook if needed.
                      </p>
                    )}
                  </div>
                ))}
                <Field label="SQL warehouse id">
                  <input className={inputCls} value={spec.config.warehouse_id} onChange={(e) => patch('config.warehouse_id', e.target.value)} />
                </Field>
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Run profiles</h3>
                  <div className="space-y-1">
                    <ProfileInput spec={spec} path="preview.entity_cap" onChange={setProfile} />
                    <p className="text-[11px] text-text-tertiary">Preview reads {estimate(spec.config.profiles.full_load.window_days, { entityCap: spec.config.profiles.preview.entity_cap })}.</p>
                  </div>
                  {trainsModel && (
                    <div className="space-y-1">
                      <div className="grid grid-cols-2 gap-2">
                        <ProfileInput spec={spec} path="training.window_days" onChange={setProfile} />
                        <ProfileInput spec={spec} path="training.sample_entities" onChange={setProfile} />
                      </div>
                      <p className="text-[11px] text-text-tertiary">Training reads {estimate(spec.config.profiles.training.window_days, { sampleEntities: spec.config.profiles.training.sample_entities })}.</p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <ProfileInput spec={spec} path="full_load.window_days" onChange={setProfile} />
                    <p className="text-[11px] text-text-tertiary">Each full run reads {estimate(spec.config.profiles.full_load.window_days)}.</p>
                  </div>
                  {!trainsModel && <p className="text-[11px] text-text-tertiary">This use case does not train a model, so it has no training profile.</p>}
                </div>
              </div>
            )}

            {IMPLEMENT_STEPS[step].id === 'schedule' && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={spec.schedule.enabled} onChange={(e) => patch('schedule.enabled', e.target.checked)} />
                  Enable schedule after the first successful run
                </label>
                <Field label="Cron (Quartz)">
                  <input className={inputCls} value={spec.schedule.cron} onChange={(e) => patch('schedule.cron', e.target.value)} />
                  {String(spec.schedule.cron || '').trim() && cronProblem(spec.schedule.cron) ? (
                    <p className="text-[11px] text-error">Not a valid Quartz cron: {cronProblem(spec.schedule.cron)}</p>
                  ) : (
                    <p className="text-[11px] text-text-tertiary">Runs {cronInWords(spec.schedule.cron, spec.schedule.timezone)}</p>
                  )}
                </Field>
                <Field label="Timezone">
                  <input className={inputCls} value={spec.schedule.timezone} onChange={(e) => patch('schedule.timezone', e.target.value)} />
                </Field>
                <Field label="Failure emails (comma separated; default: the decision owner)">
                  <input
                    className={inputCls}
                    value={(spec.schedule.failure_emails || []).join(', ')}
                    onChange={(e) => patch('schedule.failure_emails', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  />
                </Field>
                {trainsModel && (
                  <div className="grid grid-cols-2 gap-2">
                    <ProfileInput spec={spec} path="retrain.every_runs" onChange={setProfile} />
                    <ProfileInput spec={spec} path="retrain.drift_threshold" onChange={setProfile} />
                  </div>
                )}
                <p className="text-[11px] text-text-tertiary">Compute is serverless. The schedule stays off until you tick it. Cost: {costHint(spec)}</p>
              </div>
            )}

            {IMPLEMENT_STEPS[step].id === 'use_it' && (
              <div className="space-y-3">
                {IMPLEMENT_OUTPUTS.map((item) => {
                  const Icon = ICONS[item.id];
                  const on = spec.outputs[item.id];
                  const noAppAccess = item.id === 'app' && !context?.assets?.app && outputCheck?.app?.ok === false;
                  const unavailable = (item.id === 'app' && !features.apps)
                    || noAppAccess
                    || (item.id === 'genie_space' && !features.genie_spaces)
                    || (item.id === 'alert' && !features.alerts);
                  const disabled = unavailable && !on;
                  return (
                    <div key={item.id} className={`border rounded-lg p-3 ${on ? 'border-db-red/40 bg-db-red-50/40' : 'border-border'}`}>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={disabled}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const next = { ...spec.outputs, [item.id]: checked };
                            if (item.id === 'alert' && checked && !(next.alert_recipients || []).length) {
                              next.alert_recipients = defaultAlertRecipients(spec);
                            }
                            const removed = { ...spec.removed_outputs };
                            if (!checked && context?.assets?.[item.id]) delete removed[item.id];
                            setSpec((prev) => ({ ...prev, outputs: next, removed_outputs: removed }));
                          }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm font-semibold"><Icon size={14} /> {item.label}</div>
                          <p className={`text-[11px] mt-1 ${unavailable ? 'text-error' : 'text-text-secondary'}`}>
                            {!unavailable && item.blurb}
                            {unavailable && noAppAccess && `Inspire cannot create this App: ${outputCheck.app.detail}.${on ? ' Turn it off, or fix the access and check again.' : ''}`}
                            {unavailable && !noAppAccess && (on ? 'You cannot create this in this workspace any more. Turn it off, or ask a workspace admin.' : 'You cannot create this in this workspace.')}
                          </p>
                        </div>
                      </label>
                      {on && item.id === 'dashboard' && (
                        <div className="mt-2 space-y-2 pl-7">
                          <input className={inputCls} placeholder="Dashboard name" value={spec.outputs.dashboard_name} onChange={(e) => patch('outputs.dashboard_name', e.target.value)} />
                          <input className={inputCls} placeholder="Filter widgets, comma separated" value={(spec.outputs.dashboard_filters || []).join(', ')} onChange={(e) => patch('outputs.dashboard_filters', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
                        </div>
                      )}
                      {on && item.id === 'genie_space' && (
                        <div className="mt-2 space-y-2 pl-7">
                          <input className={inputCls} placeholder="Space name" value={spec.outputs.genie_space_name} onChange={(e) => patch('outputs.genie_space_name', e.target.value)} />
                          <textarea className={inputCls} rows={4} placeholder="Up to 5 questions, one per line" value={(spec.outputs.genie_questions || []).join('\n')} onChange={(e) => patch('outputs.genie_questions', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5))} />
                        </div>
                      )}
                      {on && item.id === 'app' && (
                        <div className="mt-2 space-y-2 pl-7">
                          <input className={inputCls} placeholder="app-name" value={spec.outputs.app_name} onChange={(e) => patch('outputs.app_name', e.target.value.toLowerCase())} />
                          {!APP_NAME_RE.test(spec.outputs.app_name || '') && spec.outputs.app_name && (
                            <p className="text-[11px] text-error">3-30 lowercase letters, digits and dashes</p>
                          )}
                          <textarea className={inputCls} rows={3} placeholder="What the App should let people do" value={spec.outputs.app_purpose} onChange={(e) => patch('outputs.app_purpose', e.target.value)} />
                        </div>
                      )}
                      {on && item.id === 'alert' && (
                        <div className="mt-2 space-y-2 pl-7">
                          <input className={inputCls} placeholder="Alert name" value={spec.outputs.alert_name} onChange={(e) => patch('outputs.alert_name', e.target.value)} />
                          <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
                            <span>Fire when</span>
                            <select className={`${inputCls} w-auto`} value={spec.outputs.alert_tiers} onChange={(e) => patch('outputs.alert_tiers', e.target.value)}>
                              {ALERT_TIER_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                            <span>rows in the latest run are</span>
                            <select className={`${inputCls} w-auto`} value={spec.outputs.alert_operator} onChange={(e) => patch('outputs.alert_operator', e.target.value)}>
                              {ALERT_OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                            </select>
                            <input type="number" min="0" step="1" className={`${inputCls} w-24`} value={spec.outputs.alert_threshold} onChange={(e) => patch('outputs.alert_threshold', e.target.value)} />
                          </div>
                          <textarea
                            className={inputCls}
                            rows={2}
                            placeholder="Optional: also fire when ... (plain words, for example 'refunds above 10 today'). Genie turns it into SQL that reads only this use case's tables."
                            value={spec.outputs.alert_condition_text}
                            onChange={(e) => patch('outputs.alert_condition_text', e.target.value)}
                          />
                          <Field label="Email recipients (comma separated)">
                            <input
                              className={inputCls}
                              value={(spec.outputs.alert_recipients || []).join(', ')}
                              onChange={(e) => patch('outputs.alert_recipients', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                            />
                          </Field>
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Slack, Teams and other destinations</span>
                            {destinations === null && <p className="text-[11px] text-text-tertiary"><Loader2 size={11} className="inline animate-spin" /> Loading destinations…</p>}
                            {destinationsError && <p className="text-[11px] text-text-tertiary">Notification destinations are not available to you ({destinationsError}). Use email recipients.</p>}
                            {destinations && !destinationsError && destinations.length === 0 && (
                              <p className="text-[11px] text-text-tertiary">This workspace has no notification destinations. A workspace admin can add Slack or Teams ones.</p>
                            )}
                            {(destinations || []).map((d) => {
                              const picked = chosenDestinations.some((x) => x.id === d.id);
                              return (
                                <label key={d.id} className="flex items-center gap-2 text-[12px]">
                                  <input
                                    type="checkbox"
                                    checked={picked}
                                    onChange={() => patch('outputs.alert_destinations', picked
                                      ? chosenDestinations.filter((x) => x.id !== d.id)
                                      : [...chosenDestinations, { id: d.id, name: d.name }])}
                                  />
                                  {d.name} <span className="text-text-tertiary">{d.type.replace(/_/g, ' ')}</span>
                                </label>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-text-tertiary">
                            It checks the result after each scheduled or full run and notifies only when the condition holds, once per run. Preview runs never send it. Groups cannot get alert emails: add their members or a destination.
                          </p>
                        </div>
                      )}
                      {!on && context?.assets?.[item.id] && (
                        <div className="mt-2 pl-7 flex gap-3 text-[11px]">
                          <label><input type="radio" checked={spec.removed_outputs[item.id] === 'delete'} onChange={() => patch('removed_outputs', { ...spec.removed_outputs, [item.id]: 'delete' })} /> Delete it</label>
                          <label><input type="radio" checked={spec.removed_outputs[item.id] === 'keep'} onChange={() => patch('removed_outputs', { ...spec.removed_outputs, [item.id]: 'keep' })} /> Keep it unmanaged</label>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Field label="Share with">
                  <input className={inputCls} placeholder="Search users and groups" value={principalQ} onChange={(e) => setPrincipalQ(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-1">
                  {(spec.sharing.principals || []).map((p) => (
                    <button
                      key={`${p.type}:${p.name}`}
                      type="button"
                      className="text-[11px] border border-border rounded-full px-2 py-0.5"
                      onClick={() => patch('sharing.principals', spec.sharing.principals.filter((x) => x.name !== p.name))}
                    >
                      {p.name} ×
                    </button>
                  ))}
                </div>
                {principals.map((p) => (
                  <button
                    key={`${p.type}:${p.name}`}
                    type="button"
                    className="block text-[11px] text-text-secondary hover:text-db-red"
                    onClick={() => {
                      if (spec.sharing.principals.some((x) => x.name === p.name && x.type === p.type)) return;
                      patch('sharing.principals', [...spec.sharing.principals, { type: p.type, name: p.name }]);
                    }}
                  >
                    {p.display} ({p.type})
                  </button>
                ))}
              </div>
            )}

            {IMPLEMENT_STEPS[step].id === 'review' && (
              <div className="space-y-3 text-sm">
                <p>Goal: {spec.use_case.goal || '—'}</p>
                <p>Owner: {spec.use_case.decision_owner || '—'}</p>
                <p>Output: {spec.config.result_table}</p>
                <p>Use it: {IMPLEMENT_OUTPUTS.filter((o) => spec.outputs[o.id]).map((o) => o.label).join(', ') || 'none'}</p>
                {spec.outputs.alert && (
                  <p>
                    Alert: fires when {alertTriggerText(spec.outputs)}; notifies {(spec.outputs.alert_recipients || []).length} email recipient(s)
                    {' '}and {chosenDestinations.length} destination(s){spec.schedule.enabled ? '' : ', once the schedule is on or a full run happens'}
                  </p>
                )}
                <p>Schedule: {spec.schedule.enabled ? cronInWords(spec.schedule.cron, spec.schedule.timezone) : 'off until the first successful run'}</p>
                {removedTables.length > 0 && <p>Not read: {removedTables.join(', ')}</p>}
                {notebookEdit && (
                  <label className="flex items-start gap-2 text-[12px] border border-warning/40 rounded-lg p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(spec.confirm_notebook_overwrite)}
                      onChange={(e) => patch('confirm_notebook_overwrite', e.target.checked)}
                    />
                    <span>
                      Overwrite the edits made to the notebook
                      {notebookEdit.edited_at ? ` on ${new Date(notebookEdit.edited_at).toLocaleString()}` : ''}
                      <span className="block text-text-tertiary">Leave it off to keep them: then change only the outputs or the schedule.</span>
                      {plan?.summary?.refill && !spec.confirm_notebook_overwrite && (
                        <span className="block text-warning">This version rebuilds the notebook, so it stops and asks again unless you tick this.</span>
                      )}
                    </span>
                  </label>
                )}
                {plan && (
                  <div className="border border-border rounded-lg p-3 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                      {plan.based_on_version ? `Version ${plan.spec_version}, edited from version ${plan.based_on_version}` : `Version ${plan.spec_version}`}
                    </div>
                    {planLines(plan.summary).map((line) => <p key={line} className="text-[12px] text-text-secondary">{line}</p>)}
                  </div>
                )}
                {planError && <p className="text-xs text-error bg-error-bg border border-error/20 rounded-md px-3 py-2">{planError}</p>}
                {preflight && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                      Permission checks{preflight.identity ? `, run live as ${preflight.identity}` : ''}
                    </div>
                    <ul className="text-[12px] space-y-1">
                      {Object.entries(preflight.checks || {}).map(([k, v]) => (
                        <li key={k} className={v.ok ? 'text-success' : 'text-error'}>
                          {PREFLIGHT_LABELS[k] || k.replace(/_/g, ' ')}: {v.detail}
                          {v.warn && <span className="block text-warning">{v.warn}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-text-tertiary">Cost hint: {costHint(spec)}</p>
              </div>
            )}
          </div>
          <footer className="flex items-center justify-between px-5 py-3 border-t border-border">
            <button type="button" className="inline-flex items-center gap-1 text-xs text-text-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft size={14} /> Back
            </button>
            {step < IMPLEMENT_STEPS.length - 1 ? (
              <button type="button" className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red" onClick={goNext}>
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button type="button" disabled={busy || (preflight && !preflight.ok) || Boolean(planError)} className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red disabled:opacity-50" onClick={submit}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                Implement
              </button>
            )}
          </footer>
        </div>
      </div>
    </Overlay>
  );
}

function ValuePicker({ label, values, selected, onLoad, onChange }) {
  const shown = values ? [...new Set([...selected, ...values])] : selected;
  const toggle = (value) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-secondary">{label}</span>
        {!values && <button type="button" className="text-[11px] text-db-red" onClick={onLoad}>Load values</button>}
      </div>
      {values && values.length === 0 && <p className="text-[11px] text-text-tertiary">No values found in this column.</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 max-h-40 overflow-y-auto">
        {shown.map((value) => (
          <label key={value} className="flex items-center gap-1 text-[11px]">
            <input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} />
            {value}
          </label>
        ))}
      </div>
      {values && values.length >= VALUE_LIMIT && <p className="text-[11px] text-text-tertiary">Showing the first {VALUE_LIMIT} values.</p>}
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-center p-4 sm:p-8">
      <div className="bg-surface border border-border rounded-xl shadow-elevated w-full max-w-5xl overflow-hidden">
        {children}
      </div>
      <button type="button" className="sr-only" onClick={onClose}>close</button>
    </div>
  );
}
