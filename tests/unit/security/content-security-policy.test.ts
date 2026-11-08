import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('renderer Content Security Policy', () => {
  it('allows Inspector snapshot Blob URLs only as image sources', () => {
    const html = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain("img-src 'self' data: blob:");
    expect(html).not.toContain("default-src 'self' blob:");
  });
});
