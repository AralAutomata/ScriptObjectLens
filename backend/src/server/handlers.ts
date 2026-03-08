import { TypeScriptParser } from "../analyzer/parser.ts";
import { RelationshipMapper } from "../analyzer/relationship-mapper.ts";
import { analyzeFileGraph } from "../analyzer/file-analyzer.ts";
import { analyzeRouteTree } from "../analyzer/route-analyzer.ts";
import { analyzeDatabaseSchema } from "../analyzer/schema-analyzer.ts";
import {
  AnalysisResult,
  AnalyzeRequest,
  AnalyzeResponse,
  EntityDetails,
  ClassInfo,
  FileGraphResponse,
  RouteTreeResponse,
  DatabaseSchemaResponse
} from "../shared/types.ts";

const parser = new TypeScriptParser();
const mapper = new RelationshipMapper();

const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 3600000;
const analysisCache: Map<string, AnalysisResult> = new Map();
const analysisBasePaths: Map<string, string> = new Map();

const BLOCKED_PREFIXES = [
  "/etc", "/root", "/sys", "/proc", "/var", "/boot", "/dev", 
  "/usr/bin", "/usr/sbin", "/bin", "/sbin", "/opt", "/mnt", "/media"
];

function validatePath(path: string): { valid: boolean; error?: string } {
  if (!path || typeof path !== "string") {
    return { valid: false, error: "Path is required" };
  }

  if (path.length > 4096) {
    return { valid: false, error: "Path too long" };
  }

  let normalizedPath = path.replace(/\\/g, "/");
  
  normalizedPath = normalizedPath.replace(/%2e%2e/gi, "..")
                                .replace(/%252e/gi, "..")
                                .replace(/\.\./g, "..");

  normalizedPath = normalizedPath.replace(/\/+/g, "/");

  if (normalizedPath.includes("..") || normalizedPath.includes("//")) {
    return { valid: false, error: "Path traversal not allowed" };
  }

  if (BLOCKED_PREFIXES.some(prefix => normalizedPath.startsWith(prefix))) {
    return { valid: false, error: "Access to system directories not allowed" };
  }

  return { valid: true };
}

function cleanupCache(): void {
  const now = Date.now();
  if (analysisCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) {
      analysisCache.delete(oldestKey);
      analysisBasePaths.delete(oldestKey);
    }
  }
  for (const [id, result] of analysisCache) {
    if (now - result.timestamp > CACHE_TTL_MS) {
      analysisCache.delete(id);
      analysisBasePaths.delete(id);
    }
  }
}

export async function analyzeProject(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    const scanPath = request.path;

    const pathValidation = validatePath(scanPath);
    if (!pathValidation.valid) {
      return { success: false, error: pathValidation.error };
    }

    cleanupCache();

    await parser.parseDirectory(scanPath, {
      exclude: request.exclude,
      include: request.include
    });

    const classes = parser.extractClassesAndInterfaces();
    const relationships = mapper.buildRelationships(classes);
    const graph = mapper.buildGraphData(classes, relationships);

    const resolvedPath = Deno.realPathSync(scanPath);

    const result: AnalysisResult = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      scanPath,
      classes,
      relationships,
      graph,
      totalFiles: parser["sourceFiles"]?.size || 0,
      totalClasses: classes.filter(c => c.type === "class" || c.type === "abstract").length,
      totalInterfaces: classes.filter(c => c.type === "interface").length,
      totalEnums: classes.filter(c => c.type === "enum").length,
      totalTypeAliases: classes.filter(c => c.type === "typeAlias").length,
      totalFunctions: classes.filter(c => c.type === "function").length,
      totalEntities: classes.length
    };

    analysisCache.set(result.id, result);
    analysisBasePaths.set(result.id, resolvedPath);

    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

export function getAllAnalyses(): AnalysisResult[] {
  return Array.from(analysisCache.values());
}

export function getAnalysisResult(id: string): AnalysisResult | undefined {
  return analysisCache.get(id);
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

export function getFileContent(analysisId: string, filePath: string): string | null {
  const pathValidation = validatePath(filePath);
  if (!pathValidation.valid) {
    return null;
  }

  const basePath = analysisBasePaths.get(analysisId);
  if (!basePath) {
    return null;
  }

  try {
    const resolvedFilePath = Deno.realPathSync(filePath);
    const normalizedBasePath = basePath.replace(/\\/g, "/");
    const normalizedFilePath = resolvedFilePath.replace(/\\/g, "/");

    if (!normalizedFilePath.startsWith(normalizedBasePath + "/") && normalizedFilePath !== normalizedBasePath) {
      return null;
    }
  } catch {
    return null;
  }

  return parser.getSourceFileContent(filePath);
}

export async function getFileGraph(scanPath: string): Promise<FileGraphResponse> {
  try {
    const pathValidation = validatePath(scanPath);
    if (!pathValidation.valid) {
      return { success: false, error: pathValidation.error };
    }

    const data = await analyzeFileGraph(scanPath);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze file graph"
    };
  }
}

export async function getRouteTree(scanPath: string): Promise<RouteTreeResponse> {
  try {
    const pathValidation = validatePath(scanPath);
    if (!pathValidation.valid) {
      return { success: false, error: pathValidation.error };
    }

    const data = await analyzeRouteTree(scanPath);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze route tree"
    };
  }
}

export async function getDatabaseSchema(scanPath: string): Promise<DatabaseSchemaResponse> {
  try {
    const pathValidation = validatePath(scanPath);
    if (!pathValidation.valid) {
      return { success: false, error: pathValidation.error };
    }

    const data = await analyzeDatabaseSchema(scanPath);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze database schema"
    };
  }
}
