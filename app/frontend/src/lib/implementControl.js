import { IMPLEMENT_OUTPUTS } from './implementWizard.js';
import { formatWhen } from './formatWhen.js';

export const CONTROL_REFRESH_MS = 15000;

const APP_STATES = {
  ACTIVE: { label: 'Running', tone: 'success', actions: [['stop', 'Stop the App']] },
  STOPPED: { label: 'Stopped', tone: 'idle', actions: [['start', 'Start the App']] },
  ERROR: { label: 'Compute failed', tone: 'error', actions: [['start', 'Start the App']] },
  STARTING: { label: 'Starting', tone: 'busy', actions: [] },
  STOPPING: { label: 'Stopping', tone: 'busy', actions: [] },
  UPDATING: { label: 'Updating', tone: 'busy', actions: [] },
  DELETING: { label: 'Deleting', tone: 'busy', actions: [] },
};

const action = (asset, name, label, danger = false) => ({ asset, action: name, label, danger });

function unreadable(entry) {
  return { state: { label: 'Cannot read', tone: 'error' }, detail: entry?.error || 'Inspire has not read it yet', actions: [] };
}

function appRow(entry) {
  if (!entry?.ok) return unreadable(entry);
  const known = APP_STATES[entry.compute_state] || { label: entry.compute_state || 'Unknown', tone: 'warning', actions: [] };
  const actions = known.actions.map(([name, label]) => action('app', name, label, name === 'stop'));
  if (entry.compute_state === 'ACTIVE' && entry.app_state && entry.app_state !== 'RUNNING') {
    return { state: { label: `App ${entry.app_state.toLowerCase()}`, tone: 'error' }, detail: entry.app_message || 'The compute is on but the App is not running', actions };
  }
  const quiet = entry.compute_state === 'ACTIVE' && entry.app_state === 'RUNNING';
  return { state: { label: known.label, tone: known.tone }, detail: quiet ? '' : entry.app_message || '', actions };
}

function dashboardRow(entry) {
  if (!entry?.ok) return unreadable(entry);
  if (entry.trashed) return { state: { label: 'In the trash', tone: 'error' }, detail: '', actions: [] };
  const when = entry.published_at ? `Published ${formatWhen(entry.published_at, entry.published_at)}` : 'Published';
  if (entry.published && entry.embedded) {
    return {
      state: { label: 'Shares its publisher’s access', tone: 'warning' },
      detail: `${when} with the publisher’s credentials, so anyone who can open it reads the data as the publisher. Publish again so each viewer reads it with their own access`,
      actions: [action('dashboard', 'publish', 'Publish again'), action('dashboard', 'unpublish', 'Unpublish', true)],
    };
  }
  return entry.published
    ? { state: { label: 'Published', tone: 'success' }, detail: entry.published_at ? when : '', actions: [action('dashboard', 'unpublish', 'Unpublish', true)] }
    : { state: { label: 'Not published', tone: 'idle' }, detail: 'People with access cannot open the published view', actions: [action('dashboard', 'publish', 'Publish')] };
}

function genieRow(entry) {
  return entry?.ok ? { state: { label: 'Live', tone: 'success' }, detail: '', actions: [] } : unreadable(entry);
}

function alertRow(entry) {
  if (!entry?.ok) return unreadable(entry);
  if (entry.trashed) return { state: { label: 'In the trash', tone: 'error' }, detail: '', actions: [] };
  const when = entry.checked_at ? ` (checked ${formatWhen(entry.checked_at, entry.checked_at)})` : '';
  if (entry.state === 'TRIGGERED') return { state: { label: 'Triggered', tone: 'warning' }, detail: `The latest check found rows to act on${when}`, actions: [] };
  if (entry.state === 'OK') return { state: { label: 'OK', tone: 'success' }, detail: `The latest check found nothing to act on${when}`, actions: [] };
  if (entry.state === 'ERROR') return { state: { label: 'Check failed', tone: 'error' }, detail: `The alert query failed on its latest check${when}; open the alert to see why`, actions: [] };
  if (entry.state && entry.state !== 'UNKNOWN') return { state: { label: entry.state, tone: 'warning' }, detail: when.trim(), actions: [] };
  return { state: { label: 'Not checked yet', tone: 'idle' }, detail: 'It checks after each run of the job', actions: [] };
}

const OUTPUT_ROWS = { dashboard: dashboardRow, genie_space: genieRow, app: appRow, alert: alertRow };
const OUTPUT_URLS = { dashboard: 'dashboard_url', genie_space: 'genie_space_url', app: 'app_url', alert: 'alert_url' };
const OUTPUT_NAMES = { dashboard: (a) => a?.name, genie_space: (a) => a?.title, app: (a) => a?.name, alert: (a) => a?.name };

function jobRow(entry, spec) {
  const scheduled = Boolean(spec?.schedule?.enabled);
  const schedule = { label: scheduled ? 'Pause the schedule' : 'Resume the schedule', on: scheduled };
  if (!entry?.ok) return { ...unreadable(entry), schedule };
  const plan = entry.schedule
    ? `${entry.schedule.paused ? 'Schedule paused' : 'Scheduled'}: ${entry.schedule.cron} (${entry.schedule.timezone})`
    : 'No schedule';
  const runs = entry.active_runs;
  if (runs == null) {
    return { state: { label: 'Runs unknown', tone: 'error' }, detail: `${plan}. Inspire cannot read its runs: ${entry.runs_error || 'no answer'}`, actions: [], schedule };
  }
  if (!runs.length) return { state: { label: 'Idle', tone: 'idle' }, detail: plan, actions: [], schedule };
  return {
    state: { label: `${runs.length} running`, tone: 'busy' }, detail: plan, schedule, url: runs[0].url || '',
    actions: [action('job', 'cancel', 'Stop the running job', true)],
  };
}

function builtWarnings(latest, id) {
  const warnings = latest?.asset_status?.[id]?.warnings;
  return Array.isArray(warnings) ? warnings.map((w) => String(w ?? '').trim()).filter(Boolean) : [];
}

export function controlRows(live, latest) {
  const assets = live?.assets || {};
  const targets = live?.targets || {};
  const spec = latest?.spec_json || {};
  const rows = [];
  if (targets.build) {
    rows.push({ id: 'build', label: 'Build', name: `spec v${latest?.spec_version ?? ''}`, removable: false,
      state: { label: 'Building', tone: 'busy' }, detail: latest?.status || '', actions: [action('build', 'cancel', 'Stop the build', true)] });
  }
  if (targets.job) rows.push({ id: 'job', label: 'Job', name: `job ${targets.job}`, removable: false, ...jobRow(assets.job, spec) });
  for (const output of IMPLEMENT_OUTPUTS) {
    if (!targets[output.id]) continue;
    const entry = assets[output.id];
    rows.push({
      id: output.id,
      label: output.label,
      name: OUTPUT_NAMES[output.id](entry) || String(targets[output.id]),
      url: latest?.[OUTPUT_URLS[output.id]] || entry?.url || '',
      removable: true,
      warnings: builtWarnings(latest, output.id),
      ...OUTPUT_ROWS[output.id](entry),
    });
  }
  return rows;
}

const DELIVERED_WORDS = { dashboard: ['dashboard', 'dashboards'], genie_space: ['Genie Agent', 'Genie Agents'], app: ['App', 'Apps'], alert: ['alert', 'alerts'] };

export function deliveredOutputs(latest) {
  return IMPLEMENT_OUTPUTS.filter((output) => latest?.[OUTPUT_URLS[output.id]]).map((output) => output.id);
}

export function buildSummary(items) {
  const list = Array.isArray(items) ? items : [];
  const pocs = list.filter((item) => item.state?.kind === 'poc');
  const inGroup = (group) => pocs.filter((item) => item.state.group === group);
  const delivered = IMPLEMENT_OUTPUTS
    .map((output) => {
      const count = pocs.filter((item) => deliveredOutputs(item.latest).includes(output.id)).length;
      return { id: output.id, count, text: `${count} ${DELIVERED_WORDS[output.id][count === 1 ? 0 : 1]}` };
    })
    .filter((entry) => entry.count > 0);
  return {
    pocs: pocs.length,
    building: inGroup('in_progress'),
    ready: inGroup('ready').length,
    failed: inGroup('failed').length,
    notebooks: list.filter((item) => item.state?.kind === 'notebook' && item.notebook?.state === 'ready').length,
    notStarted: list.filter((item) => item.state?.group === 'not_started').length,
    delivered,
  };
}

export function controlTiles(live, latest, { active = false, buildingNow = '' } = {}) {
  const rows = controlRows(live, latest);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chosen = latest?.spec_json?.outputs || {};
  const assets = latest?.asset_status || {};
  return {
    strips: rows.filter((row) => row.id === 'build' || row.id === 'job'),
    tiles: IMPLEMENT_OUTPUTS.map((output) => {
      const row = byId.get(output.id);
      if (row) return { output, kind: 'live', row };
      if (!chosen[output.id]) return { output, kind: 'off' };
      if (active) return { output, kind: 'building', now: buildingNow === output.label };
      if (assets[output.id]?.state === 'failed') return { output, kind: 'failed', error: String(assets[output.id].error || '') };
      if (!live) return { output, kind: 'checking' };
      return { output, kind: 'missing' };
    }),
  };
}

export function removeChanges(latest, output) {
  const spec = latest?.spec_json || {};
  return {
    outputs: { ...(spec.outputs || {}), [output]: false },
    removed_outputs: { ...(spec.removed_outputs || {}), [output]: 'delete' },
  };
}

export function removeConfirmed(typed, useCaseId) {
  return Boolean(useCaseId) && String(typed ?? '').trim() === String(useCaseId);
}

export function controlActionText(entry) {
  const who = entry?.acted_by ? ` by ${entry.acted_by}` : '';
  const when = entry?.acted_at ? `, ${formatWhen(entry.acted_at, entry.acted_at)}` : '';
  return `${entry?.message || `${entry?.asset} ${entry?.action}`}${who}${when}`;
}
