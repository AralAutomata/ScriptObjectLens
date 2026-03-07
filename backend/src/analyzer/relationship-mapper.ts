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

    classes.forEach(classInfo => {
      if (classInfo.extends) {
        const parent = this.findClassByName(classInfo.extends);
        if (parent) {
          relationships.push({
            source: classInfo.id,
            target: parent.id,
            type: "extends"
          });
        }
      }

      classInfo.implements.forEach(interfaceName => {
        const iface = this.findClassByName(interfaceName);
        if (iface && iface.type === "interface") {
          relationships.push({
            source: classInfo.id,
            target: iface.id,
            type: "implements"
          });
        }
      });

      classInfo.properties.forEach(prop => {
        if (prop.type && prop.type !== "any" && prop.type !== "string" && 
            prop.type !== "number" && prop.type !== "boolean" && 
            prop.type !== "object" && prop.type !== "Array" &&
            !prop.type.endsWith("[]")) {
          
          const propTypeName = prop.type.replace("?", "").replace("!", "");
          const targetClass = this.findClassByName(propTypeName);
          if (targetClass && targetClass.id !== classInfo.id) {
            relationships.push({
              source: classInfo.id,
              target: targetClass.id,
              type: "composition"
            });
          }
        }
      });
    });

    return relationships;
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
    const nodes: GraphNode[] = classes.map(c => ({
      id: c.id,
      label: c.name,
      type: c.type === "interface" ? "interface" : "class",
      namespace: c.namespace,
      filePath: c.filePath
    }));

    const edges: GraphEdge[] = relationships.map(r => ({
      source: r.source,
      target: r.target,
      type: r.type
    }));

    return { nodes, edges };
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
