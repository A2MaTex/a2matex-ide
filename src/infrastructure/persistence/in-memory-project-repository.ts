import { createEmptyProjectDocument } from '@domain/project/project-factory';
import { projectDocumentSchema } from '@domain/project/project-schema';
import type {
  CreateProjectInput,
  ProjectLocation,
  ProjectRepository,
  ProjectSnapshot,
  SaveProjectResult,
} from '@application/project/project-repository';

function cloneSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return structuredClone(snapshot);
}

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectSnapshot>();
  private nextOpenLocation: ProjectLocation | null = null;

  async chooseCreateParent() {
    return { id: 'memory-parent', displayPath: 'Memory projects' };
  }

  async chooseOpenLocation() {
    return this.nextOpenLocation;
  }

  async chooseSaveAsLocation() {
    return { id: `memory-save-as-${crypto.randomUUID()}`, displayPath: 'Memory copy' };
  }

  async create(input: CreateProjectInput) {
    const projectId = crypto.randomUUID();
    const location = { id: projectId, displayPath: `Memory projects/${input.name}` };
    const snapshot = {
      location,
      document: createEmptyProjectDocument(projectId, input.name),
    } satisfies ProjectSnapshot;
    this.projects.set(location.id, cloneSnapshot(snapshot));
    this.nextOpenLocation = location;
    return cloneSnapshot(snapshot);
  }

  async open(location: ProjectLocation) {
    const snapshot = this.projects.get(location.id);
    if (!snapshot) throw new Error(`Memory project not found: ${location.id}`);
    return cloneSnapshot(snapshot);
  }

  async save(snapshot: ProjectSnapshot) {
    projectDocumentSchema.parse(snapshot.document);
    this.projects.set(snapshot.location.id, cloneSnapshot(snapshot));
    this.nextOpenLocation = snapshot.location;
    return this.saveResult(snapshot.location);
  }

  async saveAs(snapshot: ProjectSnapshot, target: ProjectLocation) {
    projectDocumentSchema.parse(snapshot.document);
    const location = {
      id: crypto.randomUUID(),
      displayPath: `${target.displayPath}/${snapshot.document.manifest.name}`,
    };
    this.projects.set(location.id, cloneSnapshot({ ...snapshot, location }));
    this.nextOpenLocation = location;
    return this.saveResult(location);
  }

  setNextOpenLocation(location: ProjectLocation | null) {
    this.nextOpenLocation = location;
  }

  private saveResult(location: ProjectLocation): SaveProjectResult {
    return { location, savedAt: new Date().toISOString() };
  }
}
