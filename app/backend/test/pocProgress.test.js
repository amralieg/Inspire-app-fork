const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const lib = (name) => import(pathToFileURL(path.resolve(__dirname, '..', '..', 'frontend', 'src', 'lib', name)).href);

const row = (phase, status, time, extra = {}) => ({
  step_id: phase.length, step_name: `Inspire is working on ${phase.toLowerCase()}`, sub_step_name: 'Completed: n01-u01',
  status, last_updated: `2026-01-02T${time}.000Z`, result_json: JSON.stringify({ use_case_id: 'N01-U01', phase }), ...extra,
});
const at = (time) => Date.parse(`2026-01-02T${time}Z`);
const latestOf = (status, outputs = { dashboard: true }) => ({ status, created_at: '2026-01-02T10:00:00.000Z', spec_json: { outputs } });
const states = (stages) => stages.map((s) => [s.id, s.state]);

const BUILT = [
  row('Plan', 'ended_success', '10:01:00'),
  row('Instruction', 'started', '10:01:05'),
  row('Instruction', 'ended_success', '10:03:50'),
  row('Genie Code', 'started', '10:03:50'),
  row('Genie Code', 'ended_success', '10:04:00'),
  row('Genie build', 'started', '10:04:05'),
  row('Genie build', 'ended_success', '10:09:00'),
];

test('a failed preview shows every finished stage, the failed one, and what it never reached', async () => {
  const { pocStages, pocProgressSummary } = await lib('pocProgress.js');
  const steps = [...BUILT, row('Preview run', 'ended_error', '10:10:00'), row('Preview run', 'started', '10:10:00'), row('Implement', 'ended_error', '10:10:08')];
  const stages = pocStages(steps, latestOf('failed'), { now: at('10:30:00') });
  assert.deepEqual(states(stages), [
    ['Plan', 'done'], ['Instruction', 'done'], ['Genie Code', 'done'], ['Genie build', 'done'],
    ['Preview run', 'error'], ['Dashboard', 'not_reached'], ['Done', 'not_reached'],
  ]);
  assert.equal(stages[3].elapsed, '4m 55s');
  assert.equal(stages[1].elapsed, '2m 45s');
  const summary = pocProgressSummary(stages, latestOf('failed'), { now: at('10:30:00') });
  assert.deepEqual({ ...summary, current: summary.current?.id }, { active: false, current: undefined, percent: 57, headline: '', detail: '', span: 'Took 10m 0s' });
});

test('a running build names what Genie is doing, how long it has run, and moves on to the next stage between steps', async () => {
  const { pocStages, pocProgressSummary } = await lib('pocProgress.js');
  const running = pocStages(BUILT.slice(0, 6), latestOf('filling'), { now: at('10:06:05') });
  assert.equal(running[3].state, 'running');
  assert.equal(running[3].elapsed, '2m 0s');
  const summary = pocProgressSummary(running, latestOf('filling'), { now: at('10:06:05') });
  assert.equal(summary.headline, 'Genie is building the notebook…');
  assert.equal(summary.span, 'Running for 6m 5s');
  assert.equal(summary.percent, 43);
  const between = pocStages(BUILT, latestOf('previewing'), { now: at('10:09:30') });
  assert.equal(between[4].state, 'next');
  assert.equal(between[4].elapsed, '30s');
  assert.equal(pocProgressSummary(between, latestOf('previewing'), { now: at('10:09:30') }).headline, 'Inspire is running the notebook on a preview…');
});

test('a queued build waits for its job, and a stage the plan did not need is skipped rather than waiting', async () => {
  const { pocStages, pocProgressSummary } = await lib('pocProgress.js');
  const queued = pocStages([], latestOf('queued'), { now: at('10:00:20') });
  assert.equal(queued[0].state, 'next');
  assert.equal(queued[0].elapsed, '20s');
  assert.equal(pocProgressSummary(queued, latestOf('queued'), { now: at('10:00:20') }).headline, 'Inspire is planning the build…');
  const fresh = { ...latestOf('queued'), created_at: '' };
  assert.equal(pocProgressSummary(pocStages([], fresh), fresh).headline, 'Waiting for the build job to start');
  const noInstruction = pocStages([row('Plan', 'ended_success', '10:01:00'), row('Genie Code', 'started', '10:01:02')], latestOf('filling'), { now: at('10:01:10') });
  assert.deepEqual(states(noInstruction).slice(0, 3), [['Plan', 'done'], ['Instruction', 'skipped'], ['Genie Code', 'running']]);
});

test('a second Genie round after a warning is running again, and a tie at the same second keeps the end state', async () => {
  const { pocStages } = await lib('pocProgress.js');
  const rounds = [row('Genie build', 'started', '10:04:00'), row('Genie build', 'ended_warning', '10:06:00'), row('Genie build', 'started', '10:06:10')];
  assert.equal(pocStages(rounds, latestOf('filling'), { now: at('10:07:00') })[3].state, 'running');
  for (const order of [['started', 'ended_error'], ['ended_error', 'started']]) {
    const tie = order.map((status) => row('Preview run', status, '10:10:00'));
    assert.equal(pocStages(tie, latestOf('failed'))[4].state, 'error', order.join(' then '));
  }
  for (const order of [['started', 'ended_success'], ['ended_success', 'started']]) {
    const tie = order.map((status) => row('Genie Code', status, '10:04:00'));
    const stages = pocStages(tie, latestOf('filling'), { now: at('10:04:30') });
    assert.deepEqual(states(stages).slice(2, 4), [['Genie Code', 'done'], ['Genie build', 'next']], order.join(' then '));
  }
});

const evented = (phase, status, flushed, eventAt, payload = {}) => ({
  ...row(phase, status, flushed),
  result_json: JSON.stringify({ use_case_id: 'N01-U01', phase, event_at: `2026-01-02T${eventAt}+00:00`, ...payload }),
});

test('stages follow when each event happened, not when the writer flushed it', async () => {
  const { pocStages } = await lib('pocProgress.js');
  const batch = [
    evented('Genie build', 'started', '10:09:01', '10:04:05.100000', { round: 1, rounds: 3 }),
    evented('Genie build', 'started', '10:09:01', '10:09:00.700000', { round: 2, rounds: 3 }),
    evented('Genie build', 'ended_success', '10:09:01', '10:09:00.200000', { round: 1 }),
  ];
  const stages = pocStages(batch, latestOf('filling'), { now: at('10:09:30') });
  assert.equal(stages[3].state, 'running', 'round 2 started after round 1 ended, in the same flush');
  assert.equal(stages[3].round, 2);
  assert.equal(stages[3].elapsed, '5m 24s');
});

test('a stage Genie runs again resets the later stages until they run again', async () => {
  const { pocStages, pocProgressSummary } = await lib('pocProgress.js');
  const retried = [
    ...BUILT,
    row('Preview run', 'started', '10:09:10'),
    row('Preview run', 'ended_error', '10:10:00'),
    evented('Genie build', 'started', '10:10:05', '10:10:05', { round: 2, rounds: 3 }),
  ];
  const stages = pocStages(retried, latestOf('filling'), { now: at('10:12:05') });
  assert.deepEqual(states(stages).slice(3), [['Genie build', 'running'], ['Preview run', 'waiting'], ['Dashboard', 'waiting'], ['Done', 'waiting']]);
  assert.equal(stages[4].elapsed, '');
  const summary = pocProgressSummary(stages, latestOf('filling'), { now: at('10:12:05') });
  assert.equal(summary.headline, 'Genie is building the notebook…');
  assert.equal(summary.detail, 'Round 2 of 3: Genie is fixing what failed in round 1');
  assert.equal(summary.percent, 43);
  const failed = pocStages(retried, latestOf('failed'));
  assert.deepEqual(states(failed).slice(3, 5), [['Genie build', 'error'], ['Preview run', 'error']], 'a finished build keeps what happened');
});

test('a retried output round is still running, names the next round, and never hands over to Done', async () => {
  const { pocStages, pocProgressSummary } = await lib('pocProgress.js');
  const outputs = { dashboard: true, app: true };
  const base = [...BUILT, row('Preview run', 'ended_success', '10:11:00'), row('Dashboard', 'ended_success', '10:15:00')];
  const sentBack = [...base,
    evented('App', 'started', '10:15:02', '10:15:01', { round: 1, rounds: 3 }),
    evented('App', 'started', '10:20:02', '10:20:01', { round: 1, rounds: 3, failure: 'app.yaml: command not found' })];
  const stages = pocStages(sentBack, latestOf('building_outputs', outputs), { now: at('10:20:30') });
  assert.deepEqual(states(stages).slice(6), [['App', 'running'], ['Done', 'waiting']]);
  const summary = pocProgressSummary(stages, latestOf('building_outputs', outputs), { now: at('10:20:30') });
  assert.equal(summary.headline, 'Genie is building the App…');
  assert.equal(summary.detail, 'Round 2 of 3: Genie is fixing what failed in round 1');
  const genie = pocStages([...base, row('Genie Agent', 'started', '10:15:02')], latestOf('building_outputs', { dashboard: true, genie_space: true }), { now: at('10:16:00') });
  assert.equal(pocProgressSummary(genie, latestOf('building_outputs', { dashboard: true, genie_space: true }), { now: at('10:16:00') }).headline,
    'Genie is building the Genie Agent…');
  const firstRound = pocStages(sentBack.slice(0, -1), latestOf('building_outputs', outputs), { now: at('10:16:00') });
  assert.equal(pocProgressSummary(firstRound, latestOf('building_outputs', outputs), { now: at('10:16:00') }).detail, '');
});

test('a finished build marks Done, skips what it did not touch, and a stopped run is not shown as still going', async () => {
  const { pocStages, pocProgressSummary } = await lib('pocProgress.js');
  const outputs = { dashboard: true, alert: true };
  const ready = pocStages([...BUILT, row('Preview run', 'ended_success', '10:11:00'), row('Dashboard', 'ended_success', '10:15:00')], latestOf('ready', outputs));
  assert.deepEqual(states(ready).slice(4), [['Preview run', 'done'], ['Dashboard', 'done'], ['Alert', 'skipped'], ['Done', 'done']]);
  const warned = pocStages([row('Alert', 'ended_success', '10:01:00')], latestOf('ready_with_warnings', { alert: true }));
  assert.deepEqual(states(warned), [
    ['Plan', 'skipped'], ['Instruction', 'skipped'], ['Genie Code', 'skipped'], ['Genie build', 'skipped'], ['Preview run', 'skipped'],
    ['Alert', 'done'], ['Done', 'warning'],
  ]);
  const stalled = { reason: 'its run was cancelled' };
  const stopped = pocStages(BUILT.slice(0, 6), latestOf('filling'), { now: at('11:00:00'), stalled });
  assert.deepEqual(states(stopped).slice(3), [['Genie build', 'error'], ['Preview run', 'not_reached'], ['Dashboard', 'not_reached'], ['Done', 'not_reached']]);
  assert.equal(pocProgressSummary(stopped, latestOf('filling'), { stalled }).active, false);
});

test('the stepper shows only when some stage has a record: a finished version with no step rows has nothing to show', async () => {
  const { pocStages, stagesRecorded } = await lib('pocProgress.js');
  const outputs = { dashboard: true, alert: true };
  const unrecorded = pocStages([], latestOf('ready', outputs));
  assert.ok(unrecorded.slice(0, -1).every((s) => s.state === 'skipped'));
  assert.equal(stagesRecorded(unrecorded), false);
  assert.equal(stagesRecorded(pocStages([], latestOf('ready_with_warnings', outputs))), false);
  assert.equal(stagesRecorded(pocStages([row('Alert', 'ended_success', '10:01:00')], latestOf('ready', outputs))), true);
  assert.equal(stagesRecorded(pocStages([], latestOf('failed', outputs))), true);
  assert.equal(stagesRecorded(pocStages([], latestOf('queued', outputs), { now: at('10:00:05') })), true);
  assert.equal(stagesRecorded(pocStages(BUILT, latestOf('building_outputs', outputs), { now: at('10:10:00') })), true);
  assert.equal(stagesRecorded([]), false);
  assert.equal(stagesRecorded(null), false);
});

test('a step row without a phase falls back to its step name, and rows of other stages are ignored', async () => {
  const { pocStages } = await lib('pocProgress.js');
  const bare = { ...row('Preview run', 'started', '10:10:00'), result_json: null };
  const lock = row('Lock', 'ended_warning', '10:10:01');
  const odd = row('Preview run', 'something_else', '10:10:02');
  assert.equal(pocStages([bare, lock, odd], latestOf('previewing'), { now: at('10:10:30') })[4].state, 'running');
  assert.equal(pocStages([{ ...bare, result_json: '{not json' }], latestOf('previewing'), { now: at('10:10:30') })[4].elapsed, '30s');
});

test('each feed item reads as a sentence, never as a log line', async () => {
  const { feedLine } = await lib('pocProgress.js');
  assert.deepEqual(feedLine({ kind: 'message', text: 'I am reading the notebook.' }), { who: 'genie', tone: 'plain', text: 'I am reading the notebook.' });
  assert.deepEqual(feedLine({ kind: 'stopped', text: 'History covers 0 windows' }), { who: 'genie', tone: 'warning', text: 'Stopped: History covers 0 windows' });
  assert.equal(feedLine({ kind: 'error', text: 'quota' }).text, 'Genie hit an error: quota');
  assert.equal(feedLine({ kind: 'turn_done' }).text, 'Genie finished its turn');
  assert.equal(feedLine({ kind: 'activity', commands: 3, failed: 1, files: ['implementation.py'] }).text, 'Ran 3 commands (1 failed) · edited implementation.py');
  assert.equal(feedLine({ kind: 'activity', commands: 1, failed: 0, files: [] }).text, 'Ran 1 command');
  assert.equal(feedLine({ kind: 'activity', commands: 0, failed: 0, files: ['a.py', 'b.py'] }).text, 'Edited a.py, b.py');
  assert.equal(feedLine({ kind: 'run', check: false, seconds: 0, state: 'PENDING' }).text, 'The preview run is starting');
  assert.equal(feedLine({ kind: 'run', check: false, seconds: 60, state: 'RUNNING' }).text, 'The preview run is running (1m 0s)');
  assert.deepEqual(feedLine({ kind: 'run', check: true, seconds: 90, state: 'TERMINATED', result: 'SUCCESS' }),
    { who: 'inspire', tone: 'plain', text: 'The alert check run finished (1m 30s)' });
  assert.deepEqual(feedLine({ kind: 'run', check: false, seconds: 5, state: 'TERMINATED', result: 'FAILED' }),
    { who: 'inspire', tone: 'error', text: 'The preview run ended: TERMINATED / FAILED (5s)' });
  assert.deepEqual(feedLine({ kind: 'failed', text: 'no rows' }), { who: 'inspire', tone: 'error', text: 'no rows' });
  assert.equal(feedLine({ kind: 'note', text: 'Wrote the notebook x' }).who, 'inspire');
  assert.equal(feedLine({ kind: 'unknown' }), null);
  assert.equal(feedLine(null), null);
});

test('Genie\'s words appear one word at a time and keep their spacing', async () => {
  const { typedText, typingDone, feedKey } = await lib('pocProgress.js');
  const words = 'I found the wizard overrides;  implementing them now.';
  assert.equal(typedText(words, 0), '');
  assert.equal(typedText(words, 1000 / 12), 'I');
  assert.equal(typedText(words, 4 * 1000 / 12), 'I found the wizard');
  assert.equal(typedText(words, 60000), words);
  assert.equal(typedText(words, -5), '');
  assert.equal(typingDone(words, 60000), true);
  assert.equal(typingDone(words, 100), false);
  assert.equal(typedText('', 1000), '');
  assert.equal(feedKey({ at: 'x', kind: 'run', run_id: '7' }), 'x|run|7');
});

test('durations read the same on every page that shows one', async () => {
  const { formatDuration } = await lib('formatWhen.js');
  assert.equal(formatDuration(0), '');
  assert.equal(formatDuration(0, '—'), '—');
  assert.equal(formatDuration('nope', '—'), '—');
  assert.equal(formatDuration(59999), '59s');
  assert.equal(formatDuration(61000), '1m 1s');
  assert.equal(formatDuration(3661000), '1h 1m');
  const fs = require('node:fs');
  const src = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'frontend', 'src', p), 'utf8');
  for (const file of ['components/RunStatus.jsx', 'pages/MonitorPage.jsx', 'lib/pocProgress.js']) {
    assert.doesNotMatch(src(file), /function formatDuration/, file);
  }
});

test('messages already there when the page opens show at once; later ones type one after another, never commands', async () => {
  const { feedArrivals, typingSchedule, feedKey } = await lib('pocProgress.js');
  const old = [{ at: 'a', kind: 'message', text: 'first look' }, { at: 'b', kind: 'activity', commands: 2, failed: 0, files: [] }];
  const opened = feedArrivals(null, old, 5000);
  assert.deepEqual([...opened.values()], [0, 0]);
  assert.equal(typingSchedule(old, opened).starts.size, 0);
  const later = [...old,
    { at: 'c', kind: 'message', text: 'one two three four five six seven eight nine ten eleven twelve' },
    { at: 'd', kind: 'activity', commands: 1, failed: 0, files: [] },
    { at: 'e', kind: 'stopped', text: 'History covers 0 windows' }];
  const polled = feedArrivals(opened, later, 9000);
  assert.equal(polled.get(feedKey(old[0])), 0);
  assert.equal(polled.get(feedKey(later[2])), 9000);
  const { starts, end } = typingSchedule(later, polled);
  assert.deepEqual([...starts.entries()], [[feedKey(later[2]), 9000], [feedKey(later[4]), 10000]]);
  assert.equal(end, 10000 + (5 / 12) * 1000);
  assert.equal(feedArrivals(polled, later, 99999).get(feedKey(later[2])), 9000);
  assert.deepEqual([...feedArrivals(null, null, 1).keys()], []);
  assert.equal(typingSchedule(null, null).end, 0);
});

test('the Progress tab shows the stepper and Genie\'s scrolling messages, never raw log lines or JSON', () => {
  const fs = require('node:fs');
  const src = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'frontend', 'src', p), 'utf8');
  const page = src('pages/ImplementPage.jsx');
  assert.doesNotMatch(page, /log_lines/);
  const progressTab = page.slice(page.indexOf('{tab === PROGRESS_TAB && ('), page.indexOf('{tab === CONTROL_TAB && ('));
  assert.ok(progressTab.length > 100);
  assert.doesNotMatch(progressTab, /<pre|steps \|\| \[\]\)\.map/);
  assert.match(page, /<PocProgress /);
  assert.match(page, /<GenieFeed /);
  const feed = src('components/GenieFeed.jsx');
  assert.match(feed, /\$\{active \|\| entries\.length \? 'h-80' : 'max-h-80'\} overflow-y-auto/);
  assert.match(src('components/PocProgress.jsx'), /\{stagesRecorded\(stages\) && \(/);
  assert.match(feed, /role="log"/);
  assert.match(feed, /<GenieLogo /);
  assert.doesNotMatch(feed, /scrollIntoView/);
  const routes = fs.readFileSync(path.resolve(__dirname, '..', 'implementRoutes.js'), 'utf8');
  assert.doesNotMatch(routes, /log_lines/);
  assert.match(routes, /feed = I\.genieFeed\(text, useCaseId, history\[0\] && history\[0\]\.created_at\)/);
});

test('the Genie Agent stage follows the agent step, and a run recorded when it was called a Genie space keeps its state', async () => {
  const { pocStages } = await lib('pocProgress.js');
  for (const phase of ['Genie Agent', 'Genie space']) {
    const steps = [...BUILT, row('Preview run', 'ended_success', '10:12:00'), row(phase, 'started', '10:12:05'), row(phase, 'ended_success', '10:14:00')];
    const stage = pocStages(steps, latestOf('building_outputs', { genie_space: true }), { now: at('10:15:00') }).find((s) => s.id === 'Genie Agent');
    assert.equal(stage.state, 'done', phase);
  }
});
