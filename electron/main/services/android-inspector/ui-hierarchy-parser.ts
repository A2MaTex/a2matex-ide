import { SaxesParser } from 'saxes';

import { AndroidInspectorError } from '@application/android-inspector/android-inspector';
import type { InspectorBounds, InspectorNode } from '@domain/android-inspector/android-inspector';

const DEFAULT_MAX_NODES = 20_000;
const boundsPattern = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

function optionalAttribute(attributes: Record<string, string>, name: string) {
  const value = attributes[name]?.trim();
  return value ? value : undefined;
}

export function parseInspectorBounds(value: string | undefined): InspectorBounds | null {
  const match = value?.match(boundsPattern);
  if (!match) return null;
  const [, left, top, right, bottom] = match;
  const bounds = {
    left: Number(left),
    top: Number(top),
    right: Number(right),
    bottom: Number(bottom),
  };
  if (
    !Number.isInteger(bounds.left) ||
    !Number.isInteger(bounds.top) ||
    !Number.isInteger(bounds.right) ||
    !Number.isInteger(bounds.bottom) ||
    bounds.right <= bounds.left ||
    bounds.bottom <= bounds.top
  ) {
    return null;
  }
  return bounds;
}

export interface ParsedUiHierarchy {
  nodes: InspectorNode[];
  warnings: string[];
}

export function parseUiHierarchy(
  xml: string,
  options: { maxNodes?: number } = {},
): ParsedUiHierarchy {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new AndroidInspectorError(
      'HIERARCHY_INVALID',
      'The Android hierarchy contains unsupported XML declarations.',
      false,
    );
  }

  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const nodes: InspectorNode[] = [];
  const stack: Array<{ name: string; nodeId?: string }> = [];
  let skippedBounds = 0;
  let parserError: Error | null = null;
  let traversalIndex = 0;
  const parser = new SaxesParser({ xmlns: false });

  parser.on('error', (error) => {
    parserError = error;
  });
  parser.on('doctype', () => {
    parserError = new Error('DOCTYPE is not supported');
  });
  parser.on('opentag', (tag) => {
    let nodeId: string | undefined;
    if (tag.name === 'node') {
      if (traversalIndex >= maxNodes) {
        throw new AndroidInspectorError(
          'HIERARCHY_TOO_LARGE',
          `The Android hierarchy exceeds the ${maxNodes.toLocaleString()} node limit.`,
        );
      }
      const index = traversalIndex;
      traversalIndex += 1;
      const bounds = parseInspectorBounds(tag.attributes.bounds);
      if (!bounds) {
        skippedBounds += 1;
      } else {
        nodeId = `node-${index}`;
        const parentId = [...stack].reverse().find((entry) => entry.nodeId)?.nodeId;
        nodes.push({
          nodeId,
          ...(parentId ? { parentId } : {}),
          traversalIndex: index,
          depth: stack.filter((entry) => entry.name === 'node').length,
          packageName: optionalAttribute(tag.attributes, 'package'),
          resourceId: optionalAttribute(tag.attributes, 'resource-id'),
          className: optionalAttribute(tag.attributes, 'class') ?? 'android.view.View',
          text: optionalAttribute(tag.attributes, 'text'),
          contentDescription: optionalAttribute(tag.attributes, 'content-desc'),
          bounds,
          clickable: tag.attributes.clickable === 'true',
          enabled: tag.attributes.enabled !== 'false',
        });
      }
    }
    stack.push({ name: tag.name, ...(nodeId ? { nodeId } : {}) });
  });
  parser.on('closetag', () => {
    stack.pop();
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof AndroidInspectorError) throw error;
    parserError = error instanceof Error ? error : new Error('Invalid hierarchy XML');
  }
  if (parserError) {
    throw new AndroidInspectorError(
      'HIERARCHY_INVALID',
      'The Android hierarchy XML is malformed.',
      true,
    );
  }

  return {
    nodes,
    warnings:
      skippedBounds > 0
        ? [`Ignored ${skippedBounds} hierarchy node(s) with invalid or empty bounds.`]
        : [],
  };
}
