import { useEffect, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';

export default function ColumnChooser({ table, onReset }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const shown = columns.filter((c) => c.getIsVisible()).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[11px] font-medium text-text-secondary hover:border-border-strong"
      >
        <Columns3 size={13} />
        Columns
        <span className="tabular-nums text-text-tertiary">{shown}/{columns.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-border bg-surface p-2 shadow-elevated" role="group" aria-label="Choose columns">
          <ul className="max-h-72 space-y-px overflow-y-auto">
            {columns.map((col) => (
              <li key={col.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-text-secondary hover:bg-bg-subtle">
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                    className="h-3.5 w-3.5 accent-db-red"
                  />
                  {col.columnDef.meta?.label || col.id}
                </label>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onReset} className="mt-1 w-full rounded px-1.5 py-1 text-left text-[10px] font-semibold text-db-red-fg hover:bg-bg-subtle">
            Reset to default columns
          </button>
        </div>
      )}
    </div>
  );
}
