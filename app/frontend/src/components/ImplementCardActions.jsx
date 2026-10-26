import { Sparkles } from 'lucide-react';
import ImplementStatusBadge from './ImplementStatusBadge';

export default function ImplementCardActions({ status = null, onImplement }) {
  const canStart = typeof onImplement === 'function';
  if (!canStart && !status?.label) return null;
  return (
    <div className="px-5 pb-3 flex flex-wrap items-center gap-2" data-implement-actions="">
      {canStart && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onImplement(); }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red hover:bg-db-red-hover shadow-sm shadow-db-red/20 transition-smooth"
        >
          <Sparkles size={13} />
          Start Use Case PoC with Genie
        </button>
      )}
      <ImplementStatusBadge state={status} />
    </div>
  );
}
