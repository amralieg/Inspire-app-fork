import { flexRender } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

const SORT_ICON = { asc: ArrowUp, desc: ArrowDown };

export default function UseCaseGrid({ table, density = 'compact', activeKey, onOpen, className = '' }) {
  const pad = density === 'comfortable' ? 'py-3' : 'py-1.5';
  const rows = table.getRowModel().rows;
  const columns = table.getVisibleLeafColumns();
  const minWidth = columns.reduce((sum, col) => sum + col.getSize(), 0);
  const openRow = (e, row) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(row.original);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const sibling = e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      sibling?.focus();
    }
  };

  return (
    <div className={`overflow-auto rounded-xl border border-border bg-surface shadow-sm ${className}`} role="region" aria-label="Use case grid">
      <table className="w-full table-fixed border-collapse text-xs" style={{ minWidth }} data-use-case-grid="">
        <colgroup>
          {columns.map((col) => (
            <col key={col.id} data-col={col.id} style={col.columnDef.meta?.grow ? undefined : { width: col.getSize() }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-bg-subtle">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const col = header.column;
                const sorted = col.getIsSorted();
                const Icon = sorted ? SORT_ICON[sorted] : ArrowUpDown;
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    className={`border-b border-border px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-text-tertiary`}
                  >
                    {col.getCanSort() ? (
                      <button
                        type="button"
                        onClick={col.getToggleSortingHandler()}
                        className={`inline-flex items-center gap-1 hover:text-text-primary ${sorted ? 'text-text-primary' : ''}`}
                        title={`Sort by ${col.columnDef.meta?.label || col.id}`}
                      >
                        {flexRender(col.columnDef.header, header.getContext())}
                        <Icon size={10} className={sorted ? '' : 'opacity-40'} />
                      </button>
                    ) : flexRender(col.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = row.original.key === activeKey;
            return (
              <tr
                key={row.id}
                tabIndex={0}
                aria-selected={active}
                data-row-id={row.original.id || row.original.key}
                data-row-key={row.original.key}
                onClick={() => onOpen(row.original)}
                onKeyDown={(e) => openRow(e, row)}
                className={`cursor-pointer border-b border-border-subtle outline-none transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-db-red/40 ${active ? 'bg-db-red-50' : ''}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={`px-2 ${pad} align-middle text-text-secondary`}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
