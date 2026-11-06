import * as Dialog from '@radix-ui/react-dialog';
import { Archive, Cloud, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import type { CloudProject } from '@application/project/project-cloud';
import type { RecentProjectItem } from '@application/project/recent-projects';
import { Button } from '@presentation/components/ui/button';
import { useProjectStore } from '@presentation/features/project-session/use-project-store';

interface ProjectDetailsDialogProps {
  item: RecentProjectItem;
  onOpenChange(open: boolean): void;
  open: boolean;
}

export function ProjectDetailsDialog({ item, onOpenChange, open }: ProjectDetailsDialogProps) {
  const getProject = useProjectStore((state) => state.getCloudProject);
  const updateProject = useProjectStore((state) => state.updateCloudProject);
  const archiveProject = useProjectStore((state) => state.archiveCloudProject);
  const cloudStatus = useProjectStore((state) => state.cloudStatus);
  const cloudError = useProjectStore((state) => state.cloudError);
  const [detail, setDetail] = useState<CloudProject | null>(item.cloud);
  const [name, setName] = useState(item.cloud?.name ?? item.local?.document.manifest.name ?? '');
  const [description, setDescription] = useState(
    item.cloud?.description ?? item.local?.document.manifest.description ?? '',
  );

  useEffect(() => {
    if (!open) return;
    if (item.cloud) {
      void getProject(item.cloud.id).then((project) => {
        if (!project) return;
        setDetail(project);
        setName(project.name);
        setDescription(project.description ?? '');
      });
    }
  }, [getProject, item, open]);

  const remoteId = detail?.id ?? item.cloud?.id ?? null;
  const archived = detail?.status === 'ARCHIVED';
  const busy = cloudStatus !== 'idle';

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!remoteId) return;
    const project = await updateProject(remoteId, { name, description }, item.local?.localId);
    if (project) {
      setDetail(project);
      setName(project.name);
      setDescription(project.description ?? '');
    }
  };

  const archive = async () => {
    if (!remoteId || !window.confirm('Archive this cloud project? The local draft is kept.'))
      return;
    const project = await archiveProject(remoteId);
    if (project) setDetail(project);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl outline-none">
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-cyan-400">
              <Cloud className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">Project details</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                View cloud identity, edit metadata, or archive the remote project.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Close project details">
                <X />
              </Button>
            </Dialog.Close>
          </div>

          {remoteId ? (
            <div className="mt-5 grid gap-2 rounded-lg border border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
              <span>Status: {detail?.status ?? 'Loading…'}</span>
              <span>
                Updated: {detail?.updatedAt ? new Date(detail.updatedAt).toLocaleString() : '—'}
              </span>
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              This project is local-only. Sync it before using cloud edit or archive actions.
            </p>
          )}

          <form className="mt-5 text-xs" onSubmit={save}>
            <label htmlFor="detail-project-name" className="text-xs font-medium">
              Project name
            </label>
            <input
              id="detail-project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              disabled={!remoteId || archived || busy}
              className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
            />
            <label htmlFor="detail-project-description" className="mt-5 block text-xs font-medium">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="detail-project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={4_000}
              rows={4}
              disabled={!remoteId || archived || busy}
              className="mt-2 min-h-24 max-h-48 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">
              {description.length.toLocaleString()} / 4,000
            </p>

            {cloudError ? <p className="mt-3 text-xs text-destructive">{cloudError}</p> : null}

            <div className="mt-6 flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void archive()}
                disabled={!remoteId || archived || busy}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <Archive /> {archived ? 'Archived' : 'Archive'}
              </Button>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost">
                    Close
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={!remoteId || archived || busy || !name.trim()}>
                  {busy ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
