import {
  Braces,
  ChevronRight,
  CirclePlay,
  FileJson2,
  Folder,
  GitBranch,
  PanelBottom,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useParams } from 'react-router-dom';

import { Button } from '@presentation/components/ui/button';

function ResizeHandle({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      className={
        orientation === 'horizontal'
          ? 'group relative w-px bg-border outline-none data-[separator=hover]:bg-primary data-[separator=active]:bg-primary'
          : 'group relative h-px bg-border outline-none data-[separator=hover]:bg-primary data-[separator=active]:bg-primary'
      }
    />
  );
}

function PanelTitle({ icon: Icon, title }: { icon: typeof Folder; title: string }) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <Icon className="size-3.5" />
      {title}
    </div>
  );
}

export function WorkspacePage() {
  const { projectId = 'local-sandbox' } = useParams();

  return (
    <div className="flex h-full min-h-[460px] flex-col overflow-hidden bg-editor-canvas">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-panel px-3">
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span>Projects</span>
          <ChevronRight className="size-3" />
          <span className="truncate font-medium text-foreground">{projectId}</span>
          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">
            unsaved shell
          </span>
        </div>
        <Button size="sm" variant="ghost" disabled>
          <CirclePlay /> Run
        </Button>
      </div>

      <Group className="min-h-0 flex-1" orientation="vertical">
        <Panel defaultSize="74%" minSize="45%">
          <Group className="h-full" orientation="horizontal">
            <Panel defaultSize="19%" minSize="14%" maxSize="32%">
              <section className="h-full bg-panel" aria-label="Project explorer">
                <PanelTitle icon={Folder} title="Explorer" />
                <div className="p-2 text-xs">
                  <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-background/50 px-2 py-1.5 text-muted-foreground">
                    <Search className="size-3.5" /> Search project
                  </div>
                  <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-secondary-foreground">
                    <ChevronRight className="size-3" />
                    <Folder className="size-3.5 text-primary" /> workflows
                  </div>
                  <div className="ml-5 flex items-center gap-1.5 rounded bg-accent px-1.5 py-1 text-foreground">
                    <FileJson2 className="size-3.5 text-warning" /> main.workflow.json
                  </div>
                </div>
              </section>
            </Panel>
            <ResizeHandle orientation="horizontal" />

            <Panel defaultSize="56%" minSize="30%">
              <section
                className="flex h-full flex-col bg-editor-canvas"
                aria-label="Workflow canvas"
              >
                <div className="flex h-9 items-center border-b border-border bg-panel/80 px-3 text-xs">
                  <span className="border-b-2 border-primary px-2 py-2.5 font-medium">
                    main.workflow
                  </span>
                </div>
                <div className="editor-grid relative grid min-h-0 flex-1 place-items-center overflow-hidden">
                  <div className="max-w-sm rounded-xl border border-dashed border-border bg-panel/70 p-6 text-center shadow-2xl shadow-black/20 backdrop-blur">
                    <div className="mx-auto grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                      <GitBranch className="size-5" />
                    </div>
                    <h1 className="mt-4 text-sm font-semibold">Empty workflow canvas</h1>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      The Phase 0 shell is ready. Node catalog, graph commands, and validation are
                      introduced in Phase 2.
                    </p>
                  </div>
                </div>
              </section>
            </Panel>
            <ResizeHandle orientation="horizontal" />

            <Panel defaultSize="25%" minSize="18%" maxSize="38%">
              <section className="h-full bg-panel" aria-label="Node inspector">
                <PanelTitle icon={SlidersHorizontal} title="Inspector" />
                <div className="grid h-[calc(100%-2.25rem)] place-items-center px-5 text-center">
                  <div>
                    <Braces className="mx-auto size-5 text-muted-foreground" />
                    <p className="mt-3 text-xs font-medium">No node selected</p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      Node properties will be generated from catalog schemas.
                    </p>
                  </div>
                </div>
              </section>
            </Panel>
          </Group>
        </Panel>

        <ResizeHandle orientation="vertical" />
        <Panel defaultSize="26%" minSize="15%" maxSize="45%">
          <section className="h-full bg-panel" aria-label="Output panel">
            <PanelTitle icon={PanelBottom} title="Problems · Output · Diagnostics" />
            <div className="p-4 font-mono text-[11px] text-muted-foreground">
              <span className="text-success">[foundation]</span> Workspace shell initialized. No
              project or Runtime session is active.
            </div>
          </section>
        </Panel>
      </Group>
    </div>
  );
}
