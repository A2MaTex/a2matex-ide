import * as Dialog from '@radix-ui/react-dialog';
import { FolderPlus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type { CreateProjectInput } from '@application/project/project-repository';
import { Button } from '@presentation/components/ui/button';

interface CreateProjectDialogProps {
  busy: boolean;
  onCreate(input: CreateProjectInput): Promise<boolean>;
  onOpenChange(open: boolean): void;
  open: boolean;
}

export function CreateProjectDialog({
  busy,
  onCreate,
  onOpenChange,
  open,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onCreate({ name, description })) {
      setName('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl outline-none">
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-cyan-400">
              <FolderPlus className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                Create automation project
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                Studio creates a local working copy and an empty main workflow immediately. No
                folder or network connection is required.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Close create project dialog">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <form className="mt-6 text-xs" onSubmit={submit}>
            <label htmlFor="project-name" className="text-xs font-medium text-secondary-foreground">
              Project name
            </label>
            <input
              id="project-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Android onboarding"
              maxLength={255}
              className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Project names must be unique within your local account scope.
            </p>
            <label
              htmlFor="project-description"
              className="mt-5 block text-xs font-medium text-secondary-foreground"
            >
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what this automation does"
              maxLength={4_000}
              rows={4}
              className="mt-2 min-h-24 max-h-48 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">
              {description.length.toLocaleString()} / 4,000
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={busy}>
                  <span className="text-sm font-medium">Cancel</span>
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={busy || !name.trim()}>
                <span className="text-sm font-medium">{busy ? 'Creating…' : 'Create project'}</span>
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
