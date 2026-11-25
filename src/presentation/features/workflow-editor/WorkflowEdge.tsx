import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react';
import { useContext } from 'react';

import { RunOverlayContext } from '@presentation/features/test-run/run-overlay';

/** Horizontal room the edge needs before it can bend back (handle + arrow). */
const BACKWARD_MARGIN = 24;
/** Node card half height plus its label, so a back edge on the same row passes under the nodes. */
const UNDER_ROW_OFFSET = 110;

/**
 * Forward connections keep the smooth curve. When the target sits behind the source, the edge
 * is routed with right angles (out → down → back → into the target), like n8n.
 */
export function WorkflowEdge({
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps) {
  const run = useContext(RunOverlayContext);
  // Taken on the selected device: the source finished and the target was reached.
  const sourceStatus = run?.statusFor(source)?.status;
  const traversed = Boolean(sourceStatus === 'succeeded' && run?.statusFor(target));
  // "Behind" means the target starts left of where the source node starts, not merely left of
  // its output handle; nodes that only overlap horizontally keep the smooth curve.
  const sourceWidth = useInternalNode(source)?.measured.width ?? 0;
  const backward = targetX < sourceX - sourceWidth + BACKWARD_MARGIN;
  let path: string;
  if (backward) {
    const gap = Math.abs(targetY - sourceY);
    const centerY =
      gap < UNDER_ROW_OFFSET * 2
        ? Math.max(sourceY, targetY) + UNDER_ROW_OFFSET
        : (sourceY + targetY) / 2;
    [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 12,
      offset: BACKWARD_MARGIN,
      centerY,
    });
  } else {
    [path] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      curvature: 0.8,
    });
  }
  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      className={traversed ? 'workflow-edge-traversed' : undefined}
      style={traversed ? { ...style, stroke: 'var(--g-green, #1e8e3e)', strokeWidth: 2.5 } : style}
      interactionWidth={interactionWidth}
    />
  );
}
