# ScriptObjectLens - QWEN.md

## Project Overview

**ScriptObjectLens** is a **Code Structure Visualizer** - a local-first architecture explorer for TypeScript/JavaScript projects. It combines a Deno analysis backend with a Next.js + D3 frontend to provide interactive visualizations of codebases.

### Core Features

The application provides five analysis tabs:

1. **Classes**: OOP relationship graph with class/interface/abstract/enum/type/function extraction, relationship mapping (extends, implements, composition, uses, imports), cycle detection, and cluster/table views
2. **File Graph**: Hierarchical import-aware file tree with static and dynamic import analysis, file classification (page, api, component, lib, config, util)
3. **Route Tree**: HTTP/page route discovery for Next.js (App Router + Pages Router) and Express-style route declarations
4. **DB Schema**: Prisma schema and Drizzle ORM table/relation parsing with model cards and directed relation rendering
5. **Architecture Diff** (NEW): Compare code structure between two git references (branches, tags, commits) with side-by-side visualization, change summaries, and impact analysis

### Architecture

```
Frontend (Next.js, port 3001)  <----HTTP---->  Backend (Deno, port 8000)
```

- **Frontend**: Rendering, filtering, tab state, and interaction (React, D3.js, Prism.js)
- **Backend**: Filesystem scanning, parsing, and analysis (Deno, TypeScript Compiler API)
- **Shared Types**: TypeScript interfaces in `shared/types.ts`

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | Next.js 15, React 18, D3.js 7, Prism.js |
| Backend | Deno 2, TypeScript Compiler API |
| Language | TypeScript (strict mode) |

## Project Structure

```
ScriptObjectLens/
├── backend/src/
│   ├── analyzer/
│   │   ├── parser.ts              # TypeScript/JavaScript parsing using TS Compiler API
│   │   ├── relationship-mapper.ts # Builds relationships and graph data
│   │   ├── file-analyzer.ts       # File import graph analysis
│   │   ├── route-analyzer.ts      # Next.js/Express route discovery
│   │   └── schema-analyzer.ts     # Prisma/Drizzle schema parsing
│   ├── server/
│   │   ├── server.ts              # Deno HTTP server with routing
│   │   └── handlers.ts            # API endpoint handlers
│   ├── shared/types.ts            # Backend type definitions
│   └── cli.ts                     # CLI entry point
├── frontend/
│   ├── src/
│   │   ├── app/                   # Next.js App Router pages
│   │   ├── components/            # React components (Graph, FileGraph, RouteTree, etc.)
│   │   └── lib/                   # Utility libraries
│   ├── package.json
│   └── next.config.js
├── shared/
│   └── types.ts                   # Shared TypeScript interfaces
├── deno.json                      # Deno configuration and tasks
├── start.sh                       # Quick start script
└── README.md
```

## Building and Running

### Prerequisites

- Deno 2+
- Node.js 18+
- npm

### Quick Start (Recommended)

```bash
./start.sh
```

This script:
1. Installs frontend dependencies
2. Starts backend API on `http://localhost:8000`
3. Starts frontend on `http://localhost:3001`

### Manual Start

**Backend:**
```bash
deno task start
```

**Frontend (new terminal):**
```bash
cd frontend
npm install
npm run dev
```

### Development Commands

**Root / Backend (Deno):**
```bash
deno task start      # Backend with watch mode
deno task cli        # Run backend CLI
deno test            # Backend tests
deno check backend/src/**/*.ts
```

**Frontend (Next.js):**
```bash
cd frontend
npm run dev
npm run lint
npm run build
npm run start
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/analyze` | POST | Run class/entity analysis |
| `/api/result/:id` | GET | Fetch cached analysis result |
| `/api/entity/:id` | GET | Fetch detailed entity metadata |
| `/api/file` | GET | Fetch source content by analysisId + path |
| `/api/filegraph?path=...` | GET | Build file import graph |
| `/api/routes?path=...` | GET | Discover route tree |
| `/api/schema?path=...` | GET | Parse DB schema |
| `/api/arch-diff` | POST | Compare architecture between git refs |
| `/api/git-refs?path=...` | GET | List branches and tags for a repository |

### POST /api/analyze Request Body

```json
{
  "path": "/absolute/path/to/project",
  "exclude": ["node_modules", "dist"],
  "include": ["**/*.ts", "**/*.tsx"]
}
```

### POST /api/arch-diff Request Body

```json
{
  "path": "/absolute/path/to/git-repo",
  "from": "main",
  "to": "feature-branch"
}
```

**Response:**
- `entities.added/removed/modified`: Changed classes, interfaces, etc.
- `relationships.added/removed`: New and broken dependencies
- `summary`: Statistics about changes
- `beforeSnapshot`/`afterSnapshot`: Full analysis data for visualization

## Usage Workflow

1. Open `http://localhost:3001`
2. Enter an **absolute project path**
3. Click **Analyze**
4. Explore tabs: Classes, File Graph, Route Tree, DB Schema

### Path Recommendation

Use your **project root** path (not a deep subdirectory) for best route/schema/file discovery.

## Development Conventions

### Code Style

- **TypeScript strict mode** enforced across the codebase
- Backend uses Deno's native module resolution with `npm:` specifiers for external packages
- Frontend follows Next.js 15 App Router conventions
- Shared types are duplicated in `shared/types.ts` and `backend/src/shared/types.ts`

### Testing Practices

- Backend tests run via `deno test`
- Frontend linting via `npm run lint` (Next.js ESLint)

### Security Notes

- Path validation rejects traversal (`..`) and system-protected prefixes (`/etc`, `/root`, `/sys`, etc.)
- Backend uses explicit CORS headers with configurable `ALLOWED_ORIGIN`
- Rate limiting enabled (default: 100 requests/minute)
- Required Deno permissions: `--allow-read --allow-net --allow-env`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGIN` | `http://localhost:3001` | CORS allowed origin |
| `RATE_LIMIT` | `100` | Max requests per minute |
| `API_URL` | `http://localhost:8001` | Frontend proxy target |

## Limitations

- Static-analysis heuristics may miss framework-specific edge cases
- Route and schema detection are best-effort for supported patterns
- Very large repositories can take longer to process and render
- File graph prioritizes tree readability over full edge density display

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Route Tree is empty | Ensure scan path is project root; confirm route files exist (`app/`, `pages/`, or Express routes) |
| DB Schema is empty | Confirm `prisma/schema.prisma` or Drizzle table definitions exist |
| File Graph incomplete | Verify source files use supported extensions: `.ts`, `.tsx`, `.js`, `.jsx` |
| Backend not reachable | Ensure backend runs on port 8000, frontend on 3001; check terminal logs |

## Key Type Definitions (shared/types.ts)

The project uses comprehensive TypeScript interfaces for:

- **Entity Types**: `ClassInfo`, `MethodInfo`, `PropertyInfo`, `EntityType`
- **Graph Data**: `GraphData`, `GraphNode`, `GraphEdge`, `Relationship`
- **File Graph**: `FileNode`, `FileEdge`, `FileGraphData`
- **Routes**: `RouteNode`, `HttpMethod`
- **Database**: `SchemaModel`, `SchemaField`, `SchemaRelation`
