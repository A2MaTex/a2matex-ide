import { describe, expect, it } from 'vitest';

import { normalizeProjectName } from '@domain/project/project-name';

describe('normalizeProjectName', () => {
  it('normalizes canonical Unicode, whitespace and case deterministically', () => {
    expect(normalizeProjectName('  My\tPROJECT  ')).toBe('my project');
    expect(normalizeProjectName('Cafe\u0301')).toBe('café');
  });
});
