const TONE = {
  success: 'text-success border-success/35 bg-success-bg',
  warning: 'text-warning border-warning/35 bg-warning-bg',
  error: 'text-error border-error/30 bg-error-bg',
  busy: 'text-db-red border-db-red/30 bg-db-red-50',
  idle: 'text-text-secondary border-border bg-bg-subtle',
};

export default function ImplementStatusBadge({ state, className = '' }) {
  if (!state?.label) return null;
  return (
    <span
      data-implement-status={state.group || ''}
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-1 rounded-md border leading-none ${TONE[state.tone] || TONE.idle} ${className}`}
    >
      {state.label}
    </span>
  );
}
