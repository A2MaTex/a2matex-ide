import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';

export interface WorkflowAction {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  run(): void;
}

interface WorkflowActionListProps {
  open: boolean;
  mode: 'command' | 'context';
  position?: { x: number; y: number };
  actions: readonly WorkflowAction[];
  onClose(): void;
}

export function WorkflowActionList({
  open,
  mode,
  position,
  actions,
  onClose,
}: WorkflowActionListProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? actions.filter((action) => action.label.toLocaleLowerCase().includes(normalized))
      : actions;
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [onClose, open]);

  if (!open) return null;
  const contextStyle =
    mode === 'context' && position
      ? {
          left: Math.min(position.x, window.innerWidth - 300),
          top: Math.min(position.y, window.innerHeight - 430),
        }
      : undefined;

  return (
    <div
      className={
        mode === 'command'
          ? 'fixed inset-0 z-70 flex justify-center bg-black/45 pt-[12vh]'
          : 'fixed inset-0 z-70 pointer-events-none'
      }
      role="presentation"
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal={mode === 'command'}
        aria-label={mode === 'command' ? 'Workflow action list' : 'Workflow context menu'}
        style={contextStyle}
        className={
          'overflow-hidden rounded-lg border border-border bg-panel shadow-2xl text-sm ' +
          (mode === 'command' ? 'h-fit w-full max-w-lg' : 'pointer-events-auto absolute w-72')
        }
      >
        {mode === 'command' && (
          <label className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="size-4 text-muted-foreground" />
            <span className="sr-only">Search actions</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actions…"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
            <button type="button" onClick={onClose} aria-label="Close action list">
              <X className="size-3.5 text-muted-foreground" />
            </button>
          </label>
        )}
        <div className="max-h-96 overflow-y-auto p-1.5">
          {filtered.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  action.run();
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {Icon ? (
                  <Icon className="size-3.5 text-muted-foreground" />
                ) : (
                  <span className="size-3.5" />
                )}
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
                {action.shortcut ? (
                  <kbd className="font-mono text-[10px] text-muted-foreground">
                    {action.shortcut}
                  </kbd>
                ) : null}
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No matching actions.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
