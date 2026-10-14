import { describe, expect, it } from 'vitest';

import {
  completeProjectSave,
  createProjectSession,
  isProjectDirty,
  updateProjectDocument,
} from '@application/project/project-session';
import { createEmptyProjectDocument } from '@domain/project/project-factory';

const location = { id: 'location-1', displayPath: '/projects/example' };

describe('project session revision tracking', () => {
  it('becomes dirty after an edit and clean after saving that revision', () => {
    const initial = createProjectSession({
      location,
      document: createEmptyProjectDocument('project-1', 'Example'),
    });
    const edited = updateProjectDocument(initial, (document) => ({
      ...document,
      manifest: { ...document.manifest, name: 'Renamed' },
    }));
    const saved = completeProjectSave(edited, edited.workingRevision, location);

    expect(isProjectDirty(initial)).toBe(false);
    expect(isProjectDirty(edited)).toBe(true);
    expect(isProjectDirty(saved)).toBe(false);
  });

  it('keeps edits made while an asynchronous save is in flight dirty', () => {
    const initial = createProjectSession({
      location,
      document: createEmptyProjectDocument('project-1', 'Example'),
    });
    const firstEdit = updateProjectDocument(initial, (document) => ({
      ...document,
      manifest: { ...document.manifest, name: 'First edit' },
    }));
    const revisionBeingSaved = firstEdit.workingRevision;
    const secondEdit = updateProjectDocument(firstEdit, (document) => ({
      ...document,
      manifest: { ...document.manifest, description: 'Changed during save' },
    }));
    const completed = completeProjectSave(secondEdit, revisionBeingSaved, location);

    expect(completed.savedRevision).toBe(revisionBeingSaved);
    expect(completed.workingRevision).toBeGreaterThan(completed.savedRevision);
    expect(isProjectDirty(completed)).toBe(true);
  });
});
