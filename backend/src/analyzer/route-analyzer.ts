import { RouteNode, HttpMethod } from "../../../shared/types.ts";

const SKIP_DIRS = ["node_modules", ".next", ".git", "dist", "build", ".cache"];

function isSymlink(path: string): boolean {
  try {
    return Deno.lstatSync(path).isSymlink;
  } catch {
    return false;
  }
}

function detectFramework(dirPath: string): "next-app" | "next-pages" | "express" | "hono" | "unknown" {
  // Check for Next.js App Router
  try {
    if (Deno.statSync(`${dirPath}/app`).isDirectory) {
      return "next-app";
    }
  } catch { /* not found */ }
  
  // Check for Next.js Pages Router
  try {
    if (Deno.statSync(`${dirPath}/pages`).isDirectory) {
      return "next-pages";
    }
  } catch { /* not found */ }
  
  // Check for src directory variants
  try {
    if (Deno.statSync(`${dirPath}/src/app`).isDirectory) {
      return "next-app";
    }
  } catch { /* not found */ }
  
  try {
    if (Deno.statSync(`${dirPath}/src/pages`).isDirectory) {
      return "next-pages";
    }
  } catch { /* not found */ }
  
  return "unknown";
}

function extractHttpMethods(content: string): HttpMethod[] {
  const methods: HttpMethod[] = [];
  const methodRegex = /(?:export\s+)?(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/g;
  let match;
  
  while ((match = methodRegex.exec(content)) !== null) {
    methods.push(match[1] as HttpMethod);
  }
  
  // Remove duplicates
  return [...new Set(methods)];
}

function extractExpressRoutes(content: string): Array<{ method: HttpMethod; path: string }> {
  const routes: Array<{ method: HttpMethod; path: string }> = [];
  const routeRegex = /(?:app|router)\.(get|post|put|delete|patch|head|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match;

  while ((match = routeRegex.exec(content)) !== null) {
    const rawMethod = match[1].toLowerCase();
    const path = match[2];
    const method: HttpMethod = rawMethod === 'all' ? 'ALL' : (rawMethod.toUpperCase() as HttpMethod);
    routes.push({ method, path });
  }

  return routes;
}

function filePathToRoute(filePath: string, framework: "next-app" | "next-pages", basePath: string): string | null {
  const relativePath = filePath.replace(basePath, "").replace(/^\//, "");
  
  if (framework === "next-app") {
    // App router: app/blog/[slug]/page.tsx -> /blog/[slug]
    // Also handles root level: app/page.tsx -> /
    const isPage = relativePath.match(/(^|\/)page\.(tsx|jsx|ts|js)$/);
    const isRoute = relativePath.match(/(^|\/)route\.(tsx|jsx|ts|js)$/);
    
    if (isPage || isRoute) {
      const route = relativePath
        .replace(/(^|\/)page\.(tsx|jsx|ts|js)$/, "")
        .replace(/(^|\/)route\.(tsx|jsx|ts|js)$/, "")
        .replace(/^app\//, "/");
      return route || "/";
    }
    return null;
  } else {
    // Pages router: pages/blog/[slug].tsx -> /blog/[slug]
    if (relativePath.startsWith("pages/")) {
      let route = relativePath
        .replace(/^pages\//, "/")
        .replace(/\.(tsx|jsx|ts|js)$/, "")
        .replace(/\/index$/, "");
      return route || "/";
    }
    return null;
  }
}

interface RouteNodeBuild extends Omit<RouteNode, 'method' | 'children'> {
  method: HttpMethod | HttpMethod[];
  children: RouteNodeBuild[];
}

function buildRouteTree(routes: Array<{
  path: string;
  method: HttpMethod;
  type: "page" | "api" | "layout" | "middleware";
  filePath: string;
}>): RouteNode[] {
  const root: RouteNodeBuild = {
    id: "root",
    path: "/",
    segment: "/",
    fullPath: "/",
    method: "ALL",
    type: "page",
    filePath: "",
    children: [],
  };
  
  for (const route of routes) {
    const segments = route.path.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      currentPath += "/" + segment;
      
      let child = current.children.find((c) => c.segment === segment);
      const isLastSegment = i === segments.length - 1;
      if (!child) {
        child = {
          id: `${route.filePath}-${i}`,
          path: currentPath,
          segment,
          fullPath: currentPath,
          method: isLastSegment ? route.method : "ALL",
          type: isLastSegment ? route.type : (route.type === "api" ? "api" : "layout"),
          filePath: isLastSegment ? route.filePath : "",
          children: [],
        };
        current.children.push(child);
      } else if (isLastSegment) {
        // At leaf level, accumulate methods if they differ
        if (Array.isArray(child.method)) {
          if (!child.method.includes(route.method)) {
            child.method.push(route.method);
          }
        } else if (child.method !== route.method) {
          child.method = [child.method, route.method];
        }
      }
      
      current = child;
    }
    
    // Update leaf node
    if (segments.length === 0) {
      // Root route - add as a child of root
      const rootRoute: RouteNodeBuild = {
        id: `root-${route.filePath}`,
        path: "/",
        segment: "/",
        fullPath: "/",
        method: route.method,
        type: route.type,
        filePath: route.filePath,
        children: [],
      };
      root.children.push(rootRoute);
    } else {
      current.type = route.type;
      current.filePath = route.filePath;
    }
  }
  
  // Convert methods to strings and return
  return root.children.map(node => convertNode(node));
}

function convertNode(node: RouteNodeBuild): RouteNode {
  return {
    ...node,
    method: Array.isArray(node.method) ? node.method.join(', ') as HttpMethod : node.method,
    children: node.children.map(convertNode),
  };
}

export async function analyzeRouteTree(dirPath: string): Promise<RouteNode[]> {
  const framework = detectFramework(dirPath);
  const routes: Array<{
    path: string;
    method: HttpMethod;
    type: "page" | "api" | "layout" | "middleware";
    filePath: string;
  }> = [];
  
  if (framework === "next-app") {
    const appDir = `${dirPath}/app`;
    const srcAppDir = `${dirPath}/src/app`;
    let baseDir: string;
    
    try {
      const stat = Deno.statSync(appDir);
      baseDir = stat.isDirectory ? appDir : srcAppDir;
    } catch {
      baseDir = srcAppDir;
    }
    
    // Walk app directory
    async function walkAppDir(dir: string) {
      try {
        for await (const entry of Deno.readDir(dir)) {
          const fullPath = `${dir}/${entry.name}`;
          
          if (isSymlink(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory) {
            if (!SKIP_DIRS.includes(entry.name)) {
              await walkAppDir(fullPath);
            }
          } else if (entry.isFile) {
            const isPage = entry.name.match(/^page\.(tsx|jsx|ts|js)$/);
            const isRoute = entry.name.match(/^route\.(tsx|jsx|ts|js)$/);
            const isLayout = entry.name.match(/^layout\.(tsx|jsx|ts|js)$/);
            const isMiddleware = entry.name === "middleware.ts" || entry.name === "middleware.js";
            
            if (isPage || isRoute || isLayout || isMiddleware) {
              try {
                const content = Deno.readTextFileSync(fullPath);
                const methods = isRoute ? extractHttpMethods(content) : (["GET"] as HttpMethod[]);
                
                const routePath = filePathToRoute(fullPath, "next-app", baseDir);
                if (routePath !== null) {
                  for (const method of methods) {
                    routes.push({
                      path: routePath,
                      method,
                      type: isLayout ? "layout" : isMiddleware ? "middleware" : isRoute ? "api" : "page",
                      filePath: fullPath,
                    });
                  }
                }
              } catch {
                // Skip files we can't read
              }
            }
          }
        }
      } catch (e) {
      }
    }
    
    await walkAppDir(baseDir);
  } else if (framework === "next-pages") {
    const pagesDir = `${dirPath}/pages`;
    const srcPagesDir = `${dirPath}/src/pages`;
    let baseDir: string;
    
    try {
      baseDir = Deno.statSync(pagesDir).isDirectory ? pagesDir : srcPagesDir;
    } catch {
      baseDir = srcPagesDir;
    }
    
    // Walk pages directory
    async function walkPagesDir(dir: string) {
      try {
        for await (const entry of Deno.readDir(dir)) {
          const fullPath = `${dir}/${entry.name}`;
          
          if (isSymlink(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory) {
            if (!SKIP_DIRS.includes(entry.name)) {
              await walkPagesDir(fullPath);
            }
          } else if (entry.isFile) {
            const ext = entry.name.substring(entry.name.lastIndexOf("."));
            if ([".tsx", ".jsx", ".ts", ".js"].includes(ext)) {
              const routePath = filePathToRoute(fullPath, "next-pages", baseDir);
              if (routePath !== null && !entry.name.startsWith("_")) {
                const isApi = routePath.startsWith("/api/");
                routes.push({
                  path: routePath,
                  method: isApi ? "ALL" : "GET",
                  type: isApi ? "api" : "page",
                  filePath: fullPath,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error(`Error walking pages directory:`, e);
      }
    }
    
    await walkPagesDir(baseDir);
  } else {
    // Check for Express/Hono routes in any JS/TS files
    const sourceFiles: string[] = [];
    
    async function findSourceFiles(dir: string) {
      try {
        for await (const entry of Deno.readDir(dir)) {
          const fullPath = `${dir}/${entry.name}`;
          
          if (isSymlink(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory) {
            if (!SKIP_DIRS.includes(entry.name)) {
              await findSourceFiles(fullPath);
            }
          } else if (entry.isFile) {
            const ext = entry.name.substring(entry.name.lastIndexOf("."));
            if ([".ts", ".js"].includes(ext)) {
              sourceFiles.push(fullPath);
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }
    
    await findSourceFiles(dirPath);
    
    for (const filePath of sourceFiles) {
      try {
        const content = Deno.readTextFileSync(filePath);
        const expressRoutes = extractExpressRoutes(content);
        
        for (const route of expressRoutes) {
          routes.push({
            path: route.path,
            method: route.method,
            type: "api",
            filePath,
          });
        }
      } catch {
        // Skip files we can't read
      }
    }
  }
  
  // Remove duplicate routes
  const uniqueRoutes = [...new Map(routes.map((r) => [`${r.path}-${r.method}`, r])).values()];
  
  return buildRouteTree(uniqueRoutes);
}