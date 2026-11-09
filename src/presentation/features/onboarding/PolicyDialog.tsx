import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import type { PolicyDocument } from '@application/onboarding/policy-manifest';
import { Button } from '@presentation/components/ui/button';

interface PolicyDialogProps {
  policy: PolicyDocument | null;
  onClose(): void;
}

function policyDocument(policy: PolicyDocument) {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:14px/1.65 system-ui,sans-serif;color:#e5e7eb;background:#090d14;padding:20px}h1,h2,h3,strong,b{color:#fff}a{color:#67e8f9}ul{padding-left:22px}</style></head><body>${policy.contentHtml ?? ''}</body></html>`;
}

export function PolicyDialog({ policy, onClose }: PolicyDialogProps) {
  return (
    <Dialog.Root open={Boolean(policy)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[min(88vh,760px)] w-[min(92vw,780px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl outline-none">
          <header className="flex items-start gap-3 border-b border-border p-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">{policy?.title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Version {policy?.version}
                {policy?.publishedAt
                  ? ` · Published ${new Date(policy.publishedAt).toLocaleDateString()}`
                  : ''}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Close policy">
                <X />
              </Button>
            </Dialog.Close>
          </header>
          {policy?.contentHtml ? (
            <iframe
              title={policy.title}
              sandbox=""
              srcDoc={policyDocument(policy)}
              className="min-h-0 flex-1 border-0 bg-background"
            />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
              Policy content is unavailable.
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
