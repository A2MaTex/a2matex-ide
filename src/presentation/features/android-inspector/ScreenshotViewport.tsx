import type { MouseEvent } from 'react';

import type { InspectorNode, InspectorSnapshot } from '@domain/android-inspector/android-inspector';
import { getScreenshotGeometry, toImagePoint } from '@domain/android-inspector/geometry';

interface ScreenshotViewportProps {
  imageUrl: string;
  snapshot: InspectorSnapshot;
  selectedNode: InspectorNode | null;
  onSelectPoint(point: { x: number; y: number }): void;
}

export function ScreenshotViewport({
  imageUrl,
  snapshot,
  selectedNode,
  onSelectPoint,
}: ScreenshotViewportProps) {
  const { width, height } = snapshot.screenshot;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const geometry = getScreenshotGeometry(width, height, bounds.width, bounds.height);
    if (!geometry) return;
    const point = toImagePoint(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      geometry,
    );
    if (!point) return;
    onSelectPoint({ x: Math.floor(point.x), y: Math.floor(point.y) });
  };

  const overlay = selectedNode
    ? {
        left: `${(selectedNode.bounds.left / width) * 100}%`,
        top: `${(selectedNode.bounds.top / height) * 100}%`,
        width: `${((selectedNode.bounds.right - selectedNode.bounds.left) / width) * 100}%`,
        height: `${((selectedNode.bounds.bottom - selectedNode.bounds.top) / height) * 100}%`,
      }
    : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative block w-full cursor-crosshair overflow-hidden rounded-md border border-border bg-black text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ aspectRatio: `${width} / ${height}` }}
      aria-label="Inspect Android snapshot"
    >
      <img
        src={imageUrl}
        alt={`Android snapshot from ${snapshot.deviceId}`}
        draggable={false}
        className="absolute inset-0 size-full select-none object-contain"
      />
      {overlay ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute border-2 border-cyan-300 bg-cyan-300/20 shadow-[0_0_0_1px_rgb(0_0_0/55%)]"
          style={overlay}
        />
      ) : null}
    </button>
  );
}
