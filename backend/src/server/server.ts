import {
  analyzeProject,
  getAnalysisResult,
  getEntityDetails,
  getFileContent,
  getFileGraph,
  getRouteTree,
  getDatabaseSchema,
  analyzeArchitectureDiff,
  getGitRefs,
  executeSandbox,
  killSandbox
} from "./handlers.ts";

interface Route {
  method: string;
  path: string;
  handler: (req: Request) => Promise<Response>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = parseInt(Deno.env.get("RATE_LIMIT") || "100");
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_CLEANUP_INTERVAL = 300000;

const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL);

// Allow clean process exit
if (typeof Deno !== 'undefined') {
  Deno.unrefTimer(rateLimitCleanupTimer);
}

const RATE_LIMITED_PATHS = new Set([
  "/api/analyze",
  "/api/arch-diff",
  "/api/filegraph",
  "/api/routes",
  "/api/schema",
  "/api/sandbox/execute",
]);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

function validateAnalyzeRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body" };
  }
  
  const obj = body as Record<string, unknown>;
  
  if (!obj.path || typeof obj.path !== "string") {
    return { valid: false, error: "Path is required" };
  }
  
  if (obj.path.length > 4096) {
    return { valid: false, error: "Path too long" };
  }
  
  if (obj.exclude && !Array.isArray(obj.exclude)) {
    return { valid: false, error: "Exclude must be an array" };
  }
  
  if (obj.include && !Array.isArray(obj.include)) {
    return { valid: false, error: "Include must be an array" };
  }
  
  return { valid: true };
}

const routes: Route[] = [
  {
    method: "POST",
    path: "/api/analyze",
    handler: async (req: Request) => {
      try {
        const corsHeaders = createCorsHeaders();
        const body = await req.json();
        
        const validation = validateAnalyzeRequest(body);
        if (!validation.valid) {
          return new Response(JSON.stringify({ success: false, error: validation.error }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
            status: 400
          });
        }
        
        const result = await analyzeProject({
          path: body.path,
          exclude: body.exclude,
          include: body.include
        });
        
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: result.success ? 200 : 400
        });
      } catch (e) {
        const corsHeaders = createCorsHeaders();
        return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 500
        });
      }
    }
  },
  {
    method: "GET",
    path: "/api/result/:id",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      const url = new URL(req.url);
      const id = url.pathname.split("/api/result/")[1]?.replace(/\/$/, '');

      if (!id || !UUID_REGEX.test(id)) {
        return new Response(JSON.stringify({ success: false, error: "Invalid ID format" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }

      const result = getAnalysisResult(id);
      
      if (result) {
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      
      return new Response(JSON.stringify({ success: false, error: "Analysis not found" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 404
      });
    }
  },
  {
    method: "GET",
    path: "/api/entity/:id",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      const url = new URL(req.url);
      const id = url.pathname.split("/api/entity/")[1]?.replace(/\/$/, '');

      if (!id || !UUID_REGEX.test(id)) {
        return new Response(JSON.stringify({ success: false, error: "Invalid ID format" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      const details = getEntityDetails(id);
      
      if (details) {
        return new Response(JSON.stringify({ success: true, details }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      
      return new Response(JSON.stringify({ success: false, error: "Entity not found" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 404
      });
    }
  },
  {
    method: "GET",
    path: "/api/file",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      const url = new URL(req.url);
      const analysisId = url.searchParams.get("analysisId");
      const filePath = url.searchParams.get("path");
      
      if (!analysisId || !UUID_REGEX.test(analysisId)) {
        return new Response(JSON.stringify({ success: false, error: "Invalid or missing analysis ID" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      if (!filePath) {
        return new Response(JSON.stringify({ success: false, error: "No file path provided" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      if (filePath.length > 4096) {
        return new Response(JSON.stringify({ success: false, error: "Path too long" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      const content = getFileContent(analysisId, filePath);
      
      if (content !== null) {
        return new Response(JSON.stringify({ success: true, content }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      
      return new Response(JSON.stringify({ success: false, error: "File not found" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 404
      });
    }
  },
  {
    method: "GET",
    path: "/api/filegraph",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      const url = new URL(req.url);
      const scanPath = url.searchParams.get("path");
      
      if (!scanPath) {
        return new Response(JSON.stringify({ success: false, error: "Path parameter is required" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      if (scanPath.length > 4096) {
        return new Response(JSON.stringify({ success: false, error: "Path too long" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      const result = await getFileGraph(scanPath);
      
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: result.success ? 200 : 400
      });
    }
  },
  {
    method: "GET",
    path: "/api/routes",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      const url = new URL(req.url);
      const scanPath = url.searchParams.get("path");
      
      if (!scanPath) {
        return new Response(JSON.stringify({ success: false, error: "Path parameter is required" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      if (scanPath.length > 4096) {
        return new Response(JSON.stringify({ success: false, error: "Path too long" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      const result = await getRouteTree(scanPath);
      
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: result.success ? 200 : 400
      });
    }
  },
  {
    method: "GET",
    path: "/api/schema",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      const url = new URL(req.url);
      const scanPath = url.searchParams.get("path");
      
      if (!scanPath) {
        return new Response(JSON.stringify({ success: false, error: "Path parameter is required" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      if (scanPath.length > 4096) {
        return new Response(JSON.stringify({ success: false, error: "Path too long" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
      
      const result = await getDatabaseSchema(scanPath);

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: result.success ? 200 : 400
      });
    }
  },
  {
    method: "POST",
    path: "/api/arch-diff",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();

      try {
        const body = await req.json();

        if (!body || typeof body !== "object") {
          return new Response(JSON.stringify({ success: false, error: "Invalid request body" }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
            status: 400
          });
        }

        const obj = body as Record<string, unknown>;

        if (!obj.path || typeof obj.path !== "string") {
          return new Response(JSON.stringify({ success: false, error: "Path is required" }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
            status: 400
          });
        }

        if (!obj.from || typeof obj.from !== "string") {
          return new Response(JSON.stringify({ success: false, error: "'from' ref is required" }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
            status: 400
          });
        }

        if (!obj.to || typeof obj.to !== "string") {
          return new Response(JSON.stringify({ success: false, error: "'to' ref is required" }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
            status: 400
          });
        }

        const result = await analyzeArchitectureDiff({
          path: obj.path,
          from: obj.from,
          to: obj.to
        });

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: result.success ? 200 : 400
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e instanceof Error ? e.message : "Internal server error"
        }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 500
        });
      }
    }
  },
  {
    method: "GET",
    path: "/api/git-refs",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      const url = new URL(req.url);
      const scanPath = url.searchParams.get("path");

      if (!scanPath) {
        return new Response(JSON.stringify({ success: false, error: "Path parameter is required" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }

      if (scanPath.length > 4096) {
        return new Response(JSON.stringify({ success: false, error: "Path too long" }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }

      const result = await getGitRefs(scanPath);

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: result.success ? 200 : 400
      });
    }
  },
  {
    method: "POST",
    path: "/api/sandbox/execute",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      try {
        const { stream, sessionId } = await executeSandbox(req);
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-Id": sessionId,
            "X-Accel-Buffering": "no",
            ...corsHeaders
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e instanceof Error ? e.message : "Sandbox execution failed"
        }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400
        });
      }
    }
  },
  {
    method: "POST",
    path: "/api/sandbox/kill",
    handler: async (req: Request) => {
      const corsHeaders = createCorsHeaders();
      try {
        const body = await req.json();
        const sessionId = body?.sessionId;

        if (!sessionId || typeof sessionId !== "string") {
          return new Response(JSON.stringify({ success: false, error: "sessionId is required" }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
            status: 400
          });
        }

        const result = await killSandbox(sessionId);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: e instanceof Error ? e.message : "Kill failed"
        }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 500
        });
      }
    }
  }
];

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:3001";

export function createCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Session-Id",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
  };
}

async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = createCorsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // Apply rate limiting to expensive endpoints
  if (RATE_LIMITED_PATHS.has(pathname)) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 429
      });
    }
  }

  for (const route of routes) {
    if (req.method === route.method) {
      let match = false;
      
      if (route.path.includes(":")) {
        const routeParts = route.path.split("/");
        const urlParts = pathname.split("/");
        
        if (routeParts.length === urlParts.length) {
          match = routeParts.every((part, i) => 
            part.startsWith(":") || part === urlParts[i]
          );
        }
      } else if (route.path === pathname) {
        match = true;
      }

      if (match) {
        try {
          return await route.handler(req);
        } catch (e) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: e instanceof Error ? e.message : "Internal server error" 
          }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
            status: 500
          });
        }
      }
    }
  }

  return new Response(JSON.stringify({ success: false, error: "Not found" }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    status: 404
  });
}

export function startServer(port: number = 8000): void {
  console.log(`Starting server on http://localhost:${port}`);

  Deno.serve({
    port,
    hostname: "127.0.0.1",
    handler: handleRequest
  });

  console.log(`API server running at http://localhost:${port}`);
}

// Start the server when run directly (not when imported)
if (import.meta.main) {
  startServer();
}
