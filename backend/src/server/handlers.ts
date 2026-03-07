import { TypeScriptParser } from "../analyzer/parser.ts";
import { RelationshipMapper } from "../analyzer/relationship-mapper.ts";
import {
  AnalysisResult,
  AnalyzeRequest,
  AnalyzeResponse,
  EntityDetails,
  ClassInfo
} from "../shared/types.ts";

const parser = new TypeScriptParser();
const mapper = new RelationshipMapper();

const analysisCache: Map<string, AnalysisResult> = new Map();

export async function analyzeProject(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    const scanPath = request.path;
    
    await parser.parseDirectory(scanPath, {
      exclude: request.exclude,
      include: request.include
    });

    const classes = parser.extractClassesAndInterfaces();
    const relationships = mapper.buildRelationships(classes);
    const graph = mapper.buildGraphData(classes, relationships);

    const result: AnalysisResult = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      scanPath,
      classes,
      relationships,
      graph,
      totalFiles: parser["sourceFiles"]?.size || 0,
      totalClasses: classes.filter(c => c.type === "class").length,
      totalInterfaces: classes.filter(c => c.type === "interface").length
    };

    analysisCache.set(result.id, result);

    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

export function getAnalysisResult(id: string): AnalysisResult | undefined {
  return analysisCache.get(id);
}

export function getAllAnalyses(): AnalysisResult[] {
  return Array.from(analysisCache.values());
}

export function getEntityDetails(classId: string): EntityDetails | null {
  for (const result of analysisCache.values()) {
    const classInfo = result.classes.find(c => c.id === classId);
    if (classInfo) {
      const relatedClasses = mapper.findRelatedClasses(classId, result.classes, result.relationships);
      const relationships = mapper.findRelationshipsForClass(classId, result.relationships);
      return { class: classInfo, relatedClasses, relationships };
    }
  }
  return null;
}

export function getFileContent(filePath: string): string | null {
  return parser.getSourceFileContent(filePath);
}
