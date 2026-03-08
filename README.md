# Code Structure Visualizer

Local-first architecture explorer for TypeScript/JavaScript projects.

It combines a Deno analysis backend with a Next.js + D3 frontend and now ships with five analysis tabs:

1. **Classes**: OOP relationship graph + cluster/table view
2. **File Graph**: hierarchical import-aware file tree
3. **Route Tree**: discovered HTTP/page routes (Next.js + Express-style)
4. **DB Schema**: Prisma/Drizzle model and relation map
5. **Architecture Diff**: compare code structure between git references

![Code Panel](./oopgraph05.png)

---

## What You Can Explore

### 1) Classes Tab

- Class/interface/abstract/enum/type/function extraction from TS/JS source
- Relationship graph (`extends`, `implements`, `composition`, `uses`, `imports`)
- Degree/cycle metadata (high-degree detection + cycle markers)
- View modes:
  - **Graph**: force-directed architecture map
  - **Clusters**: grouped table cards with edge breakdowns
- Entity inspection panel with details + source-code view
- Export controls (JSON, SVG, PNG)

![Main Cluster](./oopgraph06.png)

### 2) File Graph Tab

- Import graph from static + dynamic imports (`import` / `import()`)
- File classification (`page`, `api`, `component`, `lib`, `config`, `util`)
- Hierarchical tree built from project-relative file paths
- Expand/collapse folders, search, and type filters
- Vertical scroll behavior for deep trees

![Route Tree View](./oopgraph07.png)

### 3) Route Tree Tab

- Framework detection and route discovery for:
  - Next.js App Router (`app/`, `src/app/`)
  - Next.js Pages Router (`pages/`, `src/pages/`)
  - Express-style route declarations (`app.get`, `router.post`, etc.)
- Method extraction for route handlers (GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS)
- Merged method display for shared route paths
- Expand/collapse tree navigation with hover metadata

![DB Schema View](./oopgraph08.png)

### 4) DB Schema Tab

- Prisma schema parsing (`schema.prisma`)
- Drizzle table + relation parsing (`pgTable/mysqlTable/sqliteTable`, `references`, `relations()`)
- Model cards with field metadata (`id`, `unique`, optionality, relation hints)
- Directed relation rendering with type-aware styling

![File Graph View](./oopgraph09.png)

### 5) Architecture Diff Tab (NEW)

- Compare code structure between any two git references (branches, tags, commits)
- Side-by-side graph visualization with synchronized zoom/pan
- Entity change detection:
  - **Added**: new classes, interfaces, enums, type aliases, functions
  - **Removed**: deleted entities
  - **Modified**: changed methods, properties, inheritance
- Relationship change tracking:
  - New dependencies and imports
  - Broken relationships from removed code
- Impact analysis showing affected dependencies
- Filter controls for change types (added/removed/modified)
- Dual view modes:
  - **Graph**: side-by-side architecture comparison
  - **List**: detailed change list with entity breakdown

![Git Graph View](./oopgraph10.png)

---

## Architecture

```text
Frontend (Next.js, port 3001)  <----HTTP---->  Backend (Deno, port 8000)
```

- **Frontend** handles rendering, filtering, tab state, and interaction.
- **Backend** performs filesystem scanning, parsing, and analysis.
- **Shared types** live in `shared/types.ts` and `backend/src/shared/types.ts`.

---

## Tech Stack

- **Frontend**: Next.js 15, React 18, D3.js 7, Prism.js
- **Backend**: Deno 2, TypeScript Compiler API
- **Language**: TypeScript (strict mode)

---

## Getting Started

### Prerequisites

- Deno 2+
- Node.js 18+
- npm

### Quick Start (recommended)

```bash
./start.sh
```

This script:

1. Installs frontend dependencies
2. Starts backend API on `http://localhost:8000`
3. Starts frontend on `http://localhost:3001`

Press `Ctrl+C` to stop both.

### Manual Start

Backend:

```bash
deno task start
```

Frontend (new terminal):

```bash
cd frontend
npm install
npm run dev
```

---

## Usage Workflow

1. Open `http://localhost:3001`
2. Enter an **absolute project path**
3. Click **Analyze**
4. Explore tabs:
   - `Classes`
   - `File Graph`
   - `Route Tree`
   - `DB Schema`
   - `Architecture Diff`

### Path recommendation

Use your **project root** path (not a deep subdirectory) for best route/schema/file discovery.

### Git repository requirement

The **Architecture Diff** tab requires the project to be a valid Git repository. Use it to compare:
- Different branches (e.g., `main` → `feature-branch`)
- Tags (e.g., `v1.0.0` → `v2.0.0`)
- Commits (e.g., `HEAD~1` → `HEAD`)

---

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Run class/entity analysis |
| `/api/result/:id` | GET | Fetch cached analysis result |
| `/api/entity/:id` | GET | Fetch detailed entity metadata |
| `/api/file` | GET | Fetch source content by `analysisId` + path |
| `/api/filegraph?path=...` | GET | Build file import graph |
| `/api/routes?path=...` | GET | Discover route tree |
| `/api/schema?path=...` | GET | Parse DB schema |
| `/api/arch-diff` | POST | Compare architecture between git refs |
| `/api/git-refs?path=...` | GET | List branches and tags for a repository |

### `POST /api/analyze` body

```json
{
  "path": "/absolute/path/to/project",
  "exclude": ["node_modules", "dist"],
  "include": ["**/*.ts", "**/*.tsx"]
}
```

### `POST /api/arch-diff` body

```json
{
  "path": "/absolute/path/to/git-repo",
  "from": "main",
  "to": "feature-branch"
}
```

**Response includes:**
- `entities.added/removed/modified`: Changed classes, interfaces, etc.
- `relationships.added/removed`: New and broken dependencies
- `summary`: Statistics about total changes
- `beforeSnapshot`/`afterSnapshot`: Full analysis data for visualization

---

## Development Commands

### Root / Backend (Deno)

```bash
deno task start      # backend with watch mode
deno task cli        # run backend CLI
deno test            # backend tests
deno check backend/src/**/*.ts
```

### Frontend (Next.js)

```bash
cd frontend
npm run dev
npm run lint
npm run build
npm run start
```

---

## Project Structure

```text
.
├── backend/
│   └── src/
│       ├── analyzer/
│       │   ├── parser.ts
│       │   ├── relationship-mapper.ts
│       │   ├── file-analyzer.ts
│       │   ├── route-analyzer.ts
│       │   └── schema-analyzer.ts
│       ├── git/
│       │   ├── git-client.ts         # Git operations (NEW)
│       │   ├── git-types.ts          # Git types (NEW)
│       │   └── diff-analyzer.ts      # Architecture diff logic (NEW)
│       ├── server/
│       │   ├── handlers.ts
│       │   └── server.ts
│       ├── shared/
│       │   └── types.ts
│       └── cli.ts
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx
│       │   └── page.css
│       ├── components/
│       │   ├── Graph.tsx
│       │   ├── FileGraph.tsx
│       │   ├── RouteTree.tsx
│       │   ├── DatabaseSchema.tsx
│       │   ├── NodeDetails.tsx
│       │   ├── SearchBar.tsx
│       │   ├── ExportControls.tsx
│       │   ├── RefSelector.tsx       # Git ref picker (NEW)
│       │   ├── DiffSummary.tsx       # Change statistics (NEW)
│       │   ├── SideBySideGraph.tsx   # Dual graph view (NEW)
│       │   ├── ChangeList.tsx        # Change list (NEW)
│       │   └── ArchitectureDiff.tsx  # Main diff component (NEW)
│       └── lib/
│           └── api.ts
├── shared/
│   └── types.ts
├── deno.json
└── start.sh
```



---

## Security + Runtime Notes

- Path validation rejects traversal/system-protected prefixes.
- Backend uses explicit CORS/security headers.
- Backend requires Deno permissions: `--allow-read --allow-write --allow-net --allow-env --allow-run`.
- The `--allow-run` permission is required for Git operations (Architecture Diff feature).
- This tool is intended for local analysis, not remote repository scanning.

---

## Limitations

- Static-analysis heuristics may miss framework-specific edge cases.
- Route and schema detection are best-effort for supported patterns.
- Very large repositories can take longer to process and render.
- File graph currently prioritizes tree readability over full edge density display.

---

## Troubleshooting

### Route Tree is empty

- Make sure the scan path is the project root.
- Confirm route files exist (`app/`, `src/app/`, `pages/`, `src/pages/`, or Express-style route calls).

### DB Schema is empty

- Confirm a Prisma schema (`prisma/schema.prisma`) or Drizzle table definitions exist.

### File Graph seems incomplete

- Verify source files are under supported extensions: `.ts`, `.tsx`, `.js`, `.jsx`.
- Re-run analysis using the repository root.

### Architecture Diff shows "Not a valid git repository"

- Ensure the project path is a valid Git repository (has `.git` directory).
- Check that Git is installed and accessible from the command line.
- The backend requires `--allow-run` permission to execute Git commands.

### Backend not reachable

- Ensure backend is running on `8000` and frontend on `3001`.
- Check terminal logs for permission or path validation errors.
- Run `./start.sh` which handles proper cleanup and startup.

![Code View](./oopgraph04.png)

---

## License

MIT Licence

---
