import {
  ChevronRight,
  CirclePlay,
  FileJson2,
  Folder,
  GitBranch,
  PanelBottom,
  Save,
  SaveAll,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { useEffect } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@presentation/components/ui/button';
import { useProjectCloseGuard } from '@presentation/features/project-session/use-project-close-guard';
import { useProjectStore } from '@presentation/features/project-session/use-project-store';
import { projectStoreIsDirty } from '@presentation/stores/project-store';

function ResizeHandle({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      className={
        orientation === 'horizontal'
          ? 'w-px bg-border outline-none data-[separator=hover]:bg-primary data-[separator=active]:bg-primary'
          : 'h-px bg-border outline-none data-[separator=hover]:bg-primary data-[separator=active]:bg-primary'
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

export function ProjectWorkspacePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const session = useProjectStore((state) => state.session);
  const status = useProjectStore((state) => state.status);
  const error = useProjectStore((state) => state.error);
  const dirty = useProjectStore(projectStoreIsDirty);
  const save = useProjectStore((state) => state.save);
  const saveAs = useProjectStore((state) => state.saveAs);
  const updateProjectName = useProjectStore((state) => state.updateProjectName);
  const close = useProjectStore((state) => state.close);
  useProjectCloseGuard(dirty);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (session && status !== 'saving') void save();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [save, session, status]);

  if (!session || session.snapshot.document.manifest.projectId !== projectId) {
    return (
      <div className="grid h-full place-items-center bg-editor-canvas p-8 text-center">
        <div className="max-w-md rounded-xl border border-border bg-card p-7 shadow-xl">
          <Folder className="mx-auto size-7 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold">No project is loaded</h1>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Open or create a project before entering its workspace. Deep links never assume the
            local folder is still available.
          </p>
          <Button className="mt-5" onClick={() => navigate('/projects')}>
            Go to projects
          </Button>
        </div>
      </div>
    );
  }

  const { document, location, migration } = session.snapshot;
  const manifest = document.manifest;
  const workflowPath = manifest.entryWorkflow;
  const workflow = document.workflows[workflowPath];
  const saving = status === 'saving';

  const closeProject = () => {
    if (dirty && !window.confirm('Close this project and discard unsaved changes?')) return;
    close();
    navigate('/projects');
  };

  return (
    <div className="flex h-full min-h-[460px] flex-col overflow-hidden bg-editor-canvas">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-panel px-3">
        <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="hover:text-foreground"
          >
            Projects
          </button>
          <ChevronRight className="size-3" />
          <span className="truncate font-medium text-foreground">{manifest.name}</span>
          <span
            className={
              dirty
                ? 'ml-2 rounded bg-warning/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-warning'
                : 'ml-2 rounded bg-success/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-success'
            }
          >
            {dirty ? 'unsaved' : 'saved'}
          </span>
          {migration ? (
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] text-warning">
              Migrated v{migration.fromVersion} → v{migration.toVersion}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={closeProject}>
            <X /> Close
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void saveAs()} disabled={saving}>
            <SaveAll /> Save As
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void save()}
            disabled={saving || !dirty}
          >
            <Save /> {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" disabled>
            <CirclePlay /> Run
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      ) : null}

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
                    <FileJson2 className="size-3.5 text-primary" /> a2matex.project.json
                  </div>
                  <div className="flex items-center gap-1.5 rounded px-1.5 py-1 text-secondary-foreground">
                    <ChevronRight className="size-3" />
                    <Folder className="size-3.5 text-primary" /> workflows
                  </div>
                  {manifest.workflows.map((path) => (
                    <div
                      key={path}
                      className={
                        path === workflowPath
                          ? 'ml-5 flex items-center gap-1.5 rounded bg-accent px-1.5 py-1 text-foreground'
                          : 'ml-5 flex items-center gap-1.5 rounded px-1.5 py-1 text-secondary-foreground'
                      }
                    >
                      <FileJson2 className="size-3.5 text-warning" /> {path.split('/').at(-1)}
                    </div>
                  ))}
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
                    {workflow?.name ?? 'Workflow'}
                  </span>
                </div>
                <div className="editor-grid relative grid min-h-0 flex-1 place-items-center overflow-hidden">
                  <div className="max-w-sm rounded-xl border border-dashed border-border bg-panel/70 p-6 text-center shadow-2xl shadow-black/20 backdrop-blur">
                    <div className="mx-auto grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                      <GitBranch className="size-5" />
                    </div>
                    <h1 className="mt-4 text-sm font-semibold">
                      {workflow?.name ?? 'Empty workflow'}
                    </h1>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Project persistence is active. Visual node authoring begins in Phase 2.
                    </p>
                  </div>
                </div>
              </section>
            </Panel>
            <ResizeHandle orientation="horizontal" />
            <Panel defaultSize="25%" minSize="18%" maxSize="38%">
              <section className="h-full bg-panel" aria-label="Project inspector">
                <PanelTitle icon={Settings2} title="Project" />
                <div className="space-y-5 p-4">
                  <div>
                    <label
                      htmlFor="manifest-name"
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Display name
                    </label>
                    <input
                      id="manifest-name"
                      value={manifest.name}
                      maxLength={100}
                      onChange={(event) => updateProjectName(event.target.value)}
                      className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Version</div>
                      <div className="mt-1 font-mono">{manifest.version}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Schema</div>
                      <div className="mt-1 font-mono">v{manifest.schemaVersion}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Location grant</div>
                    <div
                      className="mt-1 truncate font-mono text-[10px]"
                      title={location.displayPath}
                    >
                      {location.displayPath}
                    </div>
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
              <span className="text-success">[project]</span> schema={manifest.schemaVersion} ·
              revision={session.workingRevision} · saved={session.savedRevision}
              <br />
              <span className="text-success">[project]</span> {manifest.workflows.length} workflow
              file(s) loaded and validated.
            </div>
          </section>
        </Panel>
      </Group>
    </div>
  );
}
