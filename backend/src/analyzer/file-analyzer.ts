import { FileNode, FileEdge, FileNodeType } from "../../../shared/types.ts";

const SKIP_DIRS = ["node_modules", ".next", ".git", "dist", "build", ".cache", "coverage", ".nuxt", ".output"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

function isSymlink(path: string): boolean {
  try {
    return Deno.lstatSync(path).isSymlink;
  } catch {
    return false;
  }
}

function getFileType(filePath: string): FileNodeType {
  const normalized = filePath.toLowerCase();
  
  if (normalized.includes("/pages/") || normalized.endsWith("page.tsx") || normalized.endsWith("page.jsx") || normalized.endsWith("page.ts")) {
    return "page";
  }
  if (normalized.includes("/api/") || normalized.endsWith("route.ts") || normalized.endsWith("route.js")) {
    return "api";
  }
  if (normalized.includes("/components/") || normalized.includes("/component/")) {
    return "component";
  }
  if (normalized.includes("/lib/") || normalized.includes("/utils/") || normalized.includes("/helpers/")) {
    return "lib";
  }
  if (normalized.includes(".config.") || normalized.startsWith(".env") || normalized.includes("tsconfig") || normalized.includes("package.json")) {
    return "config";
  }
  
  return "util";
}

function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];
  
  // Static imports: import X from 'path'
  const staticImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"];?/g;
  let match;
  while ((match = staticImportRegex.exec(content)) !== null) {
    const importPath = match[1];
    // Skip node_modules and external packages
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      continue;
    }
    imports.push(importPath);
  }
  
  // Dynamic imports: import('path')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
      continue;
    }
    imports.push(importPath);
  }
  
  return imports;
}

function resolveImportPath(importPath: string, fromFile: string, basePath: string): string | null {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
  
  let resolved: string;
  if (importPath.startsWith("/")) {
    resolved = basePath + importPath;
  } else {
    // Relative path
    const parts = fromDir.split("/").concat(importPath.split("/"));
    const resolvedParts: string[] = [];
    
    for (const part of parts) {
      if (part === "..") {
        resolvedParts.pop();
      } else if (part !== "." && part !== "") {
        resolvedParts.push(part);
      }
    }
    resolved = resolvedParts.join("/");
  }
  
  // Try different extensions
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
  
  for (const ext of extensions) {
    const fullPath = resolved + ext;
    try {
      const stat = Deno.statSync(fullPath);
      if (stat.isFile && !isSymlink(fullPath)) {
        return fullPath;
      }
    } catch {
      // File doesn't exist, try next extension
    }
  }
  
  return null;
}

export async function analyzeFileGraph(dirPath: string): Promise<{ nodes: FileNode[]; edges: FileEdge[] }> {
  const nodes: Map<string, FileNode> = new Map();
  const edges: FileEdge[] = [];
  const filesToProcess: string[] = [];
  
  // Walk directory
  async function walkDir(dir: string) {
    try {
      for await (const entry of Deno.readDir(dir)) {
        const fullPath = `${dir}/${entry.name}`;
        
        if (isSymlink(fullPath)) {
          continue;
        }
        
        if (entry.isDirectory) {
          if (!SKIP_DIRS.includes(entry.name)) {
            await walkDir(fullPath);
          }
        } else if (entry.isFile) {
          const ext = entry.name.substring(entry.name.lastIndexOf("."));
          if (SOURCE_EXTENSIONS.includes(ext)) {
            filesToProcess.push(fullPath);
          }
        }
      }
    } catch (e) {
      console.error(`Error reading directory ${dir}:`, e);
    }
  }
  
  await walkDir(dirPath);
  
  // Create nodes
  for (const filePath of filesToProcess) {
    try {
      const stat = Deno.statSync(filePath);
      const name = filePath.substring(filePath.lastIndexOf("/") + 1);
      const ext = name.substring(name.lastIndexOf("."));
      
      const node: FileNode = {
        id: filePath,
        path: filePath,
        name,
        type: getFileType(filePath),
        size: stat.size,
        extension: ext,
      };
      
      nodes.set(filePath, node);
    } catch {
      // Skip files we can't stat
    }
  }
  
  // Extract imports and create edges
  for (const filePath of filesToProcess) {
    try {
      const content = Deno.readTextFileSync(filePath);
      const imports = extractImports(content, filePath);
      
      for (const importPath of imports) {
        const resolvedPath = resolveImportPath(importPath, filePath, dirPath);
        if (resolvedPath && nodes.has(resolvedPath)) {
          // Check if it's dynamic import
          const isDynamic = content.includes(`import('${importPath}')`) || content.includes(`import("${importPath}")`);
          
          edges.push({
            source: filePath,
            target: resolvedPath,
            type: isDynamic ? "dynamic" : "import",
          });
        }
      }
    } catch {
      // Skip files we can't read
    }
  }
  
  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}