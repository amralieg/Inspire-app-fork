import { IMPLEMENT_OUTPUTS, IMPLEMENT_ACTIVE_STATUSES, IMPLEMENT_DONE_STATUSES, joinWords, partLabel } from './implementWizard.js';
import { formatDuration } from './formatWhen.js';

export const MVP_BUILD_STAGES = [
  { id: 'Plan', label: 'Plan', working: 'Inspire is working out what this version rebuilds' },
  { id: 'Instruction', label: 'Instruction', working: 'Inspire is writing the Genie Code instruction' },
  { id: 'Genie Code', label: 'Start Genie Code', working: 'Inspire is starting Genie Code' },
  { id: 'Genie build', label: 'Genie builds the notebook', working: 'Genie is building the notebook' },
  { id: 'Preview run', label: 'Preview run', working: 'Inspire is running the notebook on a preview' },
];
const STAGE = Object.fromEntries(MVP_BUILD_STAGES.map((s) => [s.id, s]));
const VIBE_STAGE = { id: 'Vibe', label: 'Vibe', working: 'Inspire is reading your vibe to send each ask to the part it changes' };

export const MVP_BUILD_ORDER = ['genie_space', 'dashboard', 'alert', 'app'];
const OUTPUT_LABEL = Object.fromEntries(IMPLEMENT_OUTPUTS.map((o) => [o.id, o.label]));
const PLAN_PHASE = 'Plan';
const VIBE_PHASE = 'Vibe';
const GENIE_ACTIONS = ['build', 'rollback_built', 'rebuild'];

const EARLIER_PHASES = { genie_space: ['Genie space'] };

const FINISH_STAGE = { id: 'Done', label: 'Done', working: 'Inspire is scheduling and sharing the MVP', phases: ['Schedule', 'Sharing', 'Done'] };

function finishWords(plan) {
  if (plan.schedule && plan.sharing) return FINISH_STAGE.working;
  if (plan.schedule) return 'Inspire is scheduling the job';
  if (plan.sharing) return 'Inspire is sharing the MVP';
  return 'Inspire is finishing this version';
}

const STEP_STATES = { started: 'running', ended_success: 'done', ended_warning: 'warning', ended_error: 'error' };
export const MVP_REPAIR_PHASE = 'Self-repair';
const WHOLE_BUILD = 'the MVP build';
const RUN_STARTING_STATES = ['PENDING', 'QUEUED', 'BLOCKED'];

function stepPayload(row) {
  let payload = row?.result_json;
  if (typeof payload === 'string' && payload) {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function stepPhase(row, payload) {
  const phase = String(payload.phase || '');
  if (phase) return phase;
  const named = /^Inspire is working on (.+)$/i.exec(String(row?.step_name || ''));
  return named ? named[1] : '';
}

function timeOf(value) {
  const ms = Date.parse(String(value || '').replace(' ', 'T'));
  return Number.isFinite(ms) ? ms : null;
}

function stepEvents(steps) {
  return (steps || [])
    .map((row, order) => {
      const payload = stepPayload(row);
      return { row, payload, order, at: timeOf(payload.event_at) ?? timeOf(row?.last_updated) };
    })
    .sort((a, b) => ((a.at ?? Infinity) - (b.at ?? Infinity)) || a.order - b.order);
}

function sameVersion(payload, latest) {
  const ours = Number(latest?.spec_version);
  const theirs = Number(payload.spec_version);
  return !Number.isFinite(ours) || !Number.isFinite(theirs) || ours === theirs;
}

export function mvpRepairOf(steps, latest) {
  let found = null;
  for (const { row, payload, at } of stepEvents(steps)) {
    const attempt = Number(payload.attempt);
    if (stepPhase(row, payload) !== MVP_REPAIR_PHASE || !Number.isInteger(attempt) || attempt < 2 || !sameVersion(payload, latest)) continue;
    const attempts = Number(payload.attempts);
    found = {
      attempt,
      attempts: Number.isInteger(attempts) && attempts >= attempt ? attempts : null,
      step: String(payload.step || WHOLE_BUILD),
      why: String(payload.why || '').trim(),
      at,
    };
  }
  return found;
}

function repairLine(repair, status) {
  if (!repair) return '';
  const count = `${repair.attempt}${repair.attempts ? ` of ${repair.attempts}` : ''}`;
  const part = repair.step === WHOLE_BUILD ? '' : ` for ${repair.step}`;
  if (IMPLEMENT_ACTIVE_STATUSES.includes(status)) return `Attempt ${count}${part}: Inspire is fixing it${repair.why ? `: ${repair.why}` : ''}`;
  if (IMPLEMENT_DONE_STATUSES.includes(status)) return `Built on attempt ${count}${part}${repair.why ? `. What Inspire fixed: ${repair.why}` : ''}`;
  return '';
}

function roundOf(payload) {
  const round = Number(payload.round);
  if (!Number.isInteger(round) || round < 1) return null;
  return payload.failure ? round + 1 : round;
}

const isPhase = (row, payload, phase) => stepPhase(row, payload).toLowerCase() === phase.toLowerCase();
const isMap = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const outputList = (value) => (Array.isArray(value) ? [...new Set(value.map(String).filter((id) => Object.hasOwn(OUTPUT_LABEL, id)))] : []);
const versionMap = (value, read) => Object.fromEntries(Object.entries(isMap(value) ? value : {})
  .map(([id, entry]) => [id, Number(read(entry))]).filter(([id, version]) => Object.hasOwn(OUTPUT_LABEL, id) && Number.isInteger(version) && version > 0));

export const PLAN_PENDING = Object.freeze({ pending: true });

function normalPlan(plan) {
  return {
    pending: false,
    classes: Array.isArray(plan.classes) ? plan.classes.map(String) : [],
    refill: plan.refill === true,
    preview: plan.preview === true,
    build: outputList(plan.build),
    refresh: outputList(plan.refresh),
    restyle: outputList(plan.restyle),
    repoint: outputList(plan.repoint),
    delete: outputList(plan.delete),
    keep_unmanaged: outputList(plan.keep_unmanaged),
    rollback: versionMap(plan.rollback, (entry) => entry),
    rollback_built: versionMap(plan.rollback_built, (entry) => entry?.version),
    schedule: plan.schedule === true,
    sharing: plan.sharing === true,
  };
}

export function versionPlan(steps, latest) {
  let recorded = false;
  let vibed = false;
  let plan = null;
  for (const { row, payload } of stepEvents(steps)) {
    if (!sameVersion(payload, latest)) continue;
    if (isPhase(row, payload, VIBE_PHASE)) vibed = true;
    if (!isPhase(row, payload, PLAN_PHASE)) continue;
    recorded = true;
    if (isMap(payload.plan)) plan = normalPlan(payload.plan);
  }
  if (plan) return plan;
  if (recorded) return null;
  const status = String(latest?.status || '');
  return status === 'queued' || (status === 'failed' && vibed) ? PLAN_PENDING : null;
}

export function planActions(plan) {
  if (!plan || plan.pending) return [];
  const removed = MVP_BUILD_ORDER.filter((id) => plan.delete.includes(id)).map((id) => ({ id, action: 'delete' }));
  const changed = MVP_BUILD_ORDER.flatMap((id) => {
    if (plan.rollback[id]) return [{ id, action: 'rollback', version: plan.rollback[id] }];
    if (plan.rollback_built[id]) return [{ id, action: 'rollback_built', version: plan.rollback_built[id] }];
    if (plan.build.includes(id)) return [{ id, action: 'build' }];
    if (plan.restyle.includes(id)) return [{ id, action: 'restyle' }];
    if (plan.refresh.includes(id)) return [{ id, action: 'rebuild' }];
    if (plan.repoint.includes(id)) return [{ id, action: 'repoint' }];
    return [];
  });
  return [...removed, ...changed];
}

export function planActionText(act) {
  const label = OUTPUT_LABEL[act.id];
  return {
    delete: { label: `Remove the ${label}`, working: `Inspire is removing the ${label}`, now: 'Inspire is removing it now' },
    build: { label: `Build the ${label}`, working: `Genie is building the ${label}`, now: 'Genie is building it now' },
    rollback_built: {
      label: `Build a new ${label}`, working: `Genie is building a new ${label}, because v${act.version} could not be put back`, now: 'Genie is building a new one now',
    },
    rebuild: { label: `Rebuild the ${label}`, working: `Genie is rebuilding the ${label}`, now: 'Genie is rebuilding it now' },
    restyle: { label: `Restyle the ${label}`, working: `Inspire is restyling the ${label}`, now: 'Inspire is restyling it now' },
    rollback: { label: `Roll the ${label} back to v${act.version}`, working: `Inspire is putting v${act.version} of the ${label} back`, now: `Inspire is putting v${act.version} back now` },
    repoint: { label: 'Point the App at the Genie Agent', working: 'Inspire is pointing the App at the Genie Agent', now: 'Inspire is pointing it at the Genie Agent now' },
  }[act.action];
}

const vibesOf = (latest) => String(latest?.spec_json?.vibes ?? '').trim();

function legacyStages(latest) {
  const outputs = latest?.spec_json?.outputs || {};
  return [
    ...MVP_BUILD_STAGES,
    ...IMPLEMENT_OUTPUTS.filter((o) => outputs[o.id]).map((o) => ({ id: o.label, label: o.label, phases: EARLIER_PHASES[o.id] || [], working: `Genie is building the ${o.label}` })),
    FINISH_STAGE,
  ];
}

function plannedStages(plan, latest, seen) {
  const was = (id) => seen.has(id.toLowerCase());
  const head = [...(vibesOf(latest) || was(VIBE_PHASE) ? [VIBE_STAGE] : []), STAGE.Plan];
  if (plan.pending) return head;
  const acts = planActions(plan);
  const stageOf = (act) => {
    const words = planActionText(act);
    return { id: OUTPUT_LABEL[act.id], label: words.label, working: words.working, phases: EARLIER_PHASES[act.id] || [] };
  };
  const genie = plan.refill || acts.some((a) => GENIE_ACTIONS.includes(a.action) && a.id !== 'alert') || was('Genie Code');
  return [
    ...head,
    ...acts.filter((a) => a.action === 'delete').map(stageOf),
    ...(plan.refill || was('Instruction') ? [STAGE.Instruction] : []),
    ...(plan.refill && genie ? [STAGE['Genie Code']] : []),
    ...(plan.refill || was('Genie build') ? [STAGE['Genie build']] : []),
    ...(plan.preview || was('Preview run') ? [STAGE['Preview run']] : []),
    ...(!plan.refill && genie ? [STAGE['Genie Code']] : []),
    ...acts.filter((a) => a.action !== 'delete').map(stageOf),
    { ...FINISH_STAGE, working: finishWords(plan) },
  ];
}

function stageList(steps, latest, since) {
  const plan = versionPlan(steps, latest);
  if (!plan) return legacyStages(latest);
  const seen = new Set(stepEvents(steps)
    .filter(({ payload, at }) => sameVersion(payload, latest) && !(since !== null && at !== null && at < since))
    .map(({ row, payload }) => stepPhase(row, payload).toLowerCase()));
  return plannedStages(plan, latest, seen);
}

export function stagesPlanned(stages) {
  return (stages || []).some((s) => s.id === FINISH_STAGE.id);
}

export function mvpStages(steps, latest, { now = Date.now(), stalled = null } = {}) {
  const repair = mvpRepairOf(steps, latest);
  const since = repair && repair.step === WHOLE_BUILD ? repair.at : null;
  const stages = stageList(steps, latest, since).map((stage) => ({ ...stage, state: 'waiting', started: null, ended: null, round: null, rounds: null }));
  const indexOf = (phase) => stages.findIndex((s) => s.id.toLowerCase() === phase.toLowerCase()
    || (s.phases || []).some((p) => p.toLowerCase() === phase.toLowerCase()));
  const rank = { running: 0, done: 1, warning: 2, error: 3 };
  const seenAt = new Map();
  for (const { row, payload, at } of stepEvents(steps)) {
    if (since !== null && at !== null && at < since) continue;
    const index = indexOf(stepPhase(row, payload));
    if (index < 0) continue;
    const stage = stages[index];
    const state = STEP_STATES[String(row.status || '')];
    if (!state) continue;
    if (stage.started === null || (at !== null && at < stage.started)) stage.started = at;
    if (state !== 'running' && (stage.ended === null || (at !== null && at >= stage.ended))) stage.ended = at;
    const before = seenAt.has(index) ? seenAt.get(index) : undefined;
    const newer = before === undefined || at === null || before === null || at > before;
    const tie = at !== null && at === before && rank[state] >= rank[stage.state];
    if (newer || tie) {
      stage.state = state;
      stage.round = roundOf(payload);
      stage.rounds = Number.isInteger(Number(payload.rounds)) && Number(payload.rounds) > 0 ? Number(payload.rounds) : null;
      seenAt.set(index, at);
    }
  }
  const status = String(latest?.status || '');
  const finished = IMPLEMENT_DONE_STATUSES.includes(status);
  const failed = status === 'failed';
  const active = IMPLEMENT_ACTIVE_STATUSES.includes(status);
  if (active) {
    stages.forEach((s, i) => {
      const restartedAt = seenAt.get(i);
      if (s.state !== 'running' || restartedAt === undefined || restartedAt === null) return;
      stages.slice(i + 1).forEach((later, offset) => {
        const laterAt = seenAt.get(i + 1 + offset);
        if (laterAt === undefined || laterAt === null || laterAt >= restartedAt) return;
        Object.assign(later, { state: 'waiting', started: null, ended: null, round: null, rounds: null });
        seenAt.delete(i + 1 + offset);
      });
    });
  }
  const last = stages.reduce((found, s, i) => (s.state !== 'waiting' ? i : found), -1);
  stages.forEach((s, i) => { if (s.state === 'waiting' && i < last) s.state = 'skipped'; });
  const finish = stages[stages.length - 1];
  if (finished) {
    if (finish.state === 'waiting' || finish.state === 'running') finish.state = status === 'ready' ? 'done' : 'warning';
    stages.forEach((s) => { if (s.state === 'waiting') s.state = 'skipped'; });
  }
  if (failed) {
    if (!stages.some((s) => s.state === 'error')) {
      const broken = stages.find((s) => s.state === 'running') || stages.find((s) => s.state === 'waiting');
      if (broken) broken.state = 'error';
    }
    stages.forEach((s) => { if (s.state === 'running') s.state = 'error'; if (s.state === 'waiting') s.state = 'not_reached'; });
  }
  if (active && stalled) {
    stages.forEach((s) => { if (s.state === 'running') s.state = 'error'; if (s.state === 'waiting') s.state = 'not_reached'; });
  } else if (active && !stages.some((s) => s.state === 'running')) {
    const next = stages.find((s) => s.state === 'waiting');
    if (next) {
      next.state = 'next';
      next.started = stages.reduce((t, s) => (s.ended !== null && s.ended > (t ?? -Infinity) ? s.ended : t), null) ?? timeOf(latest?.created_at);
    }
  }
  for (const s of stages) {
    const end = ['running', 'next'].includes(s.state) ? now : s.ended;
    s.elapsed = s.started !== null && end !== null && end >= s.started ? formatDuration(end - s.started) : '';
  }
  return stages;
}

export function progressPercent(chip, summary) {
  return chip?.tone === 'success' || chip?.tone === 'warning' ? 100 : summary?.percent ?? 0;
}

export function mvpProgressSummary(stages, latest, { now = Date.now(), stalled = null, repair = null } = {}) {
  const counted = stages.filter((s) => s.state !== 'skipped');
  const settled = counted.filter((s) => ['done', 'warning'].includes(s.state)).length;
  const current = stages.find((s) => ['running', 'next'].includes(s.state)) || null;
  const created = timeOf(latest?.created_at);
  const ended = stages.reduce((t, s) => (s.ended !== null && s.ended > (t ?? -Infinity) ? s.ended : t), null);
  const status = String(latest?.status || '');
  const active = IMPLEMENT_ACTIVE_STATUSES.includes(status) && !stalled;
  const span = created === null ? '' : formatDuration((active ? now : ended ?? now) - created);
  let headline = '';
  if (active && status === 'queued' && !current?.started) headline = 'Waiting for the build job to start';
  else if (active && current) headline = `${current.working}…`;
  else if (active) headline = 'Inspire is working…';
  const round = active && current?.state === 'running' && current.round > 1 ? current.round : null;
  const rounds = round ? `Round ${round}${current.rounds ? ` of ${current.rounds}` : ''}: Genie is fixing what failed in round ${round - 1}` : '';
  const fixing = stalled ? '' : repairLine(repair, status);
  return {
    active,
    current,
    percent: stagesPlanned(stages) && counted.length ? Math.round((settled / counted.length) * 100) : 0,
    headline,
    detail: [fixing, rounds].filter(Boolean).join('. '),
    span: span ? `${active ? 'Running for' : 'Took'} ${span}` : '',
  };
}

export function stagesRecorded(stages) {
  return (stages || []).some((s) => s.id !== FINISH_STAGE.id && s.state !== 'skipped');
}

const VIBE_HEADINGS = {
  Notebook: 'notebook', 'AI reasoning': 'ai_reasoning', 'Money at stake formula': 'value_formula',
  Dashboard: 'dashboard', App: 'app', 'Genie Agent': 'genie_space', Alert: 'alert',
};
const PART_HEADINGS = [[/^Dashboard chart ([A-Za-z0-9_-]{1,64})$/, 'dashboard:'], [/^App page ([A-Za-z0-9_-]{1,64})$/, 'app:page:']];
const VIBE_SENT = 'sent to ';
const VIBE_NO_PART = 'no part can do this vibe';
const VIBE_UNROUTED = /; (\d+) ask\(s\) no part can do$/;
const VIBE_NOTE = /; (this ask changes the [^;]+)$/;
const VIBE_ROUTE_SPLIT = /; (?=(?:Notebook|AI reasoning|Money at stake formula|Dashboard chart [A-Za-z0-9_-]+|App page [A-Za-z0-9_-]+|Dashboard|App|Genie Agent|Alert): )/;
const sentence = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

function headingId(heading) {
  if (Object.hasOwn(VIBE_HEADINGS, heading)) return VIBE_HEADINGS[heading];
  for (const [pattern, prefix] of PART_HEADINGS) {
    const match = pattern.exec(heading);
    if (match) return `${prefix}${match[1]}`;
  }
  return '';
}

export function vibeLine(line) {
  let text = String(line ?? '').trim();
  if (text === VIBE_NO_PART) return { noPart: true, id: '', words: '', note: '', unrouted: 0 };
  if (!text.startsWith(VIBE_SENT)) return null;
  text = text.slice(VIBE_SENT.length);
  const tail = VIBE_UNROUTED.exec(text);
  if (tail) text = text.slice(0, tail.index);
  const noted = VIBE_NOTE.exec(text);
  if (noted) text = text.slice(0, noted.index);
  const cut = text.indexOf(': ');
  const id = cut > 0 ? headingId(text.slice(0, cut)) : '';
  const words = cut > 0 ? text.slice(cut + 2).trim() : '';
  if (!id || !words) return null;
  return { noPart: false, id, words, note: noted ? noted[1] : '', unrouted: tail ? Number(tail[1]) : 0 };
}

function messageLines(message) {
  const text = String(message ?? '');
  const at = text.search(/(?:^|: )(?:sent to |no part can do this vibe)/);
  if (at < 0) return [];
  const lines = [];
  for (const piece of text.slice(at).replace(/^: /, '').split('\n')) {
    if (!lines.length || piece.startsWith(VIBE_SENT) || piece === VIBE_NO_PART) lines.push(piece);
    else lines[lines.length - 1] += `\n${piece}`;
  }
  return lines.flatMap((line) => line.split(VIBE_ROUTE_SPLIT).map((chunk, i) => (i ? `${VIBE_SENT}${chunk}` : chunk)));
}

export function vibeRouting(steps, latest) {
  const assets = isMap(latest?.asset_status) ? latest.asset_status : {};
  const named = (id) => String(assets[id]?.name ?? assets[id]?.title ?? '').trim();
  const route = (id, words, note = '') => ({ id, label: partLabel(id, named(id)), words: String(words ?? '').trim(), note });
  const text = vibesOf(latest);
  const saved = assets.vibe;
  if (isMap(saved) && Number(saved.spec_version) === Number(latest?.spec_version)) {
    return {
      state: 'routed',
      text: String(saved.text ?? '').trim() || text,
      routes: Object.entries(isMap(saved.routes) ? saved.routes : {}).map(([id, words]) => route(id, words)).filter((r) => r.words),
      notRouted: (Array.isArray(saved.not_routed) ? saved.not_routed : []).filter(isMap)
        .map((item) => ({ ask: String(item.ask ?? '').trim(), reason: String(item.reason ?? '').trim() })).filter((item) => item.ask),
      unnamed: 0,
      noPart: false,
    };
  }
  let last = null;
  for (const event of stepEvents(steps)) if (isPhase(event.row, event.payload, VIBE_PHASE) && sameVersion(event.payload, latest)) last = event;
  if (!last && !text) return null;
  const base = { text, routes: [], notRouted: [], unnamed: 0, noPart: false };
  const status = String(last?.row?.status || '');
  if (!last || status === 'started') return { ...base, state: 'reading' };
  if (status === 'ended_error') return { ...base, state: 'failed' };
  const parsed = (Array.isArray(last.payload.lines) ? last.payload.lines : messageLines(last.row.message)).map(vibeLine).filter(Boolean);
  return {
    ...base,
    state: 'routed',
    routes: parsed.filter((p) => p.id).map((p) => route(p.id, p.words, p.note)),
    unnamed: parsed.reduce((sum, p) => sum + p.unrouted, 0),
    noPart: parsed.some((p) => p.noPart),
  };
}

export function vibeRoutingLines(routing) {
  if (!routing || routing.state !== 'routed') return [];
  const count = routing.unnamed;
  return [
    ...routing.routes.map((r) => ({ kind: 'route', id: r.id, text: `Sent to the ${r.label}: “${r.words}”`, note: r.note ? sentence(r.note) : '' })),
    ...routing.notRouted.map((item) => ({ kind: 'not_routed', text: `Vibe not done: “${item.ask}”${item.reason ? `: ${item.reason}` : ''}`, note: '' })),
    ...(count ? [{ kind: 'unnamed', text: `Vibe not done on ${count} ${count === 1 ? 'ask' : 'asks'}: no part can do ${count === 1 ? 'it' : 'them'}. Inspire names ${
      count === 1 ? 'it' : 'them'} when this version is built`, note: '' }] : []),
    ...(routing.noPart && !routing.routes.length && !routing.notRouted.length ? [{ kind: 'no_part', text: 'Vibe not done: no part can do this vibe', note: '' }] : []),
  ];
}

export function mvpScope(steps, latest) {
  const plan = versionPlan(steps, latest);
  const vibe = vibeRoutingLines(vibeRouting(steps, latest));
  if (!plan || plan.pending || plan.classes.includes('initial')) return { pending: Boolean(plan?.pending), notes: [], vibe };
  const touched = new Set(planActions(plan).map((a) => a.id));
  const outputs = latest?.spec_json?.outputs || {};
  const hasNotebook = Boolean(latest?.asset_status?.notebook || latest?.notebook_path);
  const kept = [
    ...(!plan.refill && !plan.preview && hasNotebook ? ['the notebook'] : []),
    ...IMPLEMENT_OUTPUTS.filter((o) => outputs[o.id] && !touched.has(o.id)).map((o) => `the ${o.label}`),
  ];
  const unmanaged = plan.keep_unmanaged.map((id) => `the ${OUTPUT_LABEL[id]}`);
  const notes = [
    ...(plan.refill ? [{ kind: 'refill', text: 'This change reaches the analysis, so Genie rebuilds the notebook and every part after it' }] : []),
    ...(!plan.refill && plan.preview ? [{ kind: 'rerun', text: 'Inspire runs the notebook again on a preview; the notebook itself stays as it is' }] : []),
    ...(kept.length ? [{ kind: 'kept', text: `Kept as is: ${joinWords(kept)}` }] : []),
    ...(unmanaged.length ? [{ kind: 'unmanaged', text: `Left in place and no longer refreshed: ${joinWords(unmanaged)}` }] : []),
  ];
  return { pending: false, notes, vibe };
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function feedLine(item) {
  const kind = String(item?.kind || '');
  const text = String(item?.text || '');
  if (kind === 'message') return { who: 'genie', tone: 'plain', text };
  if (kind === 'stopped') return { who: 'genie', tone: 'warning', text: `Stopped: ${text}` };
  if (kind === 'error') return { who: 'genie', tone: 'error', text: `Genie hit an error: ${text}` };
  if (kind === 'turn_done') return { who: 'genie', tone: 'quiet', text: 'Genie finished its turn' };
  if (kind === 'activity') {
    const commands = Number(item.commands) || 0;
    const failed = Number(item.failed) || 0;
    const files = Array.isArray(item.files) ? item.files : [];
    const parts = [];
    if (commands) parts.push(`Ran ${plural(commands, 'command')}${failed ? ` (${failed} failed)` : ''}`);
    if (files.length) parts.push(`${parts.length ? 'edited' : 'Edited'} ${files.join(', ')}`);
    return { who: 'genie', tone: 'quiet', text: parts.join(' · ') };
  }
  if (kind === 'run') {
    const what = item.check ? 'The alert check run' : 'The preview run';
    const state = String(item.state || '');
    const result = String(item.result || '');
    const after = Number(item.seconds) > 0 ? ` (${formatDuration(Number(item.seconds) * 1000)})` : '';
    if (RUN_STARTING_STATES.includes(state)) return { who: 'inspire', tone: 'quiet', text: `${what} is starting${after}` };
    if (state === 'RUNNING' || state === 'TERMINATING') return { who: 'inspire', tone: 'quiet', text: `${what} is running${after}` };
    if (state === 'TERMINATED' && result === 'SUCCESS') return { who: 'inspire', tone: 'plain', text: `${what} finished${after}` };
    return { who: 'inspire', tone: 'error', text: `${what} ended: ${[state, result].filter(Boolean).join(' / ')}${after}` };
  }
  if (kind === 'failed') return { who: 'inspire', tone: 'error', text };
  if (kind === 'note') return { who: 'inspire', tone: 'quiet', text };
  return null;
}

export function feedKey(item) {
  return `${item?.at || ''}|${item?.kind || ''}|${String(item?.text || item?.run_id || '').slice(0, 60)}`;
}

export const FEED_WORDS_PER_SECOND = 12;

export function typedText(text, elapsedMs, wordsPerSecond = FEED_WORDS_PER_SECOND) {
  const value = String(text || '');
  const tokens = value.split(/(\s+)/);
  const words = Math.max(0, Math.floor((Math.max(0, Number(elapsedMs) || 0) / 1000) * wordsPerSecond));
  let shown = 0;
  let out = '';
  for (const token of tokens) {
    if (!/^\s+$/.test(token) && token) {
      if (shown >= words) return out.trimEnd();
      shown += 1;
    }
    out += token;
  }
  return out;
}

export function typingDone(text, elapsedMs, wordsPerSecond = FEED_WORDS_PER_SECOND) {
  return typedText(text, elapsedMs, wordsPerSecond) === String(text || '');
}

export function feedTypesOut(item) {
  return ['message', 'stopped', 'error'].includes(String(item?.kind || ''));
}

const newestOf = (feed) => feed.reduce((most, item) => {
  const at = Date.parse(item?.until || item?.at || '');
  return Number.isFinite(at) && at > most ? at : most;
}, -Infinity);

const buildOf = (status) => {
  const latest = status?.latest || {};
  return [latest.session_id, latest.use_case_id, latest.spec_version, latest.implement_run_id].map((v) => String(v ?? '')).join('|');
};

export function steadyFeed(previous, next) {
  const before = previous?.feed;
  const after = next?.feed;
  if (!next || !Array.isArray(before) || !before.length || buildOf(previous) !== buildOf(next)) return next;
  const list = Array.isArray(after) ? after : [];
  if (list.length >= before.length && newestOf(list) >= newestOf(before)) return next;
  return { ...next, feed: before };
}

export function feedArrivals(previous, feed, at) {
  const next = new Map(previous || []);
  for (const item of Array.isArray(feed) ? feed : []) {
    const key = feedKey(item);
    if (!next.has(key)) next.set(key, previous ? at : 0);
  }
  return next;
}

export function typingSchedule(feed, arrivals, wordsPerSecond = FEED_WORDS_PER_SECOND) {
  const starts = new Map();
  let end = 0;
  for (const item of Array.isArray(feed) ? feed : []) {
    const key = feedKey(item);
    const arrived = arrivals?.get(key) || 0;
    if (!arrived || !feedTypesOut(item)) continue;
    const line = feedLine(item);
    if (!line?.text) continue;
    const start = Math.max(arrived, end);
    end = start + (line.text.split(/\s+/).filter(Boolean).length / wordsPerSecond) * 1000;
    starts.set(key, start);
  }
  return { starts, end };
}
