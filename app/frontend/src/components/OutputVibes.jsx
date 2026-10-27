import { useId, useState } from 'react';
import { LayoutDashboard, Sparkles, AppWindow, Bell, Loader2, RotateCcw, Wand2, History } from 'lucide-react';
import { VIBES_MAX, vibesLabel, vibesLength, vibesProblem, vibesPreview, statusChip } from '../lib/implementWizard';
import { formatWhen } from '../lib/formatWhen';

const OUTPUT_ICONS = { dashboard: LayoutDashboard, genie_space: Sparkles, app: AppWindow, alert: Bell };

const PLACEHOLDERS = {
  dashboard: 'For example: put the weekly trend first and show the 20 rows to act on today',
  genie_space: 'For example: answer in plain words and always say which rows you counted',
  app: 'For example: one page, with the decision list on the left and the row detail on the right',
  alert: 'For example: only email me when a row to act on is new since the last run',
};
const LEGEND = 'text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary';

export function OutputIcon({ id, ...props }) {
  const Icon = OUTPUT_ICONS[id];
  return <Icon {...props} />;
}

export function VibesEditor({ id, value, onChange, autoFocus = false }) {
  const hint = useId();
  const problem = vibesProblem(id, value);
  return (
    <div className="space-y-1">
      <textarea
        aria-label={vibesLabel(id)}
        aria-describedby={hint}
        aria-invalid={problem ? 'true' : undefined}
        autoFocus={autoFocus}
        rows={3}
        value={value}
        placeholder={PLACEHOLDERS[id]}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-2.5 py-2 text-sm leading-snug border rounded-md bg-surface text-text-primary glow-focus resize-none ${problem ? 'border-error' : 'border-border'}`}
      />
      <div className="flex items-start justify-between gap-3 text-[11px]">
        <p id={hint} className="text-error-fg">{problem}</p>
        <span data-vibes-count="" className={`shrink-0 tabular-nums ${problem ? 'font-semibold text-error-fg' : 'text-text-secondary'}`}>
          {vibesLength(value)}/{VIBES_MAX}
        </span>
      </div>
    </div>
  );
}

function VersionRow({ card, version, locked, pending, confirming, onAsk, onCancel, onConfirm }) {
  return (
    <li data-version={version.version} className="px-2.5 py-2 text-[12px] space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-text-primary">v{version.version}</span>
        {version.at && <span className="text-text-secondary">{formatWhen(version.at, version.at)}</span>}
        <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-text-secondary">{statusChip(version.status).label}</span>
        <span className="flex-1 min-w-0 truncate text-text-secondary" title={version.vibes || undefined}>
          {version.vibes ? `“${vibesPreview(version.vibes)}”` : 'no vibes'}
        </span>
        <button
          type="button"
          disabled={locked || confirming}
          onClick={onAsk}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-xs font-medium text-text-primary hover:bg-bg-subtle disabled:opacity-50"
        >
          <History size={11} /> Roll back to v{version.version}
        </button>
      </div>
      {confirming && (
        <div role="group" aria-label={`Confirm the roll back to v${version.version}`} className="rounded-md border border-border-strong bg-bg-subtle px-2.5 py-2 space-y-2">
          <p className="text-text-primary">
            Roll back the {card.label} to v{version.version}? This replaces the live {card.label}; Genie is not called.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={locked}
              onClick={onConfirm}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-db-red-solid hover:bg-db-red-solid-hover disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <History size={12} />} Roll back
            </button>
            <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-primary">Cancel</button>
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
    <article data-vibe-card={card.id} aria-label={card.rebuild ? `Vibe the ${card.label}` : `The ${card.label}`} className="border border-border rounded-lg bg-surface p-3 space-y-2.5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <OutputIcon id={card.id} size={14} aria-hidden="true" /> {card.rebuild ? `Vibe the ${card.label}` : `The ${card.label}`}
        </h4>
        <p data-live="" className="text-[11px] text-text-secondary">
          {card.live
            ? <>Live: built from <span className="font-semibold text-text-primary">v{card.live.version}</span>{card.live.at ? `, ${formatWhen(card.live.at, card.live.at)}` : ''}</>
            : 'Not live on the latest version'}
        </p>
      </header>
      {card.rebuild && (
        <>
          <VibesEditor id={card.id} value={text} onChange={(value) => onDraft(card.id, value)} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={locked || Boolean(problem) || Boolean(pending)}
              onClick={rebuild}
              className={changed
                ? 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-db-red-solid hover:bg-db-red-solid-hover disabled:opacity-50'
                : 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-text-secondary disabled:opacity-50'}
            >
              {pending === 'rebuild' ? <Loader2 size={12} className="animate-spin" /> : changed ? <Wand2 size={12} /> : <RotateCcw size={12} />}
              {changed ? ' Rebuild with these vibes' : ` Rebuild the ${card.label}`}
            </button>
            {changed && (
              <button type="button" disabled={Boolean(pending)} onClick={() => onDraft(card.id, null)} className="text-[11px] font-medium text-text-secondary hover:text-text-primary underline">
                Discard my edits
              </button>
            )}
            <span className="text-[11px] text-text-secondary">
              {changed ? `Genie rebuilds only the ${card.label} with your asks and replaces the live one.` : `Genie writes the ${card.label} again from this version.`}
            </span>
          </div>
        </>
      )}
      {card.warnings.length > 0 && (
        <ul aria-label={`Vibes Genie could not do on the ${card.label}`} className="space-y-0.5">
          {card.warnings.map((w) => <li key={w} className="text-[11px] text-warning-fg">{w}</li>)}
        </ul>
      )}
      {card.versions.length > 0 && (
        <div className="space-y-1">
          <p className={LEGEND}>Versions</p>
          <ul aria-label={`Earlier versions of the ${card.label}`} className="divide-y divide-border border border-border rounded-md">
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

export default function OutputVibes({ cards, drafts, active, submitBusy, onDraft, onRebuild, onRollback }) {
  return (
    <section aria-label="Vibe the outputs" className="flex-1 min-w-[20rem] space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Vibe the outputs</h3>
        <p className="text-[11px] text-text-secondary">
          Change any output in your own words, even after it is live. Your asks win over Inspire&apos;s defaults, Genie rebuilds only the output you vibe, and every earlier version it saved can come back.
        </p>
        {active && <p className="text-[11px] font-medium text-text-primary">A version is building now; vibes and roll backs apply after it finishes.</p>}
      </div>
      {cards.map((card) => (
        <VibeCard key={card.id} card={card} draft={drafts[card.id] ?? null} locked={active || submitBusy} onDraft={onDraft} onRebuild={onRebuild} onRollback={onRollback} />
      ))}
    </section>
  );
}
