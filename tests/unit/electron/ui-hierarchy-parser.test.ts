import { describe, expect, it } from 'vitest';

import { AndroidInspectorError } from '@application/android-inspector/android-inspector';
import {
  parseInspectorBounds,
  parseUiHierarchy,
} from '@electron/main/services/android-inspector/ui-hierarchy-parser';

const hierarchy = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example" content-desc="" clickable="false" enabled="true" bounds="[0,0][1080,1920]">
    <node index="1" text="Login &amp; continue" resource-id="com.example:id/login" class="android.widget.Button" package="com.example" content-desc="Login" clickable="true" enabled="true" bounds="[120,450][960,530]" />
    <node index="2" text="Bad" class="android.view.View" clickable="false" enabled="false" bounds="[5,5][5,10]" />
  </node>
</hierarchy>`;

describe('UI hierarchy parser', () => {
  it('normalizes nested UIAutomator nodes and reports skipped bounds', () => {
    const result = parseUiHierarchy(hierarchy);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({
      nodeId: 'node-0',
      depth: 0,
      packageName: 'com.example',
      className: 'android.widget.FrameLayout',
      bounds: { left: 0, top: 0, right: 1080, bottom: 1920 },
    });
    expect(result.nodes[1]).toMatchObject({
      nodeId: 'node-1',
      parentId: 'node-0',
      depth: 1,
      resourceId: 'com.example:id/login',
      text: 'Login & continue',
      contentDescription: 'Login',
      clickable: true,
      enabled: true,
    });
    expect(result.warnings).toEqual(['Ignored 1 hierarchy node(s) with invalid or empty bounds.']);
  });

  it('parses valid Android bounds and rejects empty rectangles', () => {
    expect(parseInspectorBounds('[1,2][3,4]')).toEqual({ left: 1, top: 2, right: 3, bottom: 4 });
    expect(parseInspectorBounds('[1,2][1,4]')).toBeNull();
    expect(parseInspectorBounds('invalid')).toBeNull();
  });

  it('rejects malformed XML and DTD declarations', () => {
    expect(() => parseUiHierarchy('<hierarchy><node></hierarchy>')).toThrowError(
      AndroidInspectorError,
    );
    expect(() => parseUiHierarchy('<!DOCTYPE hierarchy><hierarchy />')).toThrowError(
      /unsupported XML declarations/,
    );
  });

  it('enforces the hierarchy node limit', () => {
    expect(() => parseUiHierarchy(hierarchy, { maxNodes: 1 })).toThrowError(/node limit/);
  });
});
