import { describe, expect, it } from 'vitest';

import { normalizeCloudProjectName, normalizeProjectName } from '@domain/project/project-name';

describe('normalizeProjectName', () => {
  it('normalizes canonical Unicode, whitespace and case deterministically', () => {
    expect(normalizeProjectName('  My\tPROJECT  ')).toBe('my project');
    expect(normalizeProjectName('Cafe\u0301')).toBe('café');
  });
});

describe('normalizeCloudProjectName', () => {
  it('matches lower(btrim(name)) without collapsing meaningful inner whitespace', () => {
    expect(normalizeCloudProjectName('  My PROJECT  ')).toBe('my project');
    expect(normalizeCloudProjectName('A  B')).toBe('a  b');
  });
});
