import * as Dialog from '@radix-ui/react-dialog';
import { FolderPlus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@presentation/components/ui/button';

interface CreateProjectDialogProps {
  busy: boolean;
  onCreate(name: string): Promise<boolean>;
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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onCreate(name)) {
      setName('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl outline-none">
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <FolderPlus className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                Create automation project
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                Enter a name, then choose a parent folder. Studio creates a versioned manifest and
                an empty main workflow.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Close create project dialog">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <form className="mt-6" onSubmit={submit}>
            <label htmlFor="project-name" className="text-xs font-medium text-secondary-foreground">
              Project name
            </label>
            <input
              id="project-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Android onboarding"
              maxLength={100}
              className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              A folder-safe name is generated inside the parent directory you select.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Creating…' : 'Choose folder & create'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
