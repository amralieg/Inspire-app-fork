import { useState } from 'react';
import { Bookmark, BookmarkPlus, X } from 'lucide-react';

export default function SavedViews({ builtIns, saved, activeId, onApply, onSave, onDelete, error = '' }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmId, setConfirmId] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (onSave(name)) {
      setNaming(false);
      setName('');
    }
  };

  const tab = (view, removable) => {
    const active = view.id === activeId;
    return (
      <li key={view.id} className="flex shrink-0 items-center">
        <button
          type="button"
          aria-pressed={active}
          onClick={() => onApply(view)}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            active ? 'bg-db-red-50 text-db-red-fg ring-1 ring-inset ring-db-red/25' : 'text-text-secondary hover:bg-bg-subtle'
          }`}
        >
          {removable && <Bookmark size={11} />}
          {view.name}
        </button>
        {removable && (confirmId === view.id ? (
          <span className="ml-1 inline-flex items-center gap-1 text-[10px]">
            <button type="button" onClick={() => { onDelete(view.id); setConfirmId(''); }} className="font-semibold text-error-fg hover:underline">Delete</button>
            <button type="button" onClick={() => setConfirmId('')} className="text-text-tertiary hover:underline">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmId(view.id)} className="ml-0.5 rounded p-0.5 text-text-tertiary hover:text-text-primary" aria-label={`Delete view ${view.name}`}>
            <X size={10} />
          </button>
        ))}
      </li>
    );
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <ul className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Views">
        {builtIns.map((v) => tab(v, false))}
        {saved.map((v) => tab(v, true))}
      </ul>
      {naming ? (
        <form onSubmit={submit} className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setNaming(false); setName(''); } }}
            maxLength={60}
            placeholder="Name this view"
            aria-label="View name"
            className="w-40 rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-text-primary placeholder:text-text-tertiary focus:border-db-red/30 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-db-red-solid px-2 py-1 text-[11px] font-semibold text-white hover:bg-db-red-solid-hover">Save</button>
          <button type="button" onClick={() => { setNaming(false); setName(''); }} className="px-1 text-[11px] text-text-tertiary hover:underline">Cancel</button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-tertiary hover:bg-bg-subtle hover:text-text-primary"
          title="Save the current filters, sort and columns as a view in this browser"
        >
          <BookmarkPlus size={12} />
          Save view
        </button>
      )}
      {error && <p className="w-full text-[11px] text-error-fg" role="alert">{error}</p>}
    </div>
  );
}
