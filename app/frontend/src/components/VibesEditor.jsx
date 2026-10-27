import { useId } from 'react';
import { VIBES_MAX, vibesLabel, vibesLength, vibesProblem } from '../lib/implementWizard';

const PLACEHOLDERS = {
  notebook: 'For example: score the baseline and every model on the same held-out rows, and print each one\'s hit rate',
  dashboard: 'For example: put the weekly trend first and show the 20 rows to act on today',
  genie_space: 'For example: answer in plain words and always say which rows you counted',
  app: 'For example: one page, with the decision list on the left and the row detail on the right',
  alert: 'For example: only email me when a row to act on is new since the last run',
};

export default function VibesEditor({ id, value, onChange, autoFocus = false }) {
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
