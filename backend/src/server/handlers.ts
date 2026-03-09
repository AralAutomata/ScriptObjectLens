import { TypeScriptParser } from "../analyzer/parser.ts";
import { RelationshipMapper } from "../analyzer/relationship-mapper.ts";
import { analyzeFileGraph } from "../analyzer/file-analyzer.ts";
import { analyzeRouteTree } from "../analyzer/route-analyzer.ts";
import { analyzeDatabaseSchema } from "../analyzer/schema-analyzer.ts";
import { DiffAnalyzer } from "../git/diff-analyzer.ts";
import { GitClient } from "../git/git-client.ts";
import {
  AnalysisResult,
  AnalyzeRequest,
  AnalyzeResponse,
  EntityDetails,
  ClassInfo,
  FileGraphResponse,
  RouteTreeResponse,
  DatabaseSchemaResponse,
  ArchitectureDiffRequest,
  ArchitectureDiffResponse,
  GitRefsResponse
} from "../shared/types.ts";

// Per-request instances to avoid shared mutable state between concurrent requests
function createAnalyzer() {
  return {
    parser: new TypeScriptParser(),
    mapper: new RelationshipMapper()
  }
}

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
  // Evict expired entries first
  for (const [id, result] of analysisCache) {
    if (now - result.timestamp > CACHE_TTL_MS) {
      analysisCache.delete(id);
      analysisBasePaths.delete(id);
    }
  }
  // Evict oldest entries until under limit
  while (analysisCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = analysisCache.keys().next().value;
    if (oldestKey) {
      analysisCache.delete(oldestKey);
      analysisBasePaths.delete(oldestKey);
    } else {
      break;
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

    const { parser, mapper } = createAnalyzer()

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
      totalFiles: parser.getSourceFileCount(),
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
  const { mapper } = createAnalyzer()
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

  try {
    return Deno.readTextFileSync(filePath);
  } catch {
    return null;
  }
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

export async function analyzeArchitectureDiff(
  request: ArchitectureDiffRequest
): Promise<ArchitectureDiffResponse> {
  try {
    const pathValidation = validatePath(request.path);
    if (!pathValidation.valid) {
      return { success: false, error: pathValidation.error };
    }

    const diffAnalyzer = new DiffAnalyzer();
    const result = await diffAnalyzer.analyzeDiff(request.path, request.from, request.to);

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze architecture diff"
    };
  }
}

// ============================================
// Sandbox handlers
// ============================================

const sandboxProcesses = new Map<string, Deno.ChildProcess>();
const MAX_CODE_SIZE = 100 * 1024; // 100KB

export async function executeSandbox(req: Request): Promise<{ stream: ReadableStream; sessionId: string }> {
  const body = await req.json();
  const { code, timeout = 30 } = body;

  if (!code || typeof code !== 'string') {
    throw new Error('Code is required');
  }

  if (code.length > MAX_CODE_SIZE) {
    throw new Error('Code exceeds maximum size of 100KB');
  }

  const sessionId = crypto.randomUUID();
  const tempFile = await Deno.makeTempFile({ suffix: '.ts' });
  await Deno.writeTextFile(tempFile, code);
  // Deno creates temp files with mode 600; container's bun user needs read access
  await Deno.chmod(tempFile, 0o644);

  const command = new Deno.Command('podman', {
    args: [
      'run', '--rm',
      '--name', `sandbox-${sessionId}`,
      '--network=none',
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid',
      '--tmpfs', '/home/bun:rw,noexec,nosuid',
      '--memory=256m',
      '--cpus=1',
      `--timeout=${timeout}`,
      '-v', `${tempFile}:/sandbox/code.ts:ro,Z`,
      'sandbox-bun',
      'bun', 'run', '/sandbox/code.ts',
    ],
    stdout: 'piped',
    stderr: 'piped',
  });

  const process = command.spawn();
  sandboxProcesses.set(sessionId, process);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(type: string, data: string) {
        const event = JSON.stringify({ type, data, timestamp: Date.now() });
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
      }

      async function pipeStream(
        readable: ReadableStream<Uint8Array>,
        type: 'stdout' | 'stderr'
      ) {
        const reader = readable.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            // Split by newlines to send line-by-line
            const lines = text.split('\n');
            for (const line of lines) {
              if (line) {
                sendEvent(type, line);
              }
            }
          }
        } catch {
          // Stream closed
        }
      }

      try {
        // Pipe stdout and stderr concurrently
        await Promise.all([
          pipeStream(process.stdout, 'stdout'),
          pipeStream(process.stderr, 'stderr'),
        ]);

        const status = await process.status;
        sendEvent('exit', String(status.code ?? 1));
      } catch (err) {
        sendEvent('exit', '1');
      } finally {
        sandboxProcesses.delete(sessionId);
        // Clean up temp file
        try {
          await Deno.remove(tempFile);
        } catch {
          // ignore
        }
        controller.close();
      }
    },
  });

  return { stream, sessionId };
}

export async function killSandbox(sessionId: string): Promise<{ success: boolean }> {
  // Kill the container via podman
  try {
    const killCmd = new Deno.Command('podman', {
      args: ['kill', `sandbox-${sessionId}`],
      stdout: 'null',
      stderr: 'null',
    });
    await killCmd.output();
  } catch {
    // Container may already be gone
  }

  // Also kill the local process handle
  const process = sandboxProcesses.get(sessionId);
  if (process) {
    try {
      process.kill('SIGKILL');
    } catch {
      // Already exited
    }
    sandboxProcesses.delete(sessionId);
  }

  return { success: true };
}

export async function getGitRefs(scanPath: string): Promise<GitRefsResponse> {
  try {
    const pathValidation = validatePath(scanPath);
    if (!pathValidation.valid) {
      return { success: false, error: pathValidation.error };
    }

    const git = new GitClient(scanPath);
    const isValid = await git.isValidRepository();
    if (!isValid) {
      return { success: false, error: "Not a valid git repository" };
    }

    const [branches, tags] = await Promise.all([
      git.getBranches(),
      git.getTags()
    ]);

    return { success: true, branches, tags };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get git refs"
    };
  }
}
