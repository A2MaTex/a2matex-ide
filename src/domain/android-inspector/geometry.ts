import type { InspectorBounds, InspectorNode } from '@domain/android-inspector/android-inspector';

export interface InspectorPoint {
  x: number;
  y: number;
}

export interface ScreenshotGeometry {
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
}

export function getScreenshotGeometry(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): ScreenshotGeometry | null {
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  const scale = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  return {
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: (viewportWidth - renderedWidth) / 2,
    offsetY: (viewportHeight - renderedHeight) / 2,
  };
}

export function toImagePoint(
  pointer: InspectorPoint,
  geometry: ScreenshotGeometry,
): InspectorPoint | null {
  const right = geometry.offsetX + geometry.renderedWidth;
  const bottom = geometry.offsetY + geometry.renderedHeight;
  if (
    pointer.x < geometry.offsetX ||
    pointer.x >= right ||
    pointer.y < geometry.offsetY ||
    pointer.y >= bottom
  ) {
    return null;
  }
  return {
    x: (pointer.x - geometry.offsetX) / geometry.scale,
    y: (pointer.y - geometry.offsetY) / geometry.scale,
  };
}

export function toViewportBounds(bounds: InspectorBounds, geometry: ScreenshotGeometry) {
  return {
    left: geometry.offsetX + bounds.left * geometry.scale,
    top: geometry.offsetY + bounds.top * geometry.scale,
    width: (bounds.right - bounds.left) * geometry.scale,
    height: (bounds.bottom - bounds.top) * geometry.scale,
  };
}

export function isValidBounds(bounds: InspectorBounds) {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.right) &&
    Number.isFinite(bounds.bottom) &&
    bounds.right > bounds.left &&
    bounds.bottom > bounds.top
  );
}

function boundsArea(bounds: InspectorBounds) {
  return (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
}

export function getInspectorCandidates(
  nodes: readonly InspectorNode[],
  point: InspectorPoint,
): InspectorNode[] {
  return nodes
    .filter(
      (node) =>
        isValidBounds(node.bounds) &&
        node.bounds.left <= point.x &&
        point.x < node.bounds.right &&
        node.bounds.top <= point.y &&
        point.y < node.bounds.bottom,
    )
    .sort(
      (left, right) =>
        right.depth - left.depth ||
        boundsArea(left.bounds) - boundsArea(right.bounds) ||
        left.traversalIndex - right.traversalIndex,
    );
}
