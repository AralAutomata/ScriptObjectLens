import { 
  analyzeProject, 
  getAnalysisResult, 
  getEntityDetails, 
  getFileContent 
} from "./handlers.ts";

interface Route {
  method: string;
  path: string;
  handler: (req: Request) => Promise<Response>;
}

const routes: Route[] = [
  {
    method: "POST",
    path: "/api/analyze",
    handler: async (req: Request) => {
      try {
        const body = await req.json();
        const result = await analyzeProject({
          path: body.path,
          exclude: body.exclude,
          include: body.include
        });
        
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
          status: result.success ? 200 : 400
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), {
          headers: { "Content-Type": "application/json" },
          status: 500
        });
      }
    }
  },
  {
    method: "GET",
    path: "/api/result/:id",
    handler: async (req: Request) => {
      const id = req.url.split("/api/result/")[1];
      const result = getAnalysisResult(id);
      
      if (result) {
        return new Response(JSON.stringify({ success: true, result }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      return new Response(JSON.stringify({ success: false, error: "Analysis not found" }), {
        headers: { "Content-Type": "application/json" },
        status: 404
      });
    }
  },
  {
    method: "GET",
    path: "/api/entity/:id",
    handler: async (req: Request) => {
      const id = req.url.split("/api/entity/")[1];
      const details = getEntityDetails(id);
      
      if (details) {
        return new Response(JSON.stringify({ success: true, details }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      return new Response(JSON.stringify({ success: false, error: "Entity not found" }), {
        headers: { "Content-Type": "application/json" },
        status: 404
      });
    }
  },
  {
    method: "GET",
    path: "/api/file",
    handler: async (req: Request) => {
      const url = new URL(req.url);
      const filePath = url.searchParams.get("path");
      
      if (!filePath) {
        return new Response(JSON.stringify({ success: false, error: "No file path provided" }), {
          headers: { "Content-Type": "application/json" },
          status: 400
        });
      }
      
      const content = getFileContent(filePath);
      
      if (content !== null) {
        return new Response(JSON.stringify({ success: true, content }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      return new Response(JSON.stringify({ success: false, error: "File not found" }), {
        headers: { "Content-Type": "application/json" },
        status: 404
      });
    }
  }
];

export function createCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = createCorsHeaders();
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

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
    handler: handleRequest
  });
  
  console.log(`API server running at http://localhost:${port}`);
}
