import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Download, FileText, Plus, Trash2, Upload } from 'lucide-react';
import {
  KPI_DIRECTIONS,
  STRATEGY_LABEL_KEYS,
  STRATEGY_MAX_DEPTH,
  countEntries,
  emptyEntry,
  emptyStrategy,
  isEmptyStrategy,
  parseStrategicContext,
  serializeStrategy,
  validateStrategy,
} from '../lib/strategyContext';

const LABEL_DEFAULTS = { priority: 'Business Priority', kpi: 'KPI', key_result: 'Key Result', sponsor: 'Sponsor' };
const inputClass =
  'w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth';
const smallButton =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-2 py-1 rounded-md text-[11px] font-medium border border-border text-text-secondary hover:border-border-strong transition-smooth';

function replaceAt(list, index, item) {
  return list.map((current, i) => (i === index ? item : current));
}

function EntryEditor({ entry, depth, levels, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const levelName = (levels[depth - 1] || '').trim() || (depth === 1 && levels.length <= 1 ? 'Strategic Goal' : `Level ${depth}`);
  const set = (patch) => onChange({ ...entry, ...patch });
  const kpiNames = entry.kpis.map((k) => k.name.trim()).filter(Boolean);
  return (
    <div className="border border-border rounded-lg p-2.5 space-y-2 bg-surface">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-text-tertiary w-28 shrink-0 truncate" title={levelName}>
          {levelName}
        </span>
        <input
          value={entry.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Name, in your own words"
          className={inputClass}
        />
        <button type="button" onClick={() => setOpen(!open)} className={smallButton} title="KPIs and key results">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {entry.kpis.length || entry.key_results.length
            ? `${entry.kpis.length} KPI${entry.kpis.length === 1 ? '' : 's'}, ${entry.key_results.length} result${entry.key_results.length === 1 ? '' : 's'}`
            : 'KPIs'}
        </button>
        {depth < STRATEGY_MAX_DEPTH && (
          <button
            type="button"
            onClick={() => set({ children: [...entry.children, emptyEntry()] })}
            className={smallButton}
            title="Add a child entry"
          >
            <Plus size={12} /> Child
          </button>
        )}
        <button type="button" onClick={onRemove} className={smallButton} title="Remove this entry and its children">
          <Trash2 size={12} />
        </button>
      </div>
      {open && (
        <div className="pl-4 space-y-2">
          {entry.kpis.map((kpi, k) => (
            <div key={`kpi-${k}`} className="grid grid-cols-12 gap-1.5">
              <input
                value={kpi.name}
                onChange={(e) => set({ kpis: replaceAt(entry.kpis, k, { ...kpi, name: e.target.value }) })}
                placeholder="KPI name"
                className={`${inputClass} col-span-4`}
              />
              <input
                value={kpi.unit}
                onChange={(e) => set({ kpis: replaceAt(entry.kpis, k, { ...kpi, unit: e.target.value }) })}
                placeholder="Unit"
                className={`${inputClass} col-span-2`}
              />
              <select
                value={kpi.direction}
                onChange={(e) => set({ kpis: replaceAt(entry.kpis, k, { ...kpi, direction: e.target.value }) })}
                className={`${inputClass} col-span-2`}
              >
                <option value="">Direction</option>
                {KPI_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <input
                value={kpi.definition}
                onChange={(e) => set({ kpis: replaceAt(entry.kpis, k, { ...kpi, definition: e.target.value }) })}
                placeholder="Definition (optional)"
                className={`${inputClass} col-span-3`}
              />
              <button
                type="button"
                onClick={() => set({ kpis: entry.kpis.filter((_, i) => i !== k) })}
                className={`${smallButton} col-span-1 justify-center`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {entry.key_results.map((result, r) => (
            <div key={`kr-${r}`} className="grid grid-cols-12 gap-1.5">
              <input
                value={result.statement}
                onChange={(e) =>
                  set({ key_results: replaceAt(entry.key_results, r, { ...result, statement: e.target.value }) })
                }
                placeholder="Key result, e.g. raise repeat purchase rate from 18% to 24%"
                className={`${inputClass} col-span-8`}
              />
              <select
                value={result.kpi}
                onChange={(e) => set({ key_results: replaceAt(entry.key_results, r, { ...result, kpi: e.target.value }) })}
                className={`${inputClass} col-span-3`}
              >
                <option value="">KPI (optional)</option>
                {kpiNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => set({ key_results: entry.key_results.filter((_, i) => i !== r) })}
                className={`${smallButton} col-span-1 justify-center`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set({ kpis: [...entry.kpis, { name: '', unit: '', direction: '', definition: '' }] })}
              className={smallButton}
            >
              <Plus size={12} /> KPI
            </button>
            <button
              type="button"
              onClick={() => set({ key_results: [...entry.key_results, { statement: '', kpi: '' }] })}
              className={smallButton}
            >
              <Plus size={12} /> Key result
            </button>
          </div>
        </div>
      )}
      {entry.children.length > 0 && (
        <div className="pl-4 border-l border-border space-y-2">
          {entry.children.map((child, c) => (
            <EntryEditor
              key={`child-${c}`}
              entry={child}
              depth={depth + 1}
              levels={levels}
              onChange={(next) => set({ children: replaceAt(entry.children, c, next) })}
              onRemove={() => set({ children: entry.children.filter((_, i) => i !== c) })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function StrategyEditor({ value, onChange, onProblems, prioritySuggestions = [] }) {
  const [initial] = useState(() => parseStrategicContext(value));
  const [mode, setMode] = useState(initial.mode === 'path' ? 'path' : 'tree');
  const [path, setPath] = useState(initial.path);
  const [model, setModel] = useState(initial.model);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(initial.error);
  const [priorityDraft, setPriorityDraft] = useState('');

  const problems = useMemo(() => {
    if (mode === 'path') return path.trim() && !path.trim().startsWith('/') ? ['A file path must start with /.'] : [];
    return validateStrategy(model);
  }, [mode, path, model]);

  useEffect(() => {
    const out = mode === 'path' ? path.trim() : serializeStrategy(model);
    onChange(out);
    if (onProblems) onProblems(problems);
  }, [mode, path, model, problems]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch) => setModel((m) => ({ ...m, ...patch }));
  const addPriority = (name) => {
    const clean = String(name || '').trim();
    if (!clean || model.priorities.some((p) => p.toLowerCase() === clean.toLowerCase())) return;
    update({ priorities: [...model.priorities, clean] });
  };

  const importJson = () => {
    const parsed = parseStrategicContext(importText);
    if (parsed.error) {
      setImportError(parsed.error);
      return;
    }
    setImportError(null);
    setMode(parsed.mode === 'path' ? 'path' : 'tree');
    setPath(parsed.path);
    setModel(parsed.model);
    setImportText('');
  };

  const exportJson = () => {
    const json = serializeStrategy(model);
    const pretty = json ? JSON.stringify(JSON.parse(json), null, 2) : '{}';
    const url = URL.createObjectURL(new Blob([pretty], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'strategic_context.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-text-secondary leading-relaxed">
        Applied after discovery: Inspire aligns each final use case to this strategy with evidence from its own data, adds
        KPIs, key results and benefits, and orders the results. The strategy is never used to find, keep or remove a use case.
      </p>

      <div className="flex gap-1.5">
        {[
          ['tree', 'Edit here'],
          ['path', 'Use a file'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-smooth ${
              mode === key ? 'border-db-red/30 bg-db-red-50 text-db-red' : 'border-border text-text-secondary hover:border-border-strong'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'path' ? (
        <div className="relative">
          <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/Workspace/Users/you/strategy.json or /Volumes/catalog/schema/volume/strategy.json"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono"
          />
        </div>
      ) : (
        <>
          <div>
            <p className="text-xs font-semibold text-text-primary mb-1.5">Levels, top to bottom</p>
            <div className="flex flex-wrap gap-2">
              {model.levels.map((level, index) => (
                <input
                  key={`level-${index}`}
                  value={level}
                  onChange={(e) => update({ levels: replaceAt(model.levels, index, e.target.value) })}
                  placeholder={`Level ${index + 1}, e.g. ${['Strategic Pillar', 'Objective', 'Initiative', 'Program'][index]}`}
                  className={`${inputClass} max-w-[14rem]`}
                />
              ))}
              {model.levels.length < STRATEGY_MAX_DEPTH && (
                <button type="button" onClick={() => update({ levels: [...model.levels, ''] })} className={smallButton}>
                  <Plus size={12} /> Level
                </button>
              )}
              {model.levels.length > 0 && (
                <button type="button" onClick={() => update({ levels: model.levels.slice(0, -1) })} className={smallButton}>
                  <Trash2 size={12} /> Last level
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-text-primary mb-1.5">
              Strategy entries <span className="text-text-tertiary font-normal">({countEntries(model.strategy)} of 200)</span>
            </p>
            <div className="space-y-2">
              {model.strategy.map((entry, index) => (
                <EntryEditor
                  key={`entry-${index}`}
                  entry={entry}
                  depth={1}
                  levels={model.levels}
                  onChange={(next) => update({ strategy: replaceAt(model.strategy, index, next) })}
                  onRemove={() => update({ strategy: model.strategy.filter((_, i) => i !== index) })}
                />
              ))}
              <button type="button" onClick={() => update({ strategy: [...model.strategy, emptyEntry()] })} className={smallButton}>
                <Plus size={12} /> Entry
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-text-primary mb-1.5">Business priorities (replace the selection above)</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {model.priorities.map((priority) => (
                <span key={priority} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-db-red/30 bg-db-red-50 text-db-red">
                  {priority}
                  <button type="button" onClick={() => update({ priorities: model.priorities.filter((p) => p !== priority) })}>
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={priorityDraft}
                onChange={(e) => setPriorityDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPriority(priorityDraft);
                    setPriorityDraft('');
                  }
                }}
                placeholder="Type a priority in your own words and press Enter"
                className={inputClass}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {prioritySuggestions
                .filter((s) => !model.priorities.some((p) => p.toLowerCase() === s.toLowerCase()))
                .map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => addPriority(suggestion)} className={smallButton}>
                    <Plus size={10} /> {suggestion}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-text-primary mb-1.5">Sponsor roster</p>
            <div className="space-y-1.5">
              {model.sponsors.map((sponsor, index) => (
                <div key={`sponsor-${index}`} className="grid grid-cols-12 gap-1.5">
                  <input
                    value={sponsor.role}
                    onChange={(e) => update({ sponsors: replaceAt(model.sponsors, index, { ...sponsor, role: e.target.value }) })}
                    placeholder="Role, e.g. Chief Customer Officer"
                    className={`${inputClass} col-span-3`}
                  />
                  <input
                    value={sponsor.name}
                    onChange={(e) => update({ sponsors: replaceAt(model.sponsors, index, { ...sponsor, name: e.target.value }) })}
                    placeholder="Name (optional)"
                    className={`${inputClass} col-span-2`}
                  />
                  <input
                    value={sponsor.reports_to}
                    onChange={(e) =>
                      update({ sponsors: replaceAt(model.sponsors, index, { ...sponsor, reports_to: e.target.value }) })
                    }
                    placeholder="Reports to (role)"
                    className={`${inputClass} col-span-3`}
                  />
                  <input
                    value={sponsor.owns.join(', ')}
                    onChange={(e) =>
                      update({
                        sponsors: replaceAt(model.sponsors, index, {
                          ...sponsor,
                          owns: e.target.value.split(',').map((s) => s.trimStart()),
                        }),
                      })
                    }
                    placeholder="Owns: entries or domains, comma-separated"
                    className={`${inputClass} col-span-3`}
                  />
                  <button
                    type="button"
                    onClick={() => update({ sponsors: model.sponsors.filter((_, i) => i !== index) })}
                    className={`${smallButton} col-span-1 justify-center`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update({ sponsors: [...model.sponsors, { role: '', name: '', reports_to: '', owns: [] }] })}
                className={smallButton}
              >
                <Plus size={12} /> Sponsor
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-text-primary mb-1.5">Your terms (optional)</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {STRATEGY_LABEL_KEYS.map((key) => (
                <input
                  key={key}
                  value={model.labels[key] || ''}
                  onChange={(e) => update({ labels: { ...model.labels, [key]: e.target.value } })}
                  placeholder={LABEL_DEFAULTS[key]}
                  className={inputClass}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-text-primary">Import or export JSON</p>
        <textarea
          rows={3}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='Paste a strategic context, e.g. {"schema_version": 1, "levels": ["Pillar"], "strategy": ["Grow revenue"]}'
          className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth font-mono resize-none"
        />
        <div className="flex gap-2">
          <button type="button" onClick={importJson} disabled={!importText.trim()} className={smallButton}>
            <Upload size={12} /> Import
          </button>
          <button type="button" onClick={exportJson} disabled={mode !== 'tree' || isEmptyStrategy(model)} className={smallButton}>
            <Download size={12} /> Export
          </button>
          {(mode === 'path' ? path.trim() : !isEmptyStrategy(model)) && (
            <button
              type="button"
              onClick={() => {
                setMode('tree');
                setPath('');
                setModel(emptyStrategy());
              }}
              className={smallButton}
            >
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {(importError || problems.length > 0) && (
        <div className="rounded-lg border border-db-red/30 bg-db-red-50 px-3 py-2 space-y-1">
          {[importError, ...problems].filter(Boolean).slice(0, 8).map((problem) => (
            <p key={problem} className="text-[11px] text-db-red flex items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {problem}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
