import { useState } from 'react';
import { ExternalLink, Loader2, Pause, Play, RefreshCw, Square, Trash2, Eye, EyeOff, Ban } from 'lucide-react';
import BodyPortal from './BodyPortal';
import ImplementStatusBadge from './ImplementStatusBadge';
import { controlRows, controlActionText, removeConfirmed } from '../lib/implementControl';
import { formatWhen } from '../lib/formatWhen';

const ACTION_ICONS = { stop: Square, start: Play, unpublish: EyeOff, publish: Eye, cancel: Ban };

function RemoveDialog({ row, useCaseId, busy, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('');
  const ok = removeConfirmed(typed, useCaseId);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-label={`Remove the ${row.label}`} className="bg-surface border border-border rounded-xl shadow-elevated w-full max-w-md p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Remove the {row.label}</h3>
          <p className="text-[12px] text-text-secondary">
            Inspire deletes the {row.label} <span className="font-medium text-text-primary">{row.name}</span> in a new version of this PoC and keeps the other outputs.
            You can add it back from the Edit tab.
          </p>
          <label className="block text-[12px] text-text-secondary">
            Type <span className="font-mono font-semibold text-text-primary">{useCaseId}</span> to confirm
            <input
              autoFocus
              aria-label="Type the use case id to confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full border border-border rounded-md px-2 py-1.5 font-mono text-[12px] bg-surface"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border">Cancel</button>
            <button
              type="button"
              disabled={!ok || busy}
              onClick={onConfirm}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-error disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove the {row.label}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

export default function ImplementControlTower({ live, liveError, latest, useCaseId, active, actionBusy, submitBusy, onAction, onRemove, onToggleSchedule, onRefresh }) {
  const [removing, setRemoving] = useState(null);
  const rows = controlRows(live, latest);
  const actions = (live?.actions || []).slice(0, 5);
  const confirmRemove = async () => {
    const row = removing;
    await onRemove(row.id);
    setRemoving(null);
  };
  return (
    <section role="region" aria-label="Control tower" className="mx-4 mt-3 border border-border rounded-lg bg-bg-subtle/40">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div>
          <h3 className="text-xs font-semibold text-text-primary">Control tower</h3>
          <p className="text-[11px] text-text-tertiary">
            {live?.checked_at ? `Live status checked ${formatWhen(live.checked_at, live.checked_at)}` : 'Reading the live status of every asset'}
          </p>
        </div>
        <button type="button" onClick={onRefresh} aria-label="Check the live status now" className="p-1.5 rounded-md border border-border text-text-secondary">
          <RefreshCw size={12} />
        </button>
      </header>
      {liveError && <p className="px-3 py-2 text-[12px] text-error-fg">Inspire cannot read the live status: {liveError}</p>}
      {live && rows.length === 0 && <p className="px-3 py-2 text-[12px] text-text-tertiary">This PoC has no job or outputs yet.</p>}
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} data-control={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">{row.label}</span>
                <span className="text-text-secondary truncate">{row.name}</span>
                <ImplementStatusBadge state={row.state} />
              </div>
              {row.detail && <p data-control-detail="" className={row.state.tone === 'error' ? 'text-error-fg' : 'text-text-tertiary'}>{row.detail}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {row.url && (
                <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-text-secondary">
                  Open <ExternalLink size={11} />
                </a>
              )}
              {row.actions.map((a) => {
                const Icon = ACTION_ICONS[a.action] || Square;
                const key = `${a.asset}:${a.action}`;
                const blocked = actionBusy !== '' || (active && a.asset !== 'build');
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={blocked}
                    title={blocked && active ? 'Wait for the build to finish, or stop the build first' : undefined}
                    onClick={() => onAction(a)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-medium disabled:opacity-50 ${a.danger ? 'border-error/40 text-error-fg' : 'border-border text-text-primary'}`}
                  >
                    {actionBusy === key ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />} {a.label}
                  </button>
                );
              })}
              {row.schedule && (
                <button
                  type="button"
                  disabled={active || submitBusy}
                  onClick={onToggleSchedule}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-xs font-medium disabled:opacity-50"
                >
                  {row.schedule.on ? <Pause size={11} /> : <Play size={11} />} {row.schedule.label}
                </button>
              )}
              {row.removable && (
                <button
                  type="button"
                  disabled={active || submitBusy}
                  onClick={() => setRemoving(row)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-error/40 text-error-fg text-xs font-medium disabled:opacity-50"
                >
                  <Trash2 size={11} /> Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {actions.length > 0 && (
        <div className="px-3 py-2 border-t border-border">
          <p className="text-[11px] font-semibold text-text-secondary">Recent actions</p>
          <ul aria-label="Recent control actions" className="text-[11px] text-text-tertiary space-y-0.5">
            {actions.map((entry, i) => (
              <li key={`${entry.acted_at}-${i}`} className={entry.result === 'done' ? '' : 'text-error-fg'}>{controlActionText(entry)}</li>
            ))}
          </ul>
        </div>
      )}
      {removing && (
        <RemoveDialog row={removing} useCaseId={useCaseId} busy={submitBusy} onCancel={() => setRemoving(null)} onConfirm={confirmRemove} />
      )}
    </section>
  );
}
