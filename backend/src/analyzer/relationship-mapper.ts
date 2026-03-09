import { ClassInfo, Relationship, GraphData, GraphNode, GraphEdge } from "../shared/types.ts";

export class RelationshipMapper {
  private classMap: Map<string, ClassInfo> = new Map();
  private nameToClass: Map<string, ClassInfo[]> = new Map();

  buildRelationships(classes: ClassInfo[]): Relationship[] {
    this.classMap.clear();
    this.nameToClass.clear();

    classes.forEach(c => {
      this.classMap.set(c.id, c);

      if (!this.nameToClass.has(c.name)) {
        this.nameToClass.set(c.name, []);
      }
      this.nameToClass.get(c.name)!.push(c);
    });

    const relationships: Relationship[] = [];
    const dedup = new Set<string>();
    const addRelationship = (source: string, target: string, type: Relationship["type"], filePath?: string) => {
      if (source === target) {
        return;
      }
      const key = `${source}->${target}:${type}`;
      if (dedup.has(key)) {
        return;
      }
      dedup.add(key);
      relationships.push({ source, target, type, filePath });
    };

    classes.forEach(classInfo => {
      const source = classInfo.id;

      if (classInfo.extends) {
        const parent = this.findClassByName(classInfo.extends);
        if (parent) {
          addRelationship(source, parent.id, "extends", classInfo.filePath);
        }
      }

      classInfo.implements.forEach(interfaceName => {
        const iface = this.findClassByName(interfaceName);
        if (iface && iface.type === "interface") {
          addRelationship(source, iface.id, "implements", classInfo.filePath);
        }
      });

      classInfo.imports?.forEach(importName => {
        const importedClass = this.findClassByName(importName);
        if (importedClass) {
          addRelationship(source, importedClass.id, "imports", classInfo.filePath);
        }
      });

      if (classInfo.type === "class") {
        classInfo.properties.forEach(prop => {
          this.collectReferencesFromType(prop.type).forEach(typeName => {
            const target = this.findClassByName(typeName);
            if (target && target.id !== classInfo.id) {
              addRelationship(source, target.id, "composition", classInfo.filePath);
            }
          });
        });
      }

      const references = this.collectReferencesFromClassInfo(classInfo);
      references.forEach(typeName => {
        const target = this.findClassByName(typeName);
        if (target) {
          const edgeType: Relationship["type"] = "uses";
          addRelationship(source, target.id, edgeType, classInfo.filePath);
        }
      });
    });

    return relationships;
  }

  private collectReferencesFromClassInfo(classInfo: ClassInfo): string[] {
    if (classInfo.references && classInfo.references.length > 0) {
      return classInfo.references;
    }

    const methodRefs = classInfo.methods.flatMap(method =>
      [method.returnType, ...method.parameters.map(p => p.type)]
    );
    const propRefs = classInfo.properties.map(property => property.type);
    const declaredRefs = [...methodRefs, ...propRefs].join(" ").match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];

    return this.normalizeTypeRefs(declaredRefs);
  }

  private collectReferencesFromType(typeText: string): string[] {
    return this.normalizeTypeRefs(typeText.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []);
  }

  private normalizeTypeRefs(rawRefs: string[]): string[] {
    const ignored = new Set(["string", "number", "boolean", "any", "unknown", "object", "void", "undefined", "null", "true", "false"]);
    return [...new Set(rawRefs.filter(ref => /^[A-Z]/.test(ref) && !ignored.has(ref) && ref.length > 1))];
  }

  private findClassByName(name: string): ClassInfo | null {
    const candidates = this.nameToClass.get(name);
    if (candidates && candidates.length > 0) {
      return candidates[0];
    }

    for (const [, cls] of this.classMap) {
      if (cls.name === name) {
        return cls;
      }
    }

    return null;
  }

  buildGraphData(classes: ClassInfo[], relationships: Relationship[]): GraphData {
    const nodeIds = new Set(classes.map(c => c.id));
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    classes.forEach(c => {
      inDegree.set(c.id, 0);
      outDegree.set(c.id, 0);
      adjacency.set(c.id, []);
    });

    relationships.forEach(relationship => {
      if (!nodeIds.has(relationship.source) || !nodeIds.has(relationship.target)) {
        return;
      }
      outDegree.set(relationship.source, (outDegree.get(relationship.source) || 0) + 1);
      inDegree.set(relationship.target, (inDegree.get(relationship.target) || 0) + 1);
      adjacency.get(relationship.source)?.push(relationship.target);
    });

    const cycleNodes = this.findCycleNodes(classes.map(c => c.id), relationships);
    const clusterIds = this.buildClusterIds(classes.map(c => c.id), relationships);

    const nodes: GraphNode[] = classes.map(c => {
      const inCount = inDegree.get(c.id) || 0;
      const out = outDegree.get(c.id) || 0;
      return {
        id: c.id,
        label: c.name,
        type: c.type,
        namespace: c.namespace,
        filePath: c.filePath,
        inDegree: inCount,
        outDegree: out,
        totalDegree: inCount + out,
        isCycleNode: cycleNodes.has(c.id),
        clusterId: clusterIds.get(c.id)
      };
    });

    const edges: GraphEdge[] = relationships.map(r => ({
      source: r.source,
      target: r.target,
      type: r.type
    }));

    return { nodes, edges };
  }

  private buildClusterIds(nodeIds: string[], relationships: Relationship[]): Map<string, number> {
    const adjacency = new Map<string, string[]>();
    nodeIds.forEach(id => adjacency.set(id, []));

    for (const rel of relationships) {
      if (!adjacency.has(rel.source) || !adjacency.has(rel.target)) {
        continue;
      }
      adjacency.get(rel.source)?.push(rel.target);
      adjacency.get(rel.target)?.push(rel.source);
    }

    const clusterIds = new Map<string, number>();
    const seen = new Set<string>();
    let clusterId = 0;

    const queue: string[] = [];
    for (const id of nodeIds) {
      if (seen.has(id)) continue;

      clusterId += 1;
      queue.push(id);
      seen.add(id);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        clusterIds.set(current, clusterId);
        for (const next of adjacency.get(current) || []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
    }

    return clusterIds;
  }

  private findCycleNodes(nodeIds: string[], relationships: Relationship[]): Set<string> {
    const outgoing = new Map<string, string[]>();
    nodeIds.forEach(id => outgoing.set(id, []));
    for (const rel of relationships) {
      if (outgoing.has(rel.source) && outgoing.has(rel.target)) {
        outgoing.get(rel.source)?.push(rel.target);
      }
    }

    const state = new Map<string, number>();
    const stack: string[] = [];
    const cycleNodes = new Set<string>();

    const visit = (nodeId: string) => {
      state.set(nodeId, 1);
      stack.push(nodeId);

      for (const neighbor of outgoing.get(nodeId) || []) {
        const neighborState = state.get(neighbor) || 0;
        if (neighborState === 0) {
          visit(neighbor);
        } else if (neighborState === 1) {
          const index = stack.indexOf(neighbor);
          if (index >= 0) {
            for (let i = index; i < stack.length; i += 1) {
              cycleNodes.add(stack[i]);
            }
          }
          cycleNodes.add(neighbor);
        }
      }

      stack.pop();
      state.set(nodeId, 2);
    };

    nodeIds.forEach(id => {
      if ((state.get(id) || 0) === 0) {
        visit(id);
      }
    });

    return cycleNodes;
  }

  findRelatedClasses(classId: string, classes: ClassInfo[], relationships: Relationship[]): ClassInfo[] {
    const relatedIds = new Set<string>();

    relationships.forEach(r => {
      if (r.source === classId) {
        relatedIds.add(r.target);
      } else if (r.target === classId) {
        relatedIds.add(r.source);
      }
    });

    return classes.filter(c => relatedIds.has(c.id));
  }

  findRelationshipsForClass(classId: string, relationships: Relationship[]): Relationship[] {
    return relationships.filter(r => r.source === classId || r.target === classId);
  }
}
