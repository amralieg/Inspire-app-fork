import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ListChecks, Loader2, PenLine, RotateCcw, Upload } from 'lucide-react';
import { checklistHeadline, checklistPlace, checklistState, checklistStatusText, missedAsks, notMetAsks, publishedAnywayText } from '../lib/mvpProgress';
import { heldPartsText, heldText, publishHeldText } from '../lib/implementControl';
import { reducedMotion } from '../lib/motion';

const OUTLINE_BUTTON = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-surface text-text-primary hover:bg-bg-subtle disabled:opacity-50';
const PRIMARY_BUTTON = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red-solid hover:bg-db-red-solid-hover shadow-sm shadow-db-red/20 disabled:opacity-50';
const MARK = {
  met: 'bg-success-bg text-success-fg ring-success/30',
  not_met: 'bg-error-bg text-error-fg ring-error/30',
  anyway: 'bg-warning-bg text-warning-fg ring-warning/30',
  unchecked: 'bg-warning-bg text-warning-fg ring-warning/30',
};
const ROW_LOOK = {
  met: { mark: '✓', said: 'Met: ', border: 'border-border' },
  anyway: { mark: '×', said: 'Not met: ', border: 'border-warning/40' },
  not_met: { mark: '×', said: 'Not met: ', border: 'border-error/40' },
  unchecked: { mark: '?', said: 'Could not be checked: ', border: 'border-warning/40' },
};

const sentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
const asked = (entry) => (entry.requirement ? `“${entry.requirement}”` : `Requirement ${entry.n}`);

function Requirement({ entry, assets }) {
  const place = checklistPlace(entry, assets);
  const state = checklistState(entry);
  const look = ROW_LOOK[state];
  const status = checklistStatusText(entry);
  const anyway = publishedAnywayText(entry);
  return (
    <li data-requirement={state === 'unchecked' ? 'unchecked' : entry.met ? 'met' : 'not_met'}
      className={`flex items-start gap-2.5 rounded-lg border bg-surface px-3 py-2 text-[12px] ${look.border}`}>
      <span aria-hidden className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset ${MARK[state]}`}>
        {look.mark}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold text-text-primary"><span className="sr-only">{look.said}</span>{asked(entry)}</p>
        {place && <p data-requirement-place="" className="text-text-secondary">{place}</p>}
        <p data-requirement-status="" className="text-text-secondary">{`${status}.${entry.evidence ? ` ${sentence(entry.evidence)}` : ''}`}</p>
        {!entry.met && entry.tried.length > 0 && (
          <ol aria-label="What Genie tried" className="space-y-0.5">
            {entry.tried.map((line, i) => <li key={`${i}-${line}`} className="text-text-secondary">Round {i + 1}: {line}</li>)}
          </ol>
        )}
        {entry.checks.length > 0 && (
          <ul aria-label="Checks Inspire ran" className="flex flex-wrap gap-1.5 pt-0.5">
            {entry.checks.map((check, i) => (
              <li key={`${i}-${check.name}`} data-check-passed={check.passed ? 'yes' : 'no'}
                className={`rounded-md px-1.5 py-px text-[11px] font-medium ring-1 ring-inset ${check.passed ? MARK.met : MARK.not_met}`}>
                <span aria-hidden>{check.passed ? '✓' : '×'} </span>{check.name}<span className="sr-only">{check.passed ? ': passed' : ': failed'}</span>
              </li>
            ))}
          </ul>
        )}
        {anyway && <p data-published-anyway="" className="font-medium text-warning-fg">{sentence(anyway)}</p>}
      </div>
    </li>
  );
}

export default function VibeChecklist({ checklist, assets = {}, compact = false }) {
  if (!checklist?.entries?.length) return null;
  const tone = missedAsks(checklist).length ? 'text-error-fg' : checklist.met < checklist.total ? 'text-warning-fg' : 'text-success-fg';
  const Heading = compact ? 'h4' : 'h3';
  return (
    <section aria-label={`Vibe checklist of v${checklist.version}`} data-vibe-checklist={checklist.version ?? ''} data-checklist-live={checklist.live ? '' : undefined}
      className={compact ? 'space-y-2 pt-2' : 'rounded-xl border border-border bg-surface shadow-sm px-4 py-3.5 space-y-3'}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Heading className={`flex items-center gap-1.5 font-semibold text-text-primary ${compact ? 'text-[12px]' : 'text-[15px]'}`}>
          <ListChecks size={compact ? 13 : 15} aria-hidden /> Vibe checklist
        </Heading>
        <p data-checklist-headline="" className={`font-bold ${compact ? 'text-[12px]' : 'text-[14px]'} ${tone}`}>{checklistHeadline(checklist)}</p>
      </div>
      {checklist.live && (
        <p className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden /> Inspire is checking each requirement on this build; the list fills as it checks.
        </p>
      )}
      <ol aria-label={`Vibe requirements of v${checklist.version}`} className="space-y-1.5">
        {checklist.entries.map((entry, i) => <Requirement key={`${i}-${entry.n}-${entry.requirement}`} entry={entry} assets={assets} />)}
      </ol>
    </section>
  );
}

export function HeldVersion({ held, checklist, canPublish, readOnly, locked, lockedReason = '', busy = '', onRephrase, onTryAgain, onPublish }) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [confirming]);
  const open = notMetAsks(checklist);
  const missed = missedAsks(checklist);
  const unchecked = open.length - missed.length;
  const parts = heldPartsText(held);
  const next = Number(held.version) + 1;
  const publish = async () => {
    if (await onPublish()) setConfirming(false);
  };
  return (
    <section aria-label={`v${held.version} is held`} data-held-version={held.version} className="rounded-lg border border-warning/40 bg-warning-bg px-3.5 py-3 text-[12px] space-y-2.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="mt-px shrink-0 text-warning-fg" aria-hidden />
        <div className="min-w-0 space-y-0.5 text-warning-fg">
          <p className="text-[13px] font-semibold">Vibes not met: v{held.version} is not published</p>
          <p data-held-text="">{heldText(held, checklist)}</p>
          {held.reason && <p data-held-reason="">{sentence(held.reason)}</p>}
          {parts && <p data-held-parts="">{parts}</p>}
        </div>
      </div>
      {!readOnly && (
        <>
          <p data-held-next="" className="text-warning-fg">
            {missed.some((entry) => entry.requirement) ? 'Rephrase puts the asks that were not met in the vibe box, to say them another way. ' : ''}
            {unchecked ? `Try again builds the same asks again as v${next} and checks again the ${unchecked === 1 ? 'ask' : `${unchecked} asks`} Inspire could not check.`
              : `Try again builds the same asks again as v${next}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {missed.some((entry) => entry.requirement) && (
              <button type="button" onClick={onRephrase} className={OUTLINE_BUTTON}>
                <PenLine size={12} /> Rephrase
              </button>
            )}
            <button type="button" disabled={locked} title={lockedReason || undefined} onClick={onTryAgain} className={PRIMARY_BUTTON}>
              {busy === 'retry' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Try again
            </button>
            {canPublish && (
              <button type="button" disabled={locked || confirming} title={lockedReason || undefined} onClick={() => setConfirming(true)} className={OUTLINE_BUTTON}>
                <Upload size={12} /> Publish anyway
              </button>
            )}
          </div>
        </>
      )}
      {!readOnly && canPublish && confirming && (
        <div ref={confirmRef} role="group" aria-label={`Confirm publishing v${held.version} anyway`}
          className="rounded-lg border border-border-strong bg-surface px-3 py-2 space-y-2 motion-safe:animate-terminal-line">
          <p className="font-semibold text-text-primary">
            Publish v{held.version} anyway?{open.length ? ` ${open.length === 1 ? 'This ask is' : `These ${open.length} asks are`} not met${unchecked ? ' or could not be checked' : ''}:` : ''}
          </p>
          {open.length > 0 && (
            <ul aria-label="Asks not met" className="list-disc pl-5 text-text-primary">
              {open.map((entry, i) => <li key={`${i}-${entry.n}`}>{asked(entry)}{entry.unchecked ? ' (Inspire could not check it)' : ''}</li>)}
            </ul>
          )}
          <p data-publish-held-text="" className="text-text-secondary">{publishHeldText(held)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={locked} onClick={publish} className={PRIMARY_BUTTON}>
              {busy === 'publish' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Publish anyway
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={OUTLINE_BUTTON}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
