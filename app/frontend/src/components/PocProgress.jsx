import { AlertTriangle, Check, Circle, Loader2, Minus, X } from 'lucide-react';
import GenieLogo from './GenieLogo';

const STAGE_LOOK = {
  done: { Icon: Check, tone: 'text-success-fg border-success/35 bg-success-bg', words: 'done' },
  warning: { Icon: AlertTriangle, tone: 'text-warning-fg border-warning/35 bg-warning-bg', words: 'done with warnings' },
  error: { Icon: X, tone: 'text-error-fg border-error/30 bg-error-bg', words: 'failed' },
  running: { Icon: Loader2, tone: 'text-db-red-fg border-db-red/40 bg-db-red-50', words: 'in progress', spin: true },
  next: { Icon: Loader2, tone: 'text-db-red-fg border-db-red/40 bg-db-red-50', words: 'starting', spin: true },
  waiting: { Icon: Circle, tone: 'text-text-tertiary border-border bg-surface', words: 'not started' },
  not_reached: { Icon: Circle, tone: 'text-text-tertiary border-border bg-surface', words: 'not reached' },
  skipped: { Icon: Minus, tone: 'text-text-tertiary border-border bg-bg-subtle', words: 'not needed this version' },
};

const BAR_TONE = { busy: 'bg-db-red', success: 'bg-success', warning: 'bg-warning', error: 'bg-error', idle: 'bg-text-tertiary' };

export default function PocProgress({ stages, summary, chip, reason, toneClass }) {
  const bar = BAR_TONE[chip?.tone] || BAR_TONE.idle;
  const percent = chip?.tone === 'success' || chip?.tone === 'warning' ? 100 : summary.percent;
  return (
    <section aria-label="PoC/MVP progress" className="border border-border rounded-lg px-3 py-3 space-y-3" data-poc-progress="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {summary.active && (
            <span className="shrink-0 w-7 h-7 rounded-full bg-db-red-50 text-db-red-fg flex items-center justify-center motion-safe:animate-pulse">
              <GenieLogo size={16} />
            </span>
          )}
          <div className="min-w-0">
            <p className={`text-xs font-semibold ${toneClass(chip?.tone)}`}>{chip?.label}</p>
            {reason && <p className={`text-[12px] ${toneClass(chip?.tone)}`}>{reason}</p>}
            {summary.headline && <p className="text-[12px] text-text-primary">{summary.headline}</p>}
          </div>
        </div>
        <p className="text-[11px] text-text-secondary tabular-nums">
          {[summary.span, `${percent}% of the stages`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div
        className="relative h-1.5 rounded-full bg-bg-subtle overflow-hidden"
        role="progressbar"
        aria-label="Build progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={`h-full rounded-full ${bar} transition-[width] duration-700 ease-out`} style={{ width: `${Math.max(percent, summary.active ? 4 : 0)}%` }} />
        {summary.active && <div className="absolute inset-0 bg-db-red/20 motion-safe:animate-pulse" aria-hidden />}
      </div>
      <ol aria-label="Build stages" className="flex flex-wrap gap-1.5">
        {stages.map((stage) => {
          const look = STAGE_LOOK[stage.state] || STAGE_LOOK.waiting;
          const { Icon } = look;
          return (
            <li
              key={stage.id}
              data-stage-state={stage.state}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium ${look.tone}`}
            >
              <Icon size={12} className={look.spin ? 'motion-safe:animate-spin' : ''} aria-hidden />
              <span>{stage.label}</span>
              {stage.elapsed && <span className="tabular-nums opacity-80">{stage.elapsed}</span>}
              <span className="sr-only">: {look.words}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
