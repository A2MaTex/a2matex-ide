import { Image, LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { RuntimeNodeAttempt } from '@application/runtime/runtime.types';
import { Button } from '@presentation/components/ui/button';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function artifactIdFromAttempt(attempt: RuntimeNodeAttempt | null) {
  if (attempt?.status !== 'SUCCEEDED' || !attempt.output) return null;
  const artifactId = attempt.output.artifactId;
  return typeof artifactId === 'string' && UUID_V4.test(artifactId) ? artifactId : null;
}

export function ArtifactPreview({ attempt }: { attempt: RuntimeNodeAttempt | null }) {
  const artifactId = artifactIdFromAttempt(attempt);
  const activeRequestRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const revokeUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setObjectUrl(null);
  }, []);

  const cancelRequest = useCallback(() => {
    const requestId = activeRequestRef.current;
    activeRequestRef.current = null;
    generationRef.current += 1;
    if (requestId) void window.studioHost?.runtime.cancelArtifactPreview({ requestId });
  }, []);

  const close = useCallback(() => {
    cancelRequest();
    revokeUrl();
    setLoading(false);
    setError(null);
  }, [cancelRequest, revokeUrl]);

  useEffect(() => close, [attempt?.id, close]);

  const load = useCallback(async () => {
    if (!artifactId) return;
    const host = window.studioHost;
    if (!host || typeof host.runtime.getArtifactPreview !== 'function') {
      setError('Restart A2MaTeX Studio to load the artifact preview bridge.');
      return;
    }
    cancelRequest();
    revokeUrl();
    setError(null);
    setLoading(true);
    const requestId = crypto.randomUUID();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    activeRequestRef.current = requestId;
    try {
      const result = await host.runtime.getArtifactPreview({ artifactId, requestId });
      if (generation !== generationRef.current || activeRequestRef.current !== requestId) return;
      activeRequestRef.current = null;
      if (!result.ok) {
        if (result.error.code !== 'RUNTIME_REQUEST_CANCELLED') setError(result.error.message);
        return;
      }
      const bytes = Uint8Array.from(result.value.bytes);
      const url = URL.createObjectURL(new Blob([bytes], { type: result.value.mimeType }));
      if (generation !== generationRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      objectUrlRef.current = url;
      setObjectUrl(url);
    } catch (reason) {
      if (generation === generationRef.current) {
        setError(reason instanceof Error ? reason.message : 'Unable to load the artifact preview.');
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [artifactId, cancelRequest, revokeUrl]);

  if (!artifactId) return null;

  return (
    <div className="mt-3 rounded-md border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">Screenshot artifact</p>
          <p className="mt-0.5 break-all font-mono text-[9px] text-muted-foreground">
            {artifactId}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => void load()}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Image />}
            {objectUrl ? 'Reload' : 'Preview'}
          </Button>
          {loading || objectUrl ? (
            <Button size="sm" variant="ghost" aria-label="Close artifact preview" onClick={close}>
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-destructive">Preview failed: {error}</p> : null}
      {objectUrl ? (
        <img
          className="mt-3 max-h-[28rem] max-w-full rounded border border-border object-contain"
          src={objectUrl}
          alt="Saved Runtime screenshot artifact"
          onError={() => {
            revokeUrl();
            setError('The downloaded PNG could not be decoded.');
          }}
        />
      ) : null}
    </div>
  );
}
