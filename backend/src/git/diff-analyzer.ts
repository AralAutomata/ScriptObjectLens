import {
  ArchitectureDiff,
  AnalysisResult,
  ClassInfo,
  Relationship,
  EntityChange,
  RelationshipChange,
  GitRef,
  ImpactAnalysis
} from "../../../shared/types.ts";
import { TypeScriptParser } from "../analyzer/parser.ts";
import { RelationshipMapper } from "../analyzer/relationship-mapper.ts";
import { GitClient } from "../git/git-client.ts";

export class DiffAnalyzer {
  private parser: TypeScriptParser;
  private mapper: RelationshipMapper;

  constructor() {
    this.parser = new TypeScriptParser();
    this.mapper = new RelationshipMapper();
  }

  /**
   * Analyze architecture differences between two git refs
   */
  async analyzeDiff(
    repoPath: string,
    fromRef: string,
    toRef: string
  ): Promise<{ success: boolean; data?: ArchitectureDiff; error?: string }> {
    const git = new GitClient(repoPath);

    // Validate git repository
    const isValid = await git.isValidRepository();
    if (!isValid) {
      return { success: false, error: "Not a valid git repository" };
    }

    // Resolve refs to commit hashes
    const [fromHash, toHash] = await Promise.all([
      git.resolveRef(fromRef),
      git.resolveRef(toRef)
    ]);

    if (!fromHash) {
      return { success: false, error: `Cannot resolve ref: ${fromRef}` };
    }
    if (!toHash) {
      return { success: false, error: `Cannot resolve ref: ${toRef}` };
    }

    // Determine ref types
    const branches = await git.getBranches();
    const tags = await git.getTags();

    const fromGitRef: GitRef = {
      name: fromRef,
      type: this.getRefType(fromRef, fromHash, branches, tags),
      hash: fromHash
    };

    const toGitRef: GitRef = {
      name: toRef,
      type: this.getRefType(toRef, toHash, branches, tags),
      hash: toHash
    };

    // Create temporary worktrees for analysis
    const fromWorktree = await git.createWorktree(fromRef);
    const toWorktree = await git.createWorktree(toRef);

    if (!fromWorktree || !toWorktree) {
      await git.removeWorktree(fromWorktree || "");
      return { success: false, error: "Failed to create temporary worktrees" };
    }

    try {
      // Analyze "before" snapshot
      await this.parser.parseDirectory(fromWorktree);
      const beforeClasses = this.parser.extractClassesAndInterfaces();
      const beforeRelationships = this.mapper.buildRelationships(beforeClasses);
      const beforeGraph = this.mapper.buildGraphData(beforeClasses, beforeRelationships);

      const beforeSnapshot: AnalysisResult = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        scanPath: fromWorktree,
        classes: beforeClasses,
        relationships: beforeRelationships,
        graph: beforeGraph,
        totalFiles: (this.parser as any)["sourceFiles"]?.size || 0,
        totalClasses: beforeClasses.filter(c => c.type === "class" || c.type === "abstract").length,
        totalInterfaces: beforeClasses.filter(c => c.type === "interface").length,
        totalEnums: beforeClasses.filter(c => c.type === "enum").length,
        totalTypeAliases: beforeClasses.filter(c => c.type === "typeAlias").length,
        totalFunctions: beforeClasses.filter(c => c.type === "function").length,
        totalEntities: beforeClasses.length
      };

      // Analyze "after" snapshot
      await this.parser.parseDirectory(toWorktree);
      const afterClasses = this.parser.extractClassesAndInterfaces();
      const afterRelationships = this.mapper.buildRelationships(afterClasses);
      const afterGraph = this.mapper.buildGraphData(afterClasses, afterRelationships);

      const afterSnapshot: AnalysisResult = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        scanPath: toWorktree,
        classes: afterClasses,
        relationships: afterRelationships,
        graph: afterGraph,
        totalFiles: (this.parser as any)["sourceFiles"]?.size || 0,
        totalClasses: afterClasses.filter(c => c.type === "class" || c.type === "abstract").length,
        totalInterfaces: afterClasses.filter(c => c.type === "interface").length,
        totalEnums: afterClasses.filter(c => c.type === "enum").length,
        totalTypeAliases: afterClasses.filter(c => c.type === "typeAlias").length,
        totalFunctions: afterClasses.filter(c => c.type === "function").length,
        totalEntities: afterClasses.length
      };

      // Compare snapshots
      const { entities, relationships } = this.compareSnapshots(beforeSnapshot, afterSnapshot);

      // Get file changes from git
      const gitFileChanges = await git.getChangedFiles(fromHash, toHash);
      const files = {
        added: gitFileChanges.filter(f => f.status === "A").map(f => f.path),
        removed: gitFileChanges.filter(f => f.status === "D").map(f => f.path),
        modified: gitFileChanges.filter(f => f.status === "M" || f.status === "C" || f.status === "R").map(f => f.path)
      };

      // Calculate impact
      const changedEntityIds = [
        ...entities.added.map(e => e.id),
        ...entities.removed.map(e => e.id),
        ...entities.modified.map(e => e.id)
      ];

      const impact = this.calculateImpact(changedEntityIds, afterSnapshot, relationships);

      // Build summary
      const summary = {
        totalChanges: entities.added.length + entities.removed.length + entities.modified.length +
                      relationships.added.length + relationships.removed.length,
        entitiesAdded: entities.added.length,
        entitiesRemoved: entities.removed.length,
        entitiesModified: entities.modified.length,
        relationshipsAdded: relationships.added.length,
        relationshipsRemoved: relationships.removed.length,
        filesChanged: files.added.length + files.removed.length + files.modified.length
      };

      // Build final diff result
      const diff: ArchitectureDiff = {
        from: fromGitRef,
        to: toGitRef,
        entities,
        relationships,
        files,
        impact,
        summary,
        beforeSnapshot,
        afterSnapshot
      };

      return { success: true, data: diff };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed"
      };
    } finally {
      // Cleanup worktrees
      await Promise.all([
        git.removeWorktree(fromWorktree),
        git.removeWorktree(toWorktree)
      ]);
    }
  }

  /**
   * Determine the type of a git ref
   */
  private getRefType(
    ref: string,
    hash: string,
    branches: GitRef[],
    tags: GitRef[]
  ): "branch" | "tag" | "commit" {
    // Check if it's a branch
    if (branches.some(b => b.name === ref || b.hash.startsWith(hash.substring(0, 8)))) {
      return "branch";
    }

    // Check if it's a tag
    if (tags.some(t => t.name === ref || t.hash.startsWith(hash.substring(0, 8)))) {
      return "tag";
    }

    return "commit";
  }

  /**
   * Compare two analysis snapshots
   */
  private compareSnapshots(
    before: AnalysisResult,
    after: AnalysisResult
  ): {
    entities: {
      added: EntityChange[];
      removed: EntityChange[];
      modified: EntityChange[];
    };
    relationships: {
      added: RelationshipChange[];
      removed: RelationshipChange[];
    };
  } {
    // Create maps for quick lookup
    const beforeClasses = new Map(before.classes.map(c => [c.id, c]));
    const afterClasses = new Map(after.classes.map(c => [c.id, c]));

    const beforeRels = new Map(
      before.relationships.map(r => [`${r.source}->${r.target}:${r.type}`, r])
    );
    const afterRels = new Map(
      after.relationships.map(r => [`${r.source}->${r.target}:${r.type}`, r])
    );

    // Find entity changes
    const added: EntityChange[] = [];
    const removed: EntityChange[] = [];
    const modified: EntityChange[] = [];

    // Check for added and modified entities
    for (const [id, afterClass] of afterClasses) {
      const beforeClass = beforeClasses.get(id);

      if (!beforeClass) {
        // New entity
        added.push({
          id,
          name: afterClass.name,
          type: afterClass.type,
          status: "added",
          filePath: afterClass.filePath
        });
      } else {
        // Check if modified
        const changes = this.detectEntityChanges(beforeClass, afterClass);
        if (changes) {
          modified.push({
            id,
            name: afterClass.name,
            type: afterClass.type,
            status: "modified",
            filePath: afterClass.filePath,
            changes
          });
        }
      }
    }

    // Check for removed entities
    for (const [id, beforeClass] of beforeClasses) {
      if (!afterClasses.has(id)) {
        removed.push({
          id,
          name: beforeClass.name,
          type: beforeClass.type,
          status: "removed",
          filePath: beforeClass.filePath
        });
      }
    }

    // Find relationship changes
    const relAdded: RelationshipChange[] = [];
    const relRemoved: RelationshipChange[] = [];

    // Check for added relationships
    for (const [key, afterRel] of afterRels) {
      if (!beforeRels.has(key)) {
        relAdded.push({
          source: afterRel.source,
          target: afterRel.target,
          type: afterRel.type,
          status: "added"
        });
      }
    }

    // Check for removed relationships
    for (const [key, beforeRel] of beforeRels) {
      if (!afterRels.has(key)) {
        relRemoved.push({
          source: beforeRel.source,
          target: beforeRel.target,
          type: beforeRel.type,
          status: "removed"
        });
      }
    }

    return {
      entities: { added, removed, modified },
      relationships: { added: relAdded, removed: relRemoved }
    };
  }

  /**
   * Detect specific changes between two versions of an entity
   */
  private detectEntityChanges(
    before: ClassInfo,
    after: ClassInfo
  ): EntityChange["changes"] | null {
    const changes: EntityChange["changes"] = {};

    // Check methods
    const beforeMethods = new Set(before.methods.map(m => m.name));
    const afterMethods = new Set(after.methods.map(m => m.name));

    const methodsAdded = [...afterMethods].filter(m => !beforeMethods.has(m));
    const methodsRemoved = [...beforeMethods].filter(m => !afterMethods.has(m));

    if (methodsAdded.length > 0) changes.methodsAdded = methodsAdded;
    if (methodsRemoved.length > 0) changes.methodsRemoved = methodsRemoved;

    // Check properties
    const beforeProps = new Set(before.properties.map(p => p.name));
    const afterProps = new Set(after.properties.map(p => p.name));

    const propertiesAdded = [...afterProps].filter(p => !beforeProps.has(p));
    const propertiesRemoved = [...beforeProps].filter(p => !afterProps.has(p));

    if (propertiesAdded.length > 0) changes.propertiesAdded = propertiesAdded;
    if (propertiesRemoved.length > 0) changes.propertiesRemoved = propertiesRemoved;

    // Check extends
    if (before.extends !== after.extends) {
      changes.extendsChanged = {
        from: before.extends,
        to: after.extends
      };
    }

    // Check implements
    const beforeImplements = new Set(before.implements);
    const afterImplements = new Set(after.implements);

    const implementsAdded = [...afterImplements].filter(i => !beforeImplements.has(i));
    const implementsRemoved = [...beforeImplements].filter(i => !afterImplements.has(i));

    if (implementsAdded.length > 0 || implementsRemoved.length > 0) {
      changes.implementsChanged = {
        added: implementsAdded,
        removed: implementsRemoved
      };
    }

    // Return null if no changes detected
    const hasChanges =
      methodsAdded.length > 0 ||
      methodsRemoved.length > 0 ||
      propertiesAdded.length > 0 ||
      propertiesRemoved.length > 0 ||
      changes.extendsChanged ||
      changes.implementsChanged;

    return hasChanges ? changes : null;
  }

  /**
   * Calculate impact of changes
   */
  private calculateImpact(
    changedEntityIds: string[],
    snapshot: AnalysisResult,
    relationshipChanges: { added: RelationshipChange[]; removed: RelationshipChange[] }
  ): ImpactAnalysis {
    const changedSet = new Set(changedEntityIds);
    const directDependencies = new Set<string>();

    // Find all entities that depend on changed entities
    for (const rel of snapshot.relationships) {
      if (changedSet.has(rel.target) && !changedSet.has(rel.source)) {
        directDependencies.add(rel.source);
      }
    }

    return {
      directDependencies: [...directDependencies],
      brokenRelationships: relationshipChanges.removed.length,
      newRelationships: relationshipChanges.added.length
    };
  }
}
