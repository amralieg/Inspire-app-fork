import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, NotebookPen, X, ChevronLeft, ChevronRight, ChevronDown, LayoutDashboard, Sparkles, AppWindow, Bell, Check, Lock, UserRound, KeyRound, MessageSquareText } from 'lucide-react';
import BodyPortal from '../components/BodyPortal';
import VibesEditor from '../components/VibesEditor';
import { generationFolder, sharedFolderWarning } from '../lib/workspaceLinks';
import { catalogRow } from '../lib/useCaseFacets';
import {
  IMPLEMENT_MODES,
  wizardSteps,
  IMPLEMENT_OUTPUTS,
  ALERT_TIER_OPTIONS,
  ALERT_OPERATORS,
  ALERT_THRESHOLD_BASES,
  ALERT_BASELINE_DIRECTIONS,
  baselineOperatorOk,
  FRESHNESS_OPTIONS,
  defaultSpecFromUseCase,
  caseNameOf,
  specFromLatest,
  tablesOf,
  primaryTableOf,
  removeTable,
  restoreTable,
  removalBlocker,
  filterValues,
  setFilterValues,
  readinessScope,
  readinessText,
  scopeNarrowing,
  emptyScopeError,
  planLines,
  editedNotebook,
  tableOfRef as refTable,
  columnOfRef as refColumn,
  VALUE_LIMIT,
  withDecisionOwner,
  cronInWords,
  cronProblem,
  alertTriggerText,
  stepErrors,
  advancedErrors,
  freshnessOf,
  withFreshness,
  nextAppName,
  widgetValueProblem,
  profileFieldProblem,
  initialStepIndex,
  lostTablesText,
  profileEstimate,
  costHint,
  PREFLIGHT_LABELS,
  PROFILE_FIELDS,
  APP_NAME_RE,
  START_POC_LABEL,
  RESET_ROLES_LABEL,
  BUILD_STEP_IDS,
  APP_ACCESS_CHOICES,
  APP_BACKEND_CHOICES,
  LAKEBASE_CHECKING,
  appBackendOf,
  lakebaseBlock,
  specWithBackend,
  withAppBackend,
  APP_OPTIONS,
  APP_NO_DOWNLOADS,
  APP_REFRESH_NOTE,
  REPLACE_EDITS_QUESTION,
  REPLACE_EDITS_CHOICES,
  PER_USER_REASON,
  APP_STYLES,
  APP_LAYOUTS,
  APP_THEMES,
  LAKEVIEW_STYLE_NOTE,
  GENIE_FOR_APP_NOTE,
  RESULT_TABLE_MOVE_NOTE,
  MERGE_OUTPUTS,
  resultTableParts,
  withResultTable,
  withOutput,
  withAppAccess,
  withAppOption,
  withAppLook,
  appOptionShown,
  mergeTargetOf,
  appMergeBlock,
  withMergeTarget,
  mergeTargetText,
  vibesKey,
  vibesLabel,
  vibesLength,
  vibesProblem,
  VIBES_HELP,
  VIBES_MAX,
  modelNameOf,
  splitList,
  APP_OWNERS_LABEL,
  APP_OWNERS_HELP,
  HOLDOUT_LABEL,
  HOLDOUT_BLURB,
  HOLDOUT_MIN_PERCENT,
  HOLDOUT_MAX_PERCENT,
  holdoutOf,
  holdoutPercentText,
  holdoutProblems,
  withHoldout,
  withHoldoutPercent,
} from '../lib/implementWizard';

const ICONS = { notebook: NotebookPen, dashboard: LayoutDashboard, genie_space: Sparkles, app: AppWindow, alert: Bell };
const ASSET_NOUNS = { dashboard: 'a dashboard', genie_space: 'a Genie Agent', app: 'an App', alert: 'an alert' };
const ACCESS_ICONS = { user: UserRound, sp: KeyRound };
const NO_WIDGET_GROUPS = { business: [], model: [], ai: [], extras: [], extras_kept_default: [] };
const COLUMN_ROLES = ['entity_id', 'event_date', 'measure', 'label', 'segment'];
const ALL_FEATURES = { apps: true, genie_spaces: true, alerts: true };
const TILE_CHECKS = { app: ['app_name', 'app_access', 'apps'], genie_space: ['genie_spaces'], alert: ['alerts'] };
const TILE_CHECK_KEYS = Object.values(TILE_CHECKS).flat();
const REMOVE = '__remove__';

const rowWithCard = (card, row) => ({ ...(card || {}), ...(row || {}) });

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">{label}</span>
      {children}
    </label>
  );
}

const inputBase = 'px-2.5 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus';
const inputCls = `w-full ${inputBase}`;

function ListInput({ value, separator, onChange, multiline = false, ...props }) {
  const list = Array.isArray(value) ? value : [];
  const joined = list.join(separator === ',' ? ', ' : separator);
  const [text, setText] = useState(joined);
  const shown = JSON.stringify(splitList(text, separator)) === JSON.stringify(list) ? text : joined;
  const change = (e) => {
    setText(e.target.value);
    onChange(splitList(e.target.value, separator));
  };
  return multiline ? <textarea {...props} value={shown} onChange={change} /> : <input {...props} value={shown} onChange={change} />;
}

function ProfileInput({ spec, path, onChange }) {
  const [section, name] = path.split('.');
  const value = spec.config.profiles[section]?.[name] ?? '';
  const problem = profileFieldProblem(path, value);
  return (
    <Field label={`${PROFILE_FIELDS[path].label} (${PROFILE_FIELDS[path].allowed})`}>
      <input className={inputCls} value={value} onChange={(e) => onChange(section, { ...spec.config.profiles[section], [name]: e.target.value })} />
      {problem && <p className="text-[11px] text-error-fg">{problem}</p>}
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
      {problem && <p className="text-[11px] text-error-fg">{problem}</p>}
    </div>
  );
}

function Advanced({ open, onToggle, children }) {
  return (
    <div className="border-t border-border pt-3">
      <button type="button" aria-expanded={open} onClick={onToggle} className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary">
        <ChevronDown size={14} className={open ? 'rotate-180' : ''} /> Advanced settings
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
}

function CheckLine({ check, label }) {
  return (
    <p className={`text-[11px] ${check.ok ? 'text-success-fg' : 'text-error-fg'}`}>
      {label}: {check.detail}
      {check.warn && <span className="block text-warning-fg">{check.warn}</span>}
    </p>
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
  onOpenBuild = null,
  focus = null,
}) {
  const warehouseId = settings.warehouseId;
  const inspireDatabase = settings.inspireDatabase;
  const [mode, setMode] = useState('poc');
  const [step, setStep] = useState(() => initialStepIndex(focus));
  const [spec, setSpec] = useState(() => defaultSpecFromUseCase(uc, { warehouseId, inspireDatabase }));
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [attempted, setAttempted] = useState({ data: false, delivery: false });
  const [checking, setChecking] = useState('');
  const [advanced, setAdvanced] = useState({ data: false, delivery: false });
  const [columnsByTable, setColumnsByTable] = useState({});
  const [preflight, setPreflight] = useState(null);
  const [preflightError, setPreflightError] = useState('');
  const [checksBusy, setChecksBusy] = useState(false);
  const [outputCheck, setOutputCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState('');
  const notebookFolder = generationFolder({
    generationPath: context?.generation_path, notebookPath: settings.notebookPath, businessName: context?.business_name,
  });
  const folderWarning = sharedFolderWarning(notebookFolder);
  const [notice, setNotice] = useState(() => lostTablesText(focus?.missingTables));
  const lostReason = (table) => (focus?.missingTables || []).find((m) => String(m.table).toLowerCase() === table.toLowerCase())?.reason;
  const [changing, setChanging] = useState({});
  const [excludeRef, setExcludeRef] = useState('');
  const [swaps, setSwaps] = useState({});
  const [values, setValues] = useState({});
  const [readiness, setReadiness] = useState(null);
  const [principalQ, setPrincipalQ] = useState('');
  const [principals, setPrincipals] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [destinations, setDestinations] = useState(null);
  const [destinationsError, setDestinationsError] = useState('');
  const [targets, setTargets] = useState(null);
  const [targetsError, setTargetsError] = useState('');
  const [look, setLook] = useState(null);
  const [lookError, setLookError] = useState('');
  const [lakebase, setLakebase] = useState(null);
  const [catalogs, setCatalogs] = useState(null);
  const [catalogsError, setCatalogsError] = useState('');
  const [schemas, setSchemas] = useState({});
  const [vibesFor, setVibesFor] = useState('');
  const bodyRef = useRef(null);
  const steps = wizardSteps(mode, spec);
  const stepIndex = Math.min(step, steps.length - 1);
  const stepId = steps[stepIndex].id;
  const lastStep = stepIndex === steps.length - 1;

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

  const loadSwaps = useCallback(async (table) => {
    try {
      const data = await apiPostJson(`/api/inspire/implement/swaps?${q}`, { table, required_columns: [] });
      setSwaps((prev) => ({ ...prev, [table]: data.swaps || [] }));
    } catch (e) {
      setSwaps((prev) => ({ ...prev, [table]: [] }));
      setErrors([e.message]);
    }
  }, [apiPostJson, q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/inspire/implement/context?${q}`);
        if (cancelled) return;
        setContext(data);
        const row = rowWithCard(uc, data.use_case);
        const fallback = defaultSpecFromUseCase(row, {
          warehouseId,
          inspireDatabase,
          owner: data.me?.username,
        });
        const next = specFromLatest(data.latest, fallback, data.assets);
        if (!next.config.warehouse_id) next.config.warehouse_id = warehouseId;
        setSpec(next);
        if (focus?.step === 'review') setStep(initialStepIndex(focus, 'poc', next));
        const lost = (focus?.missingTables || []).map((m) => tablesOf(row)
          .find((t) => [t, next.data.tables[t]].some((n) => String(n || '').toLowerCase() === String(m.table).toLowerCase())))
          .filter(Boolean);
        if (lost.length) {
          setChanging(Object.fromEntries(lost.map((t) => [t, true])));
          lost.forEach((t) => { loadSwaps(t); });
        }
      } catch (e) {
        if (!cancelled) setErrors([e.message]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const ucRow = useMemo(() => rowWithCard(uc, context?.use_case), [uc, context?.use_case]);
  const notebookEdit = editedNotebook(context?.latest);
  const editing = Boolean(context?.latest);
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
    } catch (e) {
      setErrors([e.message]);
    }
  }, [apiFetch, q, columnsByTable]);

  useEffect(() => {
    if (!context) return;
    sourceTables.forEach((t) => { loadColumns(t); });
  }, [context, sourceTables.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bodyRef.current?.scrollTo?.(0, 0);
  }, [step]);

  const groups = context?.widget_groups || NO_WIDGET_GROUPS;
  const segmentRef = spec.data.column_roles.segment || '';
  const exclusionRefs = (spec.data.filters || []).filter((f) => f.op === 'not in').map((f) => `${f.table}.${f.column}`);
  const extras = { columnsByTable, widgets: context?.widgets || [], trainsModel, mergeTargets: targets, held: context?.assets || {}, appLook: look,
    lakebase };
  const ownErrors = stepErrors(stepId, spec, extras, mode);

  const primaryOriginal = primaryTableOf(ucRow);
  const primaryChosen = spec.data.tables[primaryOriginal] || primaryOriginal;
  const eventRef = spec.data.column_roles.event_date || '';
  const estimate = (windowDays, more = {}) => profileEstimate({
    evidence: context?.evidence,
    table: primaryChosen,
    dateColumn: eventRef && refTable(eventRef).toLowerCase() === primaryChosen.toLowerCase() ? refColumn(eventRef) : '',
    windowDays,
    dataWindow: spec.data.window,
    discoveryType,
    ...more,
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

  const blockedBy = (id) => {
    setAttempted((prev) => ({ ...prev, [id]: true }));
    if (!stepErrors(id, spec, extras, mode).length) return false;
    if (advancedErrors(id, spec, extras, mode).length) setAdvanced((prev) => ({ ...prev, [id]: true }));
    const overLimit = id === 'delivery' && (vibesProblem('notebook', spec.data.notes) ? { id: 'notebook' }
      : IMPLEMENT_OUTPUTS.find((o) => spec.outputs[o.id] && vibesProblem(o.id, spec.outputs[vibesKey(o.id)])));
    if (overLimit) setVibesFor(overLimit.id);
    return true;
  };

  const goNext = async () => {
    setErrors([]);
    if (stepId === 'choose' || mode === 'notebook') {
      setStep(stepIndex + 1);
      return;
    }
    if (blockedBy(stepId)) return;
    try {
      if (stepId === 'data' && discoveryType && discoveryType !== 'Standard') {
        const scope = readinessScope(spec, ucRow);
        if (scope.table) {
          setChecking('Checking the data');
          const counted = await apiPostJson(`/api/inspire/implement/readiness?${q}`, {
            table: scope.table,
            discovery_type: discoveryType,
            columns: scope.columns,
            filters: scope.filters,
            window: scope.window,
          });
          setReadiness({ ...counted, scope });
          if (!counted.skipped && counted.row_count === 0) {
            setErrors([emptyScopeError(scope)]);
            if (scopeNarrowing(scope).length) setAdvanced((prev) => ({ ...prev, data: true }));
            return;
          }
        }
      }
      if (stepId === 'results') {
        setChecking('Checking you can write the result table');
        const check = await apiFetch(`/api/inspire/implement/output-check?${q}&${new URLSearchParams({
          table: spec.config.result_table, model_name: modelNameOf(spec) }).toString()}`);
        setOutputCheck(check);
        if (!check.ok) {
          const failed = [check.write, check.safety, check.model].find((c) => c && !c.ok);
          setErrors([failed?.detail].filter(Boolean));
          return;
        }
      }
      setStep(stepIndex + 1);
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setChecking('');
    }
  };

  const sent = useMemo(() => specWithBackend(spec, lakebase), [spec, lakebase]);
  const specKey = JSON.stringify(sent);
  const ownErrorsKey = ownErrors.join('|');
  const buildStep = BUILD_STEP_IDS.includes(stepId);
  const planReady = steps.filter((s) => BUILD_STEP_IDS.includes(s.id)).every((s) => !stepErrors(s.id, spec, extras, mode).length);
  useEffect(() => {
    if (!buildStep) return undefined;
    let cancelled = false;
    setChecksBusy(true);
    const timer = setTimeout(async () => {
      const planNow = !ownErrorsKey && planReady;
      const mergeApp = spec.outputs.app ? spec.outputs.merge.app : '';
      const checks = new URLSearchParams({
        result_table: spec.config.result_table,
        model_name: modelNameOf(spec),
        app_name: spec.outputs.app && !mergeApp ? spec.outputs.app_name : '',
        merge_app: mergeApp,
        alert: spec.outputs.alert ? '1' : '0',
        genie: spec.outputs.genie_space ? '1' : '0',
        dashboard: spec.outputs.dashboard ? '1' : '0',
        share: (spec.sharing.principals || []).length ? '1' : '0',
        principals: JSON.stringify((spec.sharing.principals || []).map((p) => p.name)),
      });
      const [pre, planned] = await Promise.allSettled([
        apiFetch(`/api/inspire/implement/preflight?${q}&${checks.toString()}`),
        planNow
          ? apiPostJson('/api/inspire/implement/plan', { inspire_database: inspireDatabase, warehouse_id: warehouseId, session_id: String(sessionId), spec: sent })
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setPreflight(pre.status === 'fulfilled' ? pre.value : null);
      setPreflightError(pre.status === 'fulfilled' ? '' : pre.reason.message);
      setPlan(planned.status === 'fulfilled' ? planned.value : null);
      setPlanError(planned.status === 'fulfilled' ? '' : planned.reason.message);
      setChecksBusy(false);
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [buildStep, specKey, ownErrorsKey, planReady, q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!buildStep || targets !== null) return undefined;
    let cancelled = false;
    apiFetch(`/api/inspire/implement/merge-targets?${q}`)
      .then((data) => { if (!cancelled) setTargets(data.targets || {}); })
      .catch((e) => {
        if (cancelled) return;
        setTargets({});
        setTargetsError(e.message);
      });
    return () => { cancelled = true; };
  }, [buildStep, targets, apiFetch, q]);

  useEffect(() => {
    if (!spec.outputs.app || look !== null || lookError) return undefined;
    let cancelled = false;
    apiFetch('/api/inspire/implement/app-look')
      .then((data) => { if (!cancelled) setLook(data); })
      .catch((e) => { if (!cancelled) setLookError(e.message); });
    return () => { cancelled = true; };
  }, [spec.outputs.app, look, lookError, apiFetch]);

  useEffect(() => {
    if (!spec.outputs.app || lakebase !== null) return undefined;
    let cancelled = false;
    apiFetch('/api/inspire/implement/lakebase')
      .then((data) => { if (!cancelled) setLakebase(data); })
      .catch((e) => { if (!cancelled) setLakebase({ state: 'unknown', detail: e.message }); });
    return () => { cancelled = true; };
  }, [spec.outputs.app, lakebase, apiFetch]);

  const resultParts = resultTableParts(spec.config.result_table);
  useEffect(() => {
    if (stepId !== 'results' || catalogs !== null) return undefined;
    let cancelled = false;
    apiFetch(`/api/catalogs?warehouse_id=${encodeURIComponent(warehouseId || '')}`)
      .then((data) => { if (!cancelled) setCatalogs((data.catalogs || []).map((c) => c.name).filter(Boolean)); })
      .catch((e) => {
        if (cancelled) return;
        setCatalogs([]);
        setCatalogsError(e.message);
      });
    return () => { cancelled = true; };
  }, [stepId, catalogs, apiFetch, warehouseId]);

  useEffect(() => {
    const catalog = resultParts.catalog;
    if (stepId !== 'results' || !catalog || schemas[catalog] || catalogsError) return undefined;
    let cancelled = false;
    apiFetch(`/api/catalogs/${encodeURIComponent(catalog)}/schemas?warehouse_id=${encodeURIComponent(warehouseId || '')}`)
      .then((data) => { if (!cancelled) setSchemas((prev) => ({ ...prev, [catalog]: { names: (data.schemas || []).map((s) => s.name).filter(Boolean) } })); })
      .catch((e) => { if (!cancelled) setSchemas((prev) => ({ ...prev, [catalog]: { names: [], error: e.message } })); });
    return () => { cancelled = true; };
  }, [stepId, resultParts.catalog, schemas, catalogsError, apiFetch, warehouseId]);

  const submit = async () => {
    setErrors([]);
    if (blockedBy(stepId)) return;
    setBusy(true);
    try {
      const data = await apiPostJson('/api/inspire/implement/submit', {
        inspire_database: inspireDatabase,
        warehouse_id: warehouseId,
        session_id: String(sessionId),
        notebook_path: settings.notebookPath,
        spec: sent,
      });
      onImplemented(data);
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setBusy(false);
    }
  };

  const generateNotebook = async () => {
    setErrors([]);
    setBusy(true);
    try {
      const data = await apiPostJson('/api/inspire/generate-genie', {
        inspire_database: inspireDatabase,
        warehouse_id: warehouseId,
        session_id: String(sessionId),
        use_case_ids: [spec.use_case_id],
        ...(settings.notebookPath ? { notebook_path: settings.notebookPath } : {}),
      });
      onImplemented({ mode: 'notebook', use_case_id: spec.use_case_id, run_id: data.run_id, job_run_url: data.job_run_url });
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setBusy(false);
    }
  };

  const loadValues = async (table, column) => {
    const key = `${table}.${column}`;
    if (values[key]) return;
    try {
      const data = await apiFetch(`/api/inspire/implement/values?${q}&table=${encodeURIComponent(table)}&column=${encodeURIComponent(column)}&limit=${VALUE_LIMIT}`);
      setValues((prev) => ({ ...prev, [key]: data.values || [] }));
    } catch (e) {
      setErrors([e.message]);
    }
  };

  useEffect(() => {
    if (stepId !== 'data' || !advanced.data) return undefined;
    let cancelled = false;
    apiFetch(`/api/inspire/implement/serving-endpoints?${q}`)
      .then((data) => { if (!cancelled) setEndpoints(data.endpoints || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stepId, advanced.data, apiFetch, q]);

  useEffect(() => {
    if (stepId !== 'delivery' || !spec.outputs.alert || destinations !== null) return undefined;
    let cancelled = false;
    apiFetch('/api/inspire/implement/destinations')
      .then((data) => { if (!cancelled) setDestinations(data.destinations || []); })
      .catch((e) => {
        if (cancelled) return;
        setDestinations([]);
        setDestinationsError(e.message);
      });
    return () => { cancelled = true; };
  }, [stepId, spec.outputs.alert, destinations, apiFetch]);

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

  const title = caseNameOf(uc) || spec.use_case_name || spec.use_case_id;

  if (loading) {
    return (
      <Overlay title={title} uc={uc} steps={steps} step={stepIndex} onClose={onClose}>
        <div className="flex items-center gap-2 p-8 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Loading the use case…
        </div>
      </Overlay>
    );
  }

  const features = preflight?.features || context?.features || ALL_FEATURES;
  const chosenDestinations = spec.outputs.alert_destinations || [];
  const checkEntries = Object.entries(preflight?.checks || {});
  const generalChecks = checkEntries.filter(([k]) => !TILE_CHECK_KEYS.includes(k));
  const freshness = freshnessOf(spec.schedule);
  const appTaken = spec.outputs.app && preflight?.checks?.app_name?.ok === false;
  const deliveryChecks = buildStep && stepId !== 'delivery'
    ? checkEntries.filter(([, v]) => !v.ok).map(([k, v]) => `${PREFLIGHT_LABELS[k] || k.replace(/_/g, ' ')}: ${v.detail} (fix it on Delivery)`)
    : [];
  const earlierGaps = buildStep && lastStep
    ? steps.filter((s) => BUILD_STEP_IDS.includes(s.id) && s.id !== stepId)
      .flatMap((s) => stepErrors(s.id, spec, extras, mode).map((e) => `${e} (fix it on ${s.label})`))
    : [];
  const footerErrors = [...new Set([
    ...(attempted[stepId] ? ownErrors : []),
    ...errors,
    ...(buildStep ? [lastStep ? planError : '', preflightError, ...deliveryChecks, ...earlierGaps] : []),
  ].filter(Boolean))];
  const unchanged = lastStep && !checksBusy && Boolean(plan?.unchanged);
  const implementBlocked = busy || checksBusy || Boolean(plan?.unchanged)
    || (!ownErrors.length && (!preflight || !preflight.ok || !plan || Boolean(planError)));
  const mergeFresh = defaultSpecFromUseCase(ucRow).outputs.app_name;
  const appTarget = mergeTargetOf(targets, 'app', spec.outputs.app ? spec.outputs.merge.app : '');
  const palette = (look?.palette_colors || []).find((p) => p.id === spec.outputs.app_look.palette) || null;

  const pickTable = (original, value) => {
    if (value === REMOVE) {
      const { spec: next, cleared } = removeTable(spec, original);
      setSpec(next);
      const parts = [];
      if (cleared.roles.length) parts.push(`its column roles (${cleared.roles.map((r) => r.replace('_', ' ')).join(', ')})`);
      if (cleared.filters) parts.push(`${cleared.filters} filter(s) on it`);
      setNotice(parts.length ? `Removed ${original} and cleared ${parts.join(' and ')}.` : `Removed ${original}.`);
    } else {
      patch('data.tables', { ...spec.data.tables, [original]: value });
    }
    setChanging((prev) => ({ ...prev, [original]: false }));
  };

  const toggleOutput = (id, checked) => setSpec((prev) => withOutput(prev, id, checked, context?.assets));

  return (
    <Overlay title={title} uc={uc} steps={steps} step={stepIndex} onClose={onClose}>
      <div ref={bodyRef} data-wizard-body="" className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
        {stepId === 'choose' && (
          <>
            <section className="bg-bg border border-border rounded-lg p-4 space-y-3" aria-label="Executive summary">
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
              {(ucRow.statement || ucRow.Statement) && <p className="text-[13px] text-text-secondary">{ucRow.statement || ucRow.Statement}</p>}
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                {[
                  ['Who it helps', ucRow.beneficiary || ucRow.Beneficiary],
                  ['Sponsor', ucRow.sponsor || ucRow.Sponsor],
                  ['Business value', ucRow.business_value || ucRow['Business Value']],
                ].filter(([, val]) => val).map(([label, val]) => (
                  <div key={label}>
                    <dt className="text-[9px] uppercase tracking-[0.18em] font-bold text-text-tertiary">{label}</dt>
                    <dd className="mt-0.5 text-text-secondary line-clamp-3">{val}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <fieldset className="space-y-2">
              <legend className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary mb-1">What to build</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {IMPLEMENT_MODES.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-2.5 border rounded-lg p-3 cursor-pointer ${mode === m.id ? 'border-db-red bg-db-red-50' : 'border-border hover:border-border-strong'}`}
                  >
                    <input type="radio" name="implement-mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="mt-0.5" />
                    <span className="space-y-0.5">
                      <span className="block text-sm font-semibold text-text-primary">{m.label}{m.id === 'poc' ? ' (default)' : ''}</span>
                      <span className="block text-[12px] text-text-secondary">{m.blurb}</span>
                    </span>
                  </label>
                ))}
              </div>
              {editing && (
                <p className="text-[11px] text-text-tertiary">
                  This use case has a PoC/MVP (v{context.latest.spec_version}). Full PoC/MVP edits it; Notebook only leaves it as it is.
                </p>
              )}
            </fieldset>
          </>
        )}

        {stepId === 'data' && mode === 'notebook' && (
          <section className="space-y-3" aria-label="Tables the notebook uses">
            <h3 className="text-sm font-semibold text-text-primary">Tables the notebook uses</h3>
            <p className="text-[12px] text-text-secondary">
              Notebook only writes the notebook over the tables this use case was discovered with. To swap, remove or filter a table, go back and choose Full PoC/MVP.
            </p>
            <ul className="space-y-1.5">
              {tablesOf(ucRow).map((t) => (
                <li key={t} className="flex items-center justify-between gap-3 border border-border rounded-md px-3 py-2 text-[12px]">
                  <span className="font-mono text-text-primary truncate">{t}</span>
                  {t === primaryOriginal && <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-tertiary">primary</span>}
                </li>
              ))}
            </ul>
            {tablesOf(ucRow).length === 0 && (
              <p className="text-[12px] text-text-tertiary">This use case names no tables, so the notebook works from its description alone.</p>
            )}
          </section>
        )}

        {stepId === 'notebook' && (
          <section className="space-y-3 text-[12px] text-text-secondary" aria-label="Notebook">
            <h3 className="text-sm font-semibold text-text-primary">Write the Genie Code notebook</h3>
            <p>
              Inspire runs Generate Use Cases for this session with only {spec.use_case_id} selected. It writes the Genie Code instruction for this use case
              and saves it as the use case notebook{notebookFolder ? ` under ${notebookFolder}` : ''}. Nothing else is built, and no other use case changes.
            </p>
            {ucRow.notebook_path && (
              <p>
                The current notebook, <span className="font-mono text-text-primary">{ucRow.notebook_path}</span>, is replaced.
                If you edited it, Inspire keeps it and writes the new notebook beside it.
              </p>
            )}
            {editing && <p>Your PoC/MVP (v{context.latest.spec_version}) is not changed.</p>}
            <p>The run takes a few minutes. Follow it on the Build page.</p>
          </section>
        )}

        {stepId === 'data' && mode === 'poc' && (
          <>
            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Source tables</h3>
                <p className="text-[11px] text-text-tertiary">Inspire picked these for this use case. Genie builds on them unless you change one.</p>
              </div>
              {notice && <p className="text-[11px] text-text-secondary bg-bg border border-border rounded-md px-3 py-2">{notice}</p>}
              {tablesOf(ucRow).map((original) => {
                const chosen = spec.data.tables[original] || original;
                const removed = isRemoved(original);
                const blocker = removalBlocker(ucRow, spec, original);
                const primary = original.toLowerCase() === primaryOriginal.toLowerCase();
                const lost = removed ? '' : lostReason(chosen);
                const options = swaps[original];
                return (
                  <div key={original} data-table={original} className={`border rounded-lg px-3 py-2.5 space-y-2 ${lost ? 'border-error/50' : 'border-border'} ${removed ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {!removed && <Check size={14} className="shrink-0 text-success-fg" aria-hidden="true" />}
                        <span className={`font-mono text-[12px] text-text-primary truncate ${removed ? 'line-through' : ''}`}>{chosen}</span>
                        {primary && <span className="text-[9px] uppercase tracking-[0.18em] text-text-tertiary">Primary</span>}
                        {chosen !== original && !removed && <span className="text-[10px] text-text-tertiary">instead of {original}</span>}
                        {lost && <span className="text-[9px] uppercase tracking-[0.18em] text-error-fg">{lost}</span>}
                      </div>
                      {removed ? (
                        <button type="button" className="text-[11px] text-db-red-fg shrink-0" onClick={() => { setSpec((prev) => restoreTable(prev, original)); setNotice(''); }}>
                          Use it again
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-[11px] text-db-red-fg shrink-0"
                          onClick={() => {
                            const open = !changing[original];
                            setChanging((prev) => ({ ...prev, [original]: open }));
                            if (open && options === undefined) loadSwaps(original);
                          }}
                        >
                          Change
                        </button>
                      )}
                    </div>
                    {!removed && changing[original] && (
                      <select aria-label={`Table to use for ${original}`} className={inputCls} value={chosen} onChange={(e) => pickTable(original, e.target.value)}>
                        <option value={original}>{original} (Inspire's pick)</option>
                        {chosen !== original && !(options || []).some((s) => s.table === chosen) && <option value={chosen}>{chosen}</option>}
                        {options === undefined && <option disabled value="">Finding similar tables…</option>}
                        {options && options.length === 0 && <option disabled value="">No similar table found</option>}
                        {(options || []).filter((s) => s.table !== original).map((s) => (
                          <option key={s.table} value={s.table}>{s.table} ({s.matched} of {s.total} columns match)</option>
                        ))}
                        <option value={REMOVE} disabled={Boolean(blocker)}>{blocker ? `Don't use this table (${blocker})` : "Don't use this table"}</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </section>

            <Advanced open={advanced.data} onToggle={() => setAdvanced((prev) => ({ ...prev, data: !prev.data }))}>
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
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-text-secondary">
                  Column roles: Inspire&apos;s choice uses the columns the use case&apos;s Genie Code instruction names. Pick a column
                  only to override it.
                </p>
                {Object.values(spec.data.column_roles).some(Boolean) && (
                  <button type="button" className="text-[11px] text-db-red-fg shrink-0" onClick={() => patch('data.column_roles', {})}>
                    {RESET_ROLES_LABEL}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {COLUMN_ROLES.filter((role) => trainsModel || role !== 'label').map((role) => (
                  <Field key={role} label={role.replace('_', ' ')}>
                    <select
                      className={inputCls}
                      value={spec.data.column_roles[role] || ''}
                      onChange={(e) => patch('data.column_roles', { ...spec.data.column_roles, [role]: e.target.value })}
                    >
                      <option value="">Inspire&apos;s choice</option>
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
                <select className={inputCls} value={excludeRef} onChange={(e) => setExcludeRef(e.target.value)}>
                  <option value="">Pick a column to exclude values from</option>
                  {sourceTables.flatMap((table) => (columnsByTable[table] || []).map((c) => (
                    <option key={`${table}.${c.column_name}`} value={`${table}.${c.column_name}`}>{table}.{c.column_name}</option>
                  )))}
                </select>
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
              <p className="text-[11px] text-text-tertiary">
                {discoveryType === 'Deep' ? 'Deep discovery: Next counts the rows to work with.' : 'metadata only, readiness checked at preview run'}
              </p>
              {[['Business rules', groups.business], ['Model', groups.model], ['AI', groups.ai], ['Use-case extras', groups.extras]].map(([label, list]) => (
                <div key={label} className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">{label}</h4>
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
                <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Run profiles</h4>
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
            </Advanced>
          </>
        )}

        {stepId === 'results' && (
          <>
            <ResultTableStep
              parts={resultParts}
              table={spec.config.result_table}
              defaultTable={defaultSpecFromUseCase(ucRow, { inspireDatabase }).config.result_table}
              catalogs={catalogs}
              catalogsError={catalogsError}
              schemas={schemas[resultParts.catalog]}
              outputCheck={outputCheck}
              onChange={(parts) => { setSpec((prev) => withResultTable(prev, parts)); setOutputCheck(null); }}
            />
            <HoldoutSetting
              spec={spec}
              onEnabled={(on) => setSpec((prev) => withHoldout(prev, on))}
              onPercent={(text) => setSpec((prev) => withHoldoutPercent(prev, text))}
            />
          </>
        )}

        {stepId === 'delivery' && (
          <>
            {readinessText(readiness, readiness?.scope) && (
              <p className="text-[11px] text-text-secondary">{readinessText(readiness, readiness.scope)}</p>
            )}
            {vibesFor ? (
              <VibesPanel spec={spec} focus={vibesFor} onChange={(id, value) => patch(id === 'notebook' ? 'data.notes' : `outputs.${vibesKey(id)}`, value)} onDone={() => setVibesFor('')} />
            ) : (
              <section className="space-y-2">
                <div className="relative pr-28">
                  <VibesTrigger label="notebook" value={spec.data.notes} onOpen={() => setVibesFor('notebook')} />
                  <h3 className="text-sm font-semibold text-text-primary">How do you want to use it?</h3>
                  <p className="text-[11px] text-text-tertiary">Pick one or more. Genie builds each one for you.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {IMPLEMENT_OUTPUTS.map((item) => {
                    const Icon = ICONS[item.id];
                    const on = spec.outputs[item.id];
                    const noAppAccess = item.id === 'app' && !context?.assets?.app && outputCheck?.app?.ok === false;
                    const unavailable = (item.id === 'app' && !features.apps)
                      || noAppAccess
                      || (item.id === 'genie_space' && !features.genie_spaces)
                      || (item.id === 'alert' && !features.alerts);
                    const tileChecks = (TILE_CHECKS[item.id] || []).map((k) => [k, preflight?.checks?.[k]])
                      .filter(([k, v]) => v && !v.ok && on && !(k === 'app_name' && appTaken));
                    const locked = item.id === 'genie_space' && spec.outputs.app;
                    const mergeable = on && MERGE_OUTPUTS.includes(item.id) && !context?.assets?.[item.id];
                    return (
                      <div key={item.id} data-output={item.id} className={`border rounded-lg p-3 space-y-2 ${on ? 'border-db-red/50 bg-db-red-50/40' : 'border-border'}`}>
                        <div className="relative">
                          <label className={`flex items-start gap-3 ${locked ? '' : 'cursor-pointer'}`}>
                            <input type="checkbox" className="mt-0.5" checked={on} disabled={(unavailable && !on) || locked} onChange={(e) => toggleOutput(item.id, e.target.checked)} />
                            <span className="flex-1">
                              <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                                <Icon size={14} /> {item.label}
                                {locked && <Lock size={12} className="text-text-tertiary" aria-hidden="true" />}
                              </span>
                              <span className={`block text-[11px] mt-1 ${unavailable ? 'text-error-fg' : 'text-text-secondary'}`}>
                                {!unavailable && (locked ? GENIE_FOR_APP_NOTE : item.blurb)}
                                {unavailable && noAppAccess && `Inspire cannot create this App: ${outputCheck.app.detail}.${on ? ' Turn it off, or fix the access and check again.' : ''}`}
                                {unavailable && !noAppAccess && (on ? 'You cannot create this in this workspace any more. Turn it off, or ask a workspace admin.' : 'You cannot create this in this workspace.')}
                              </span>
                            </span>
                          </label>
                          {on && <VibesTrigger label={item.label} value={spec.outputs[vibesKey(item.id)]} onOpen={() => setVibesFor(item.id)} />}
                        </div>
                        {mergeable && (
                          <MergeChoice
                            name={item.id}
                            label={item.label}
                            chosen={spec.outputs.merge[item.id]}
                            targets={targets}
                            targetsError={targetsError}
                            access={spec.outputs.app_access}
                            onPick={(target) => { setSpec((prev) => withMergeTarget(prev, item.id, target, mergeFresh)); }}
                          />
                        )}
                        {on && item.id === 'app' && !spec.outputs.merge.app && (
                          <div className="pl-7 space-y-1">
                            <Field label="App name">
                              <input className={inputCls} value={spec.outputs.app_name} onChange={(e) => patch('outputs.app_name', e.target.value.toLowerCase())} />
                            </Field>
                            {spec.outputs.app_name && !APP_NAME_RE.test(spec.outputs.app_name) ? (
                              <p className="text-[11px] text-error-fg">3-30 lowercase letters, digits and dashes, starting with a letter</p>
                            ) : appTaken ? (
                              <p className="text-[11px] text-error-fg">
                                {preflight.checks.app_name.detail}.{' '}
                                <button type="button" className="text-db-red-fg underline" onClick={() => patch('outputs.app_name', nextAppName(spec.outputs.app_name))}>
                                  Use {nextAppName(spec.outputs.app_name)}
                                </button>
                              </p>
                            ) : (
                              <p className="text-[11px] text-text-tertiary">
                                {preflight?.checks?.app_name?.ok ? preflight.checks.app_name.detail : 'Up to 30 lowercase letters, digits and dashes.'}
                              </p>
                            )}
                          </div>
                        )}
                        {on && item.id === 'alert' && (
                          <p className="pl-7 text-[11px] text-text-secondary">
                            {(spec.outputs.alert_recipients || []).length
                              ? `Emails ${spec.outputs.alert_recipients.join(', ')} when ${alertTriggerText(spec.outputs)}.`
                              : 'Nobody gets it yet: add an email under Advanced settings.'}
                          </p>
                        )}
                        {tileChecks.map(([k, v]) => <div key={k} className="pl-7"><CheckLine check={v} label={PREFLIGHT_LABELS[k] || k} /></div>)}
                        {!on && context?.assets?.[item.id] && (
                          <div className="pl-7 space-y-1 text-[11px]">
                            <p className="text-text-secondary">This use case already has {ASSET_NOUNS[item.id]}. What should happen to it?</p>
                            <div className="flex gap-3">
                              <label><input type="radio" checked={spec.removed_outputs[item.id] === 'delete'} onChange={() => patch('removed_outputs', { ...spec.removed_outputs, [item.id]: 'delete' })} /> Delete it</label>
                              <label><input type="radio" checked={spec.removed_outputs[item.id] === 'keep'} onChange={() => patch('removed_outputs', { ...spec.removed_outputs, [item.id]: 'keep' })} /> Keep it unmanaged</label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">Keep it fresh</h3>
              <div role="group" aria-label="Keep it fresh" className="inline-flex rounded-lg border border-border overflow-hidden">
                {[...FRESHNESS_OPTIONS, ...(freshness === 'custom' ? [{ id: 'custom', label: 'Custom' }] : [])].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={freshness === option.id}
                    disabled={option.id === 'custom'}
                    onClick={() => setSpec((prev) => withFreshness(prev, option.id))}
                    className={`px-4 py-1.5 text-xs font-medium border-r border-border last:border-r-0 ${freshness === option.id ? 'bg-db-red-solid text-white' : 'bg-surface text-text-secondary hover:text-text-primary'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-tertiary">
                {freshness === 'off'
                  ? 'Genie runs it once now. Turn this on later to refresh it on a schedule.'
                  : `Refreshes ${cronInWords(spec.schedule.cron, spec.schedule.timezone)}, after the first successful run. Cost: ${costHint(spec)}`}
              </p>
            </section>

            {notebookEdit && (
              <label className="flex items-start gap-2 text-[12px] border border-warning/40 rounded-lg p-3">
                <input type="checkbox" className="mt-0.5" checked={Boolean(spec.confirm_notebook_overwrite)} onChange={(e) => patch('confirm_notebook_overwrite', e.target.checked)} />
                <span>
                  Overwrite the edits made to the notebook
                  {notebookEdit.edited_at ? ` on ${new Date(notebookEdit.edited_at).toLocaleString()}` : ''}
                  <span className="block text-text-tertiary">Leave it off to keep them: then change only the outputs or the schedule.</span>
                  {plan?.summary?.refill && !spec.confirm_notebook_overwrite && (
                    <span className="block text-warning-fg">This version rebuilds the notebook, so it stops and asks again unless you tick this.</span>
                  )}
                </span>
              </label>
            )}

            {folderWarning && <p role="note" aria-label="Where Inspire saves the PoC/MVP" className="text-[11px] text-warning-fg">{folderWarning}</p>}

            {generalChecks.some(([, v]) => !v.ok || v.warn) && (
              <section className="space-y-1" aria-label="Access checks">
                {generalChecks.filter(([, v]) => !v.ok || v.warn).map(([k, v]) => <CheckLine key={k} check={v} label={PREFLIGHT_LABELS[k] || k.replace(/_/g, ' ')} />)}
              </section>
            )}

            <Advanced open={advanced.delivery} onToggle={() => setAdvanced((prev) => ({ ...prev, delivery: !prev.delivery }))}>
              {spec.outputs.dashboard && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Dashboard</h4>
                  <input className={inputCls} placeholder="Dashboard name" value={spec.outputs.dashboard_name} onChange={(e) => patch('outputs.dashboard_name', e.target.value)} />
                  <ListInput className={inputCls} placeholder="Filter widgets, comma separated" separator="," value={spec.outputs.dashboard_filters} onChange={(list) => patch('outputs.dashboard_filters', list)} />
                </div>
              )}
              {spec.outputs.genie_space && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Genie Agent</h4>
                  <input className={inputCls} placeholder="Agent name" value={spec.outputs.genie_space_name} onChange={(e) => patch('outputs.genie_space_name', e.target.value)} />
                  <ListInput multiline className={inputCls} rows={4} placeholder="Up to 5 questions, one per line" separator={'\n'} value={spec.outputs.genie_questions} onChange={(list) => patch('outputs.genie_questions', list.slice(0, 5))} />
                </div>
              )}
              {spec.outputs.app && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">App</h4>
                  <textarea className={inputCls} rows={3} placeholder="What the App should let people do" value={spec.outputs.app_purpose} onChange={(e) => patch('outputs.app_purpose', e.target.value)} />
                  <Field label={APP_OWNERS_LABEL}>
                    <ListInput className={inputCls} separator="," value={spec.outputs.app_owners} onChange={(list) => patch('outputs.app_owners', list)} />
                  </Field>
                  <p className="text-[11px] text-text-tertiary">{APP_OWNERS_HELP}</p>
                </div>
              )}
              {spec.outputs.alert && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Alert</h4>
                  <input className={inputCls} placeholder="Alert name" value={spec.outputs.alert_name} onChange={(e) => patch('outputs.alert_name', e.target.value)} />
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
                    <span>Fire when</span>
                    <select className={`${inputBase} w-auto`} value={spec.outputs.alert_tiers} onChange={(e) => patch('outputs.alert_tiers', e.target.value)}>
                      {ALERT_TIER_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <span>rows in the latest run are</span>
                    <select className={`${inputBase} w-auto`} value={spec.outputs.alert_operator} onChange={(e) => patch('outputs.alert_operator', e.target.value)}>
                      {(spec.outputs.alert_threshold_basis === 'baseline' ? Object.keys(ALERT_BASELINE_DIRECTIONS) : ALERT_OPERATORS).map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input type="number" min="0" step="1" className={`${inputBase} w-24`} value={spec.outputs.alert_threshold} onChange={(e) => patch('outputs.alert_threshold', e.target.value)} />
                    <span>compared with</span>
                    <select
                      className={`${inputBase} w-auto`}
                      value={spec.outputs.alert_threshold_basis || 'fixed'}
                      onChange={(e) => {
                        patch('outputs.alert_threshold_basis', e.target.value);
                        if (e.target.value === 'baseline' && !baselineOperatorOk(spec.outputs.alert_operator)) {
                          patch('outputs.alert_operator', '>=');
                        }
                      }}
                    >
                      {ALERT_THRESHOLD_BASES.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </select>
                  </div>
                  <p className="text-[11px] text-text-tertiary">Fires when {alertTriggerText(spec.outputs)}.</p>
                  <textarea
                    className={inputCls}
                    rows={2}
                    placeholder="Optional: also fire when ... (plain words, for example 'refunds above 10 today'). Genie turns it into SQL that reads only this use case's tables."
                    value={spec.outputs.alert_condition_text}
                    onChange={(e) => patch('outputs.alert_condition_text', e.target.value)}
                  />
                  <Field label="Email recipients (comma separated)">
                    <ListInput className={inputCls} separator="," value={spec.outputs.alert_recipients} onChange={(list) => patch('outputs.alert_recipients', list)} />
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
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Schedule</h4>
                <Field label="Cron (Quartz)">
                  <input className={inputCls} value={spec.schedule.cron} onChange={(e) => patch('schedule.cron', e.target.value)} />
                  {String(spec.schedule.cron || '').trim() && cronProblem(spec.schedule.cron) ? (
                    <p className="text-[11px] text-error-fg">Not a valid Quartz cron: {cronProblem(spec.schedule.cron)}</p>
                  ) : (
                    <p className="text-[11px] text-text-tertiary">Runs {cronInWords(spec.schedule.cron, spec.schedule.timezone)}{spec.schedule.enabled ? '' : ' once Keep it fresh is on'}</p>
                  )}
                </Field>
                <Field label="Timezone">
                  <input className={inputCls} value={spec.schedule.timezone} onChange={(e) => patch('schedule.timezone', e.target.value)} />
                </Field>
                <Field label="Failure emails (comma separated; default: the decision owner)">
                  <ListInput className={inputCls} separator="," value={spec.schedule.failure_emails} onChange={(list) => patch('schedule.failure_emails', list)} />
                </Field>
                {trainsModel && (
                  <div className="grid grid-cols-2 gap-2">
                    <ProfileInput spec={spec} path="retrain.every_runs" onChange={setProfile} />
                    <ProfileInput spec={spec} path="retrain.drift_threshold" onChange={setProfile} />
                  </div>
                )}
              </div>
              <div className="space-y-2">
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
                    className="block text-[11px] text-text-secondary hover:text-db-red-fg"
                    onClick={() => {
                      if (spec.sharing.principals.some((x) => x.name === p.name && x.type === p.type)) return;
                      patch('sharing.principals', [...spec.sharing.principals, { type: p.type, name: p.name }]);
                    }}
                  >
                    {p.display} ({p.type})
                  </button>
                ))}
              </div>
              {plan && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                    {plan.based_on_version ? `Version ${plan.spec_version}, edited from version ${plan.based_on_version}` : `Version ${plan.spec_version}`}
                  </h4>
                  {planLines(plan.summary).map((line) => <p key={line} className="text-[12px] text-text-secondary">{line}</p>)}
                </div>
              )}
              {checkEntries.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                    Permission checks{preflight.identity ? `, run live as ${preflight.identity}` : ''}
                  </h4>
                  {checkEntries.map(([k, v]) => <CheckLine key={k} check={v} label={PREFLIGHT_LABELS[k] || k.replace(/_/g, ' ')} />)}
                </div>
              )}
              <p className="text-[11px] text-text-tertiary">Cost hint: {costHint(spec)}</p>
            </Advanced>
          </>
        )}

        {stepId === 'app_access' && (
          <AppAccessStep
            spec={spec}
            target={appTarget}
            lakebase={lakebase}
            onAccess={(access) => setSpec((prev) => withAppAccess(prev, access))}
            onOption={(key, value) => setSpec((prev) => withAppOption(prev, key, value))}
            onBackend={(backend) => setSpec((prev) => withAppBackend(prev, backend))}
          />
        )}

        {stepId === 'app_look' && (
          <AppLookStep
            spec={spec}
            look={look}
            lookError={lookError}
            palette={palette}
            target={appTarget}
            onLook={(key, value) => setSpec((prev) => withAppLook(prev, key, value))}
          />
        )}
      </div>

      <footer className="border-t border-border px-6 py-3 space-y-2">
        {unchanged && (
          <div role="note" aria-label="Nothing to build" className="bg-bg-subtle border border-border rounded-md px-3 py-2 flex items-center justify-between gap-3">
            <p className="text-xs text-text-secondary">
              Nothing changed since version {plan.based_on_version}, so there is nothing new to build. Change a choice in any step to
              build version {plan.spec_version}, or go to the Build page to rebuild an output or preview a re-run.
            </p>
            {onOpenBuild && (
              <button type="button" className="shrink-0 text-xs font-semibold text-db-red-fg hover:underline" onClick={() => onOpenBuild(plan.use_case_id)}>
                Go to the Build page
              </button>
            )}
          </div>
        )}
        {footerErrors.length > 0 && (
          <div role="alert" className="bg-error-bg border border-error/20 rounded-md px-3 py-2 space-y-0.5">
            {footerErrors.map((e) => <p key={e} className="text-xs text-error-fg">{e}</p>)}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className={`inline-flex items-center gap-1 text-xs text-text-secondary ${stepIndex === 0 ? 'invisible' : ''}`}
            disabled={stepIndex === 0 || busy}
            onClick={() => { setErrors([]); setStep(stepIndex - 1); }}
          >
            <ChevronLeft size={14} /> Back
          </button>
          {stepId !== 'notebook' && !lastStep ? (
            <button
              type="button"
              disabled={Boolean(checking)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-db-red-solid disabled:opacity-70"
              onClick={goNext}
            >
              {checking ? <><Loader2 size={14} className="animate-spin" /> {checking}…</> : <>Next <ChevronRight size={14} /></>}
            </button>
          ) : stepId === 'notebook' ? (
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-db-red-solid disabled:opacity-50"
              onClick={generateNotebook}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? 'Starting…' : 'Generate notebook'}
            </button>
          ) : (
            <button
              type="button"
              disabled={implementBlocked}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-db-red-solid disabled:opacity-50"
              onClick={submit}
            >
              {(busy || checksBusy) && <Loader2 size={14} className="animate-spin" />}
              {busy ? 'Starting…' : checksBusy ? 'Checking access…' : 'Start PoC/MVP'}
            </button>
          )}
        </div>
      </footer>
    </Overlay>
  );
}

const LEGEND = 'text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary';
const ACCESS_SHORT = { user: 'each person signs in', sp: 'its own service principal' };

function SegmentButton({ on, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-medium border-r border-border last:border-r-0 disabled:cursor-not-allowed ${on ? 'bg-db-red-solid text-white' : 'bg-surface text-text-secondary hover:text-text-primary'}`}
    >
      {children}
    </button>
  );
}

function VibesTrigger({ label, value, onOpen }) {
  const length = vibesLength(value);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`absolute right-0 top-0 inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-[11px] font-medium glow-focus ${length > VIBES_MAX ? 'border-error text-error-fg' : 'border-border text-db-red-fg hover:border-db-red/50'}`}
    >
      <MessageSquareText size={11} aria-hidden="true" />
      {length ? 'Edit vibes' : 'Add vibes'}<span className="sr-only"> for the {label}{length ? ', ' : ''}</span>
      {length > 0 && <span className="tabular-nums">{length}/{VIBES_MAX}</span>}
    </button>
  );
}

function VibesPanel({ spec, focus, onChange, onDone }) {
  return (
    <section aria-label="Vibes" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">What should Genie build into each one?</h3>
          <p className="text-[11px] text-text-secondary">{VIBES_HELP} Each box is optional, and you can vibe the notebook and each output again once they are built.</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-text-primary hover:bg-bg-subtle"
        >
          <Check size={12} aria-hidden="true" /> Done
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[{ id: 'notebook' }, ...IMPLEMENT_OUTPUTS.filter((o) => spec.outputs[o.id])].map((o) => {
          const Icon = ICONS[o.id];
          const value = o.id === 'notebook' ? spec.data.notes : spec.outputs[vibesKey(o.id)];
          return (
            <div key={o.id} data-vibes={o.id} className={`border rounded-lg p-3 space-y-1.5 ${o.id === focus ? 'border-db-red/50 bg-db-red-50/40' : 'border-border'}`}>
              <p className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Icon size={14} aria-hidden="true" /> {vibesLabel(o.id)}</p>
              <VibesEditor id={o.id} value={value || ''} onChange={(next) => onChange(o.id, next)} autoFocus={o.id === focus} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MergeChoice({ name, label, chosen, targets, targetsError, access, onPick }) {
  const list = (targets && targets[name]) || [];
  const target = mergeTargetOf(targets, name, chosen);
  const blockOf = (t) => (name === 'app' ? appMergeBlock({ outputs: { app_access: access } }, t) : '');
  const open = list.find((t) => !blockOf(t)) || null;
  const block = target ? blockOf(target) : '';
  const optionText = (t) => [t.name, `holds ${mergeTargetText(t)}`, name === 'app' ? ACCESS_SHORT[t.access] : '', blockOf(t) ? 'per-user use cases cannot join' : '']
    .filter(Boolean).join(' · ');
  return (
    <div className="pl-7 space-y-1.5" data-merge={name}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={`Where Genie builds the ${label}`} className="inline-flex rounded-md border border-border overflow-hidden">
          <SegmentButton on={!chosen} onClick={() => onPick(null)}>Create new</SegmentButton>
          <SegmentButton on={Boolean(chosen)} disabled={!chosen && !open} onClick={() => { if (!chosen) onPick(open); }}>Add to an existing one</SegmentButton>
        </div>
        {!chosen && targets === null && <span className="text-[11px] text-text-tertiary"><Loader2 size={11} className="inline animate-spin" /> Finding the ones Inspire built</span>}
        {!chosen && targets !== null && !targetsError && !list.length && <span className="text-[11px] text-text-tertiary">Inspire has built none yet</span>}
        {!chosen && targets !== null && !targetsError && list.length > 0 && !open && <span className="text-[11px] text-text-tertiary">none can take a per-user use case</span>}
      </div>
      {targetsError && <p className="text-[11px] text-text-tertiary">Inspire could not list the {label}s it built ({targetsError}), so Genie creates a new one.</p>}
      {chosen && (
        <>
          <select aria-label={`${label} to add this use case to`} className={inputCls} value={chosen} onChange={(e) => onPick(mergeTargetOf(targets, name, e.target.value))}>
            {!target && <option value={chosen}>{chosen}</option>}
            {list.map((t) => <option key={t.id} value={t.id} disabled={Boolean(blockOf(t)) && t.id !== chosen}>{optionText(t)}</option>)}
          </select>
          {target && !block && (
            <p className="text-[11px] text-text-secondary">
              Adds this use case to {target.name}, which holds {mergeTargetText(target)}{name === 'app' ? `; ${target.access === 'user' ? 'each person signs in as themselves' : 'it signs in with its own service principal'}` : ''}.
            </p>
          )}
          {!target && targets !== null && <p className="text-[11px] text-error-fg">{chosen} is not one Inspire built that you can open: pick another, or choose Create new.</p>}
          {block && <p className="text-[11px] text-error-fg">{block}</p>}
        </>
      )}
    </div>
  );
}

function ResultTableStep({ parts, table, defaultTable, catalogs, catalogsError, schemas, outputCheck, onChange }) {
  const set = (key, value) => onChange({ ...parts, [key]: value, ...(key === 'catalog' && value !== parts.catalog ? { schema: '' } : {}) });
  const catalogOptions = [...new Set([parts.catalog, ...(catalogs || [])].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const schemaOptions = [...new Set([parts.schema, ...((schemas && schemas.names) || [])].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const typeCatalog = Boolean(catalogsError);
  const typeSchema = typeCatalog || Boolean(schemas && schemas.error);
  return (
    <section className="space-y-4" aria-label="Where the result table lives">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Where should the result table live?</h3>
        <p className="text-[11px] text-text-tertiary">Genie writes this PoC/MVP&apos;s results to this table, and Inspire writes nowhere else. Next checks live that you can create or write it.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Catalog">
          {typeCatalog ? (
            <input className={inputCls} value={parts.catalog} onChange={(e) => set('catalog', e.target.value.trim())} />
          ) : (
            <select className={inputCls} value={parts.catalog} onChange={(e) => set('catalog', e.target.value)}>
              {!parts.catalog && <option value="">Pick a catalog</option>}
              {catalogOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              {catalogs === null && <option disabled value="__loading__">Loading catalogs…</option>}
            </select>
          )}
        </Field>
        <Field label="Schema">
          {typeSchema ? (
            <input className={inputCls} value={parts.schema} onChange={(e) => set('schema', e.target.value.trim())} />
          ) : (
            <select className={inputCls} value={parts.schema} disabled={!parts.catalog} onChange={(e) => set('schema', e.target.value)}>
              {!parts.schema && <option value="">{parts.catalog ? 'Pick a schema' : 'Pick a catalog first'}</option>}
              {schemaOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              {parts.catalog && !schemas && <option disabled value="__loading__">Loading schemas…</option>}
            </select>
          )}
        </Field>
        <Field label="Table name">
          <input className={inputCls} value={parts.table} onChange={(e) => set('table', e.target.value.trim())} />
        </Field>
      </div>
      {(catalogsError || (schemas && schemas.error)) && (
        <p className="text-[11px] text-text-secondary">
          Inspire could not list the {catalogsError ? 'catalogs' : 'schemas'} ({catalogsError || schemas.error}), so type the name instead.
        </p>
      )}
      <div className="rounded-lg border border-border bg-bg px-3 py-2.5 space-y-1" role="group" aria-label="Result table">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-mono text-[12px] text-text-primary break-all">{table || 'catalog.schema.table'}</span>
          {defaultTable && table === defaultTable && <span className={LEGEND}>Inspire&apos;s default</span>}
          {defaultTable && table !== defaultTable && (
            <button type="button" className="text-[11px] text-db-red-fg shrink-0" onClick={() => onChange(resultTableParts(defaultTable))}>
              Use the default, {defaultTable}
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-tertiary">The default sits in the Inspire Database and is named after the use case.</p>
      </div>
      {outputCheck && (
        <div className="text-[11px] space-y-0.5" aria-label="Result table check">
          <p className={outputCheck.write?.ok ? 'text-success-fg' : 'text-error-fg'}>{outputCheck.write?.detail}</p>
          {outputCheck.write?.ok && <p className={outputCheck.safety?.ok ? 'text-success-fg' : 'text-error-fg'}>{outputCheck.safety?.detail}</p>}
          {outputCheck.model && <p className={outputCheck.model.ok ? 'text-success-fg' : 'text-error-fg'}>{outputCheck.model.detail}</p>}
          {outputCheck.write?.ok && outputCheck.safety?.ok && <p className="text-text-tertiary">Sharing: {outputCheck.grant?.detail}</p>}
          {outputCheck.identity && <p className="text-text-tertiary">Checked live as {outputCheck.identity}.</p>}
        </div>
      )}
      <p role="note" aria-label="Moving the result table" className="text-[11px] text-text-secondary">{RESULT_TABLE_MOVE_NOTE}</p>
    </section>
  );
}

function HoldoutSetting({ spec, onEnabled, onPercent }) {
  const { enabled } = holdoutOf(spec);
  const problem = holdoutProblems(spec)[0] || '';
  return (
    <fieldset className="space-y-2" aria-label="Measure impact">
      <legend className="text-sm font-semibold text-text-primary">Measure impact</legend>
      <label className="flex items-start gap-2.5 cursor-pointer pt-1">
        <input type="checkbox" className="mt-0.5" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        <span className="text-[11px] text-text-secondary">
          <span className="text-[12px] font-medium text-text-primary">{HOLDOUT_LABEL}</span>. {HOLDOUT_BLURB}
        </span>
      </label>
      {enabled && (
        <label className="ml-6 flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
          Hold back
          <input
            type="number"
            inputMode="numeric"
            min={HOLDOUT_MIN_PERCENT}
            max={HOLDOUT_MAX_PERCENT}
            step="1"
            aria-label="Share of records held back, in percent"
            className={`${inputBase} w-20`}
            value={holdoutPercentText(spec)}
            onChange={(e) => onPercent(e.target.value)}
          />
          % of the records ({HOLDOUT_MIN_PERCENT} to {HOLDOUT_MAX_PERCENT}), picked at random and kept the same on every run
        </label>
      )}
      {problem && <p className="ml-6 text-[11px] text-error-fg">{problem}</p>}
    </fieldset>
  );
}

function AppBackendChoice({ spec, target, lakebase, onBackend }) {
  if (lakebase?.state === 'absent') return null;
  const backend = appBackendOf(spec, lakebase);
  const block = lakebaseBlock(spec, lakebase);
  const loading = lakebase === null && !block;
  const chosen = loading ? null : APP_BACKEND_CHOICES.find((choice) => choice.id === backend);
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold text-text-primary">Where does the App read its data?</legend>
      {target ? (
        <p className="text-[11px] text-text-secondary" role="note" aria-label="Why the data source is set">
          This use case joins {target.name}, which keeps reading its data where it does today.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 pt-1">
            {APP_BACKEND_CHOICES.map((choice) => {
              const off = loading || (choice.id === 'lakebase' && Boolean(block));
              const checked = !loading && backend === choice.id;
              return (
                <label
                  key={choice.id}
                  aria-disabled={off ? 'true' : undefined}
                  className={`inline-flex items-center gap-2 text-sm glow-focus ${off ? 'cursor-not-allowed text-text-secondary' : 'cursor-pointer text-text-primary'}`}
                >
                  <input type="radio" name="app-backend" value={choice.id} checked={checked} disabled={off} onChange={() => onBackend(choice.id)} />
                  <span className={checked ? 'font-semibold' : 'font-medium'}>{choice.label}</span>
                </label>
              );
            })}
          </div>
          {chosen && <p className="text-[12px] text-text-secondary">{chosen.blurb}</p>}
          {loading && <p className="text-[11px] text-text-tertiary" role="status">{LAKEBASE_CHECKING}…</p>}
          {block && <p className="text-[11px] text-text-secondary" role="note" aria-label="Why Lakebase is off">{block}</p>}
          {lakebase?.state === 'unknown' && !block && (
            <p className="text-[11px] text-text-secondary" role="note" aria-label="Lakebase not checked">
              Inspire could not check Lakebase ({lakebase.detail}). If the build cannot use it, the App reads Delta tables and the build says why.
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}

function AppAccessStep({ spec, target, lakebase, onAccess, onOption, onBackend }) {
  const access = spec.outputs.app_access;
  const options = spec.outputs.app_options;
  const block = appMergeBlock({ outputs: { app_access: 'user' } }, target);
  return (
    <section className="space-y-4" aria-label="App access">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-text-primary">Who does the App sign people in as?</legend>
        <p className="text-[11px] text-text-tertiary">
          Required, with no default: it decides whose access every page, chart and Genie answer reads with.{target ? ` This use case joins ${target.name}.` : ''}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {APP_ACCESS_CHOICES.map((choice) => {
            const Icon = ACCESS_ICONS[choice.id];
            const blocked = choice.id === 'user' && Boolean(block);
            const checked = access === choice.id;
            return (
              <label
                key={choice.id}
                aria-disabled={blocked ? 'true' : undefined}
                className={`flex items-start gap-2.5 border rounded-lg p-3 glow-focus ${blocked ? 'cursor-not-allowed border-dashed border-border bg-bg-subtle' : `cursor-pointer ${checked ? 'border-db-red bg-db-red-50' : 'border-border hover:border-border-strong'}`}`}
              >
                <input type="radio" name="app-access" value={choice.id} checked={checked} disabled={blocked} onChange={() => onAccess(choice.id)} className="mt-0.5" />
                <span className="space-y-1">
                  <span className="flex items-start gap-1.5 text-sm font-semibold text-text-primary"><Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{choice.label}</span>
                  <span className="block text-[12px] text-text-secondary">{choice.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
        {block && <p className="text-[11px] text-error-fg" role="note" aria-label="Why per-user sign-in is off">{block}</p>}
        {target && target.access === 'user' && access === 'sp' && (
          <p className="text-[11px] text-text-secondary">{target.name} signs each person in as themselves, so this use case&apos;s page does too.</p>
        )}
      </fieldset>
      <AppBackendChoice spec={spec} target={target} lakebase={lakebase} onBackend={onBackend} />
      <fieldset className="space-y-2">
        <legend className={LEGEND}>What people can do in the App</legend>
        <p className="text-[11px] text-text-tertiary">Each one stays off unless you turn it on.</p>
        <div className="space-y-2.5 pt-1">
          {APP_OPTIONS.filter((o) => appOptionShown(spec, o.id)).map((o) => (
            <div key={o.id}>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={Boolean(options[o.id])} onChange={(e) => onOption(o.id, e.target.checked)} />
                <span className="text-[11px] text-text-secondary">
                  <span className="text-[12px] font-medium text-text-primary">{o.label}</span>. {o.blurb}
                </span>
              </label>
              {o.id === 'modify' && appOptionShown(spec, 'replace_edits') && (
                <div role="radiogroup" aria-label={REPLACE_EDITS_QUESTION} className="ml-6 mt-2 border-l-2 border-border pl-3 space-y-1">
                  <p className="text-[12px] font-medium text-text-primary">{REPLACE_EDITS_QUESTION}</p>
                  {REPLACE_EDITS_CHOICES.map((c) => (
                    <label key={String(c.id)} className="flex items-start gap-2 text-[11px] cursor-pointer">
                      <input type="radio" name="replace-edits" className="mt-0.5" checked={Boolean(options.replace_edits) === c.id} onChange={() => onOption('replace_edits', c.id)} />
                      <span>
                        <span className="font-medium text-text-primary">{c.label}{c.id ? '' : ' (default)'}</span>
                        <span className="text-text-secondary">: {c.blurb}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {access === 'user' && <p className="text-[11px] text-text-secondary" role="note" aria-label="Why some options are hidden">{PER_USER_REASON}</p>}
        <p className="text-[11px] text-text-secondary" role="note" aria-label="What every App offers"><span>{APP_REFRESH_NOTE}</span> <span>{APP_NO_DOWNLOADS}</span></p>
      </fieldset>
    </section>
  );
}

function paletteVars(palette, theme) {
  const p = palette ? palette[theme === 'dark' ? 'dark' : 'light'] : null;
  if (!p || !p.base || !p.hues) return null;
  const vars = {};
  for (const [key, value] of Object.entries(p.base)) vars[`--pv-${key}`] = value;
  Object.values(p.hues).forEach((hue, i) => {
    for (const [key, value] of Object.entries(hue)) vars[`--pv-h${i}-${key}`] = value;
  });
  return vars;
}

const pv = (name) => `var(--pv-${name})`;
const BARS = [45, 70, 55, 90, 65, 80];

function PreviewBars({ hue = 0 }) {
  return BARS.map((h, i) => <span key={i} className="block flex-1 rounded-t-[1px]" style={{ height: `${h}%`, background: pv(`h${(hue + i) % 3}-line`) }} />);
}

function StylePreview({ style, palette, theme }) {
  const vars = paletteVars(palette, theme);
  if (!vars) return <span aria-hidden="true" className="block h-[68px] rounded-md bg-bg-subtle animate-pulse" />;
  const card = { background: pv('card'), border: `1px solid ${pv('line')}` };
  if (style === 'b') {
    return (
      <span aria-hidden="true" data-preview="style-b" className="flex h-[68px] flex-col gap-1 overflow-hidden rounded-md p-1.5" style={{ ...vars, background: pv('bg') }}>
        <span className="flex items-center justify-between rounded-[6px] px-1.5 py-[3px]" style={{ background: pv('h0-bg'), border: `1px solid ${pv('line')}` }}>
          <span className="text-[9px] font-semibold leading-none" style={{ color: pv('h0-ink') }}>Aa</span>
          <span className="block h-[6px] w-5 rounded-full" style={{ border: `1px solid ${pv('line-strong')}`, background: pv('card') }} />
        </span>
        <span className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => <span key={i} className="block h-[12px] rounded-[4px]" style={{ background: pv(`h${i}-bg`), border: `1px solid ${pv('line')}`, borderLeft: `3px solid ${pv(`h${i}-line`)}` }} />)}
        </span>
        <span className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[6px]" style={card}>
          <span className="block h-[5px] shrink-0" style={{ background: pv('h0-bg'), borderBottom: `1px solid ${pv('line')}` }} />
          <span className="flex flex-1 items-end gap-[3px] px-1.5 pb-1"><PreviewBars /></span>
        </span>
      </span>
    );
  }
  if (style === 'c') {
    return (
      <span aria-hidden="true" data-preview="style-c" className="flex h-[68px] flex-col gap-1 overflow-hidden rounded-md p-1.5" style={{ ...vars, background: pv('card'), border: `1px solid ${pv('line')}` }}>
        <span className="text-[13px] font-semibold leading-none" style={{ color: pv('ink'), fontFamily: 'Georgia, "Times New Roman", serif' }}>Aa</span>
        <span className="grid grid-cols-3" style={{ borderTop: `1px solid ${pv('line')}`, borderBottom: `1px solid ${pv('line')}` }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex h-[12px] items-center px-1" style={i ? { borderLeft: `1px solid ${pv('line')}` } : undefined}>
              <span className="block h-[5px] w-3/5 rounded-sm" style={{ background: pv(`h${i}-ink`) }} />
            </span>
          ))}
        </span>
        <span className="flex min-h-0 flex-1 items-end gap-[3px] rounded-[6px] px-1.5 pb-1 pt-1" style={{ background: pv('well') }}><PreviewBars /></span>
      </span>
    );
  }
  return (
    <span aria-hidden="true" data-preview="style-a" className="flex h-[68px] flex-col gap-1 overflow-hidden rounded-md p-1.5" style={{ ...vars, background: pv('bg') }}>
      <span className="text-[9px] font-semibold leading-none" style={{ color: pv('ink') }}>Aa</span>
      <span className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="relative block h-[12px] overflow-hidden rounded-[3px]" style={{ ...card, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
            <span className="absolute left-1 top-[3px] block h-[3px] w-1/2 rounded-sm" style={{ background: pv('muted') }} />
            <span className="absolute bottom-0 left-1 right-1 block h-[2px] rounded-t-sm" style={{ background: pv(`h${i}-line`) }} />
          </span>
        ))}
      </span>
      <span className="flex min-h-0 flex-1 items-end gap-[3px] rounded-[3px] px-1.5 pb-1 pt-1" style={card}><PreviewBars /></span>
    </span>
  );
}

function LayoutPreview({ layout, palette, theme }) {
  const vars = paletteVars(palette, theme);
  if (!vars) return <span aria-hidden="true" className="block h-[52px] rounded-md bg-bg-subtle animate-pulse" />;
  const card = (i) => <span key={i} className="block min-h-0 flex-1 rounded-[3px]" style={{ background: pv('card'), border: `1px solid ${pv('line')}` }} />;
  const frame = { ...vars, background: pv('bg'), border: `1px solid ${pv('line')}` };
  if (layout === 'tabs') {
    return (
      <span aria-hidden="true" data-preview="layout-tabs" className="flex h-[52px] flex-col overflow-hidden rounded-md" style={frame}>
        <span className="flex items-end gap-1.5 px-1.5 pt-1.5" style={{ background: pv('card'), borderBottom: `1px solid ${pv('line')}` }}>
          {[0, 1, 2].map((i) => <span key={i} className="block h-[7px] w-5" style={{ borderBottom: `2px solid ${i ? 'transparent' : pv('brand')}` }}><span className="block h-[3px] w-full rounded-sm" style={{ background: i ? pv('faint') : pv('ink') }} /></span>)}
        </span>
        <span className="flex flex-1 gap-1 p-1.5">{[0, 1].map(card)}</span>
      </span>
    );
  }
  if (layout === 'home') {
    return (
      <span aria-hidden="true" data-preview="layout-home" className="flex h-[52px] flex-col gap-1 overflow-hidden rounded-md p-1.5" style={frame}>
        <span className="block h-[4px] w-1/3 rounded-sm" style={{ background: pv('ink') }} />
        <span className="grid flex-1 grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => <span key={i} className="block rounded-[3px]" style={{ background: pv('card'), border: `1px solid ${pv('line')}`, borderTop: `2px solid ${pv(`h${i}-line`)}` }} />)}
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden="true" data-preview="layout-sidebar" className="flex h-[52px] overflow-hidden rounded-md" style={frame}>
      <span className="flex w-[30%] flex-col gap-1 p-1.5" style={{ background: pv('panel'), borderRight: `1px solid ${pv('line')}` }}>
        {[0, 1, 2].map((i) => <span key={i} className="block h-[5px] rounded-sm" style={i ? { background: pv('line-strong') } : { background: pv('brand-wash'), borderLeft: `2px solid ${pv('brand')}` }} />)}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-1.5">
        <span className="block h-[4px] w-1/2 rounded-sm" style={{ background: pv('ink') }} />
        <span className="flex flex-1 gap-1">{[0, 1].map(card)}</span>
      </span>
    </span>
  );
}

function LookCard({ name, value, checked, onChange, label, badge = '', blurb = '', children }) {
  return (
    <label className={`block border rounded-lg p-2 space-y-1.5 cursor-pointer glow-focus ${checked ? 'border-db-red bg-db-red-50' : 'border-border hover:border-border-strong'}`}>
      {children}
      <span className="flex items-center gap-2">
        <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
        <span className="text-[12px] font-semibold text-text-primary">{label}</span>
        {badge && <span className="ml-auto rounded-full border border-border bg-surface px-1.5 py-px text-[10px] text-text-secondary">{badge}</span>}
      </span>
      {blurb && <span className="block text-[11px] leading-snug text-text-secondary">{blurb}</span>}
    </label>
  );
}

const paletteLabel = (id) => id.charAt(0).toUpperCase() + id.slice(1);

function AppLookStep({ spec, look, lookError, palette, target, onLook }) {
  const chosen = spec.outputs.app_look;
  const palettes = look?.palette_colors || [];
  return (
    <section className="space-y-4" aria-label="App look">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">How should the App look?</h3>
        <p className="text-[11px] text-text-tertiary">
          Each preview draws with the palette and the mode you pick.{target ? ` The look applies to every use case in ${target.name}.` : ''}
        </p>
        {lookError && <p className="text-[11px] text-error-fg">Inspire could not read the App looks from its agent notebook: {lookError}</p>}
      </div>
      <fieldset className="space-y-2">
        <legend className={LEGEND}>Style</legend>
        <div className="grid grid-cols-3 gap-3 pt-1">
          {APP_STYLES.map((s) => (
            <LookCard key={s.id} name="app-style" value={s.id} checked={chosen.style === s.id} onChange={() => onLook('style', s.id)}
              label={s.label} badge={s.id === 'a' ? 'Lakeview look' : ''} blurb={s.blurb}>
              <StylePreview style={s.id} palette={palette} theme={chosen.theme} />
            </LookCard>
          ))}
        </div>
        <p className="text-[11px] text-text-secondary">{LAKEVIEW_STYLE_NOTE}</p>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className={LEGEND}>Layout</legend>
        <div className="grid grid-cols-3 gap-3 pt-1">
          {APP_LAYOUTS.map((l) => (
            <LookCard key={l.id} name="app-layout" value={l.id} checked={chosen.layout === l.id} onChange={() => onLook('layout', l.id)} label={l.label} blurb={l.blurb}>
              <LayoutPreview layout={l.id} palette={palette} theme={chosen.theme} />
            </LookCard>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-[1fr_auto] items-start gap-5">
        <fieldset className="space-y-2">
          <legend className={LEGEND}>Palette</legend>
          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {(palettes.length ? palettes : (look?.palettes || [])).map((p) => {
              const id = typeof p === 'string' ? p : p.id;
              const colors = typeof p === 'string' ? null : p[chosen.theme === 'dark' ? 'dark' : 'light'];
              const checked = chosen.palette === id;
              return (
                <label key={id} className={`block cursor-pointer rounded-md p-1 glow-focus ${checked ? 'bg-db-red-50 ring-2 ring-db-red' : 'hover:bg-bg-subtle'}`}>
                  <input type="radio" name="app-palette" value={id} className="sr-only" checked={checked} onChange={() => onLook('palette', id)} />
                  <span aria-hidden="true" data-swatch={id} className="flex h-6 gap-px overflow-hidden rounded p-[3px]"
                    style={colors ? { background: colors.base.bg, border: `1px solid ${colors.base['line-strong'] || colors.base.line}` } : undefined}>
                    {colors && Object.values(colors.hues).map((hue, i) => <span key={i} className="block flex-1 rounded-[1px]" style={{ background: hue.line }} />)}
                  </span>
                  <span className="mt-1 block text-center text-[10px] text-text-secondary">{paletteLabel(id)}</span>
                </label>
              );
            })}
            {!look && !lookError && Array.from({ length: 13 }, (_, i) => <span key={i} aria-hidden="true" className="block h-[46px] rounded-md bg-bg-subtle animate-pulse" />)}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className={LEGEND}>Mode</legend>
          <div role="group" aria-label="Light or dark" className="inline-flex rounded-lg border border-border overflow-hidden mt-1">
            {APP_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={chosen.theme === t.id}
                onClick={() => onLook('theme', t.id)}
                className={`px-4 py-1.5 text-xs font-medium border-r border-border last:border-r-0 ${chosen.theme === t.id ? 'bg-db-red-solid text-white' : 'bg-surface text-text-secondary hover:text-text-primary'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}

function ValuePicker({ label, values, selected, onLoad, onChange }) {
  const shown = values ? [...new Set([...selected, ...values])] : selected;
  const toggle = (value) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-secondary">{label}</span>
        {!values && <button type="button" className="text-[11px] text-db-red-fg" onClick={onLoad}>Load values</button>}
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

function Overlay({ title, uc, steps, step, onClose, children }) {
  const row = uc ? catalogRow(uc, 0) : null;
  const facts = row ? [['ID', row.id], ['Domain', row.domain], ['Subdomain', row.subdomain], ['Technique', row.technique]].filter(([, v]) => v) : [];
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-implement-overlay="">
        <div role="dialog" aria-modal="true" aria-label={title ? `${START_POC_LABEL}: ${title}` : START_POC_LABEL} className="bg-surface border border-border rounded-xl shadow-elevated w-full max-w-3xl max-h-full flex flex-col overflow-hidden">
          <header className="px-6 pt-4 pb-3 border-b border-border space-y-3" data-wizard-header="">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-db-red-fg">{START_POC_LABEL}</p>
                <h2 className="mt-1 text-lg font-semibold leading-snug text-text-primary break-words">{title}</h2>
                {facts.length > 0 && (
                  <ul aria-label="About this use case" className="mt-2 flex flex-wrap gap-1.5">
                    {facts.map(([label, value]) => (
                      <li key={label} className="rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-[11px] text-text-secondary">
                        <span className="text-text-tertiary">{label}</span> <span className="font-medium text-text-primary">{value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="button" onClick={onClose} className="shrink-0 text-text-tertiary hover:text-text-primary" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <ol className="flex flex-wrap items-center gap-2 text-[11px]">
              {steps.map((item, i) => (
                <li
                  key={item.id}
                  aria-current={i === step ? 'step' : undefined}
                  className={`px-2.5 py-1 rounded-full ${i === step ? 'bg-db-red-50 text-db-red-fg font-semibold' : i < step ? 'text-text-primary' : 'text-text-tertiary'}`}
                >
                  {i + 1}. {item.label}
                </li>
              ))}
            </ol>
            <span className="sr-only">Step {step + 1} of {steps.length}</span>
          </header>
          {children}
        </div>
      </div>
    </BodyPortal>
  );
}
