import { describe, expect, it } from 'vitest';

import type { InspectorNode } from '@domain/android-inspector/android-inspector';
import {
  getInspectorCandidates,
  getScreenshotGeometry,
  toImagePoint,
  toViewportBounds,
} from '@domain/android-inspector/geometry';

function node(
  nodeId: string,
  depth: number,
  traversalIndex: number,
  bounds: InspectorNode['bounds'],
): InspectorNode {
  return {
    nodeId,
    depth,
    traversalIndex,
    bounds,
    className: 'android.view.View',
    clickable: false,
    enabled: true,
  };
}

describe('Android Inspector screenshot geometry', () => {
  it('maps points through letterboxing and rejects clicks outside the image', () => {
    const geometry = getScreenshotGeometry(100, 200, 300, 300)!;

    expect(geometry).toMatchObject({
      scale: 1.5,
      renderedWidth: 150,
      renderedHeight: 300,
      offsetX: 75,
      offsetY: 0,
    });
    expect(toImagePoint({ x: 150, y: 150 }, geometry)).toEqual({ x: 50, y: 100 });
    expect(toImagePoint({ x: 74, y: 150 }, geometry)).toBeNull();
  });

  it('maps original bounds back to the rendered viewport', () => {
    const geometry = getScreenshotGeometry(100, 200, 300, 300)!;

    expect(toViewportBounds({ left: 10, top: 20, right: 30, bottom: 60 }, geometry)).toEqual({
      left: 90,
      top: 30,
      width: 30,
      height: 60,
    });
  });
});

describe('Android Inspector hit-testing', () => {
  it('keeps all overlaps and sorts by depth, area, then traversal index', () => {
    const nodes = [
      node('parent', 0, 0, { left: 0, top: 0, right: 100, bottom: 100 }),
      node('deep-large', 2, 1, { left: 10, top: 10, right: 90, bottom: 90 }),
      node('deep-small-later', 2, 3, { left: 40, top: 40, right: 60, bottom: 60 }),
      node('deep-small-first', 2, 2, { left: 40, top: 40, right: 60, bottom: 60 }),
    ];

    expect(getInspectorCandidates(nodes, { x: 50, y: 50 }).map((entry) => entry.nodeId)).toEqual([
      'deep-small-first',
      'deep-small-later',
      'deep-large',
      'parent',
    ]);
  });

  it('uses half-open rectangles and ignores malformed bounds', () => {
    const nodes = [
      node('valid', 0, 0, { left: 0, top: 0, right: 10, bottom: 10 }),
      node('empty', 1, 1, { left: 5, top: 5, right: 5, bottom: 8 }),
    ];

    expect(getInspectorCandidates(nodes, { x: 9, y: 9 }).map((entry) => entry.nodeId)).toEqual([
      'valid',
    ]);
    expect(getInspectorCandidates(nodes, { x: 10, y: 9 })).toEqual([]);
  });
});
