# Code Structure Visualizer

Local-first architecture explorer for TypeScript/JavaScript projects.

It combines a Deno analysis backend with a Next.js + D3 frontend and now ships with four analysis tabs:

1. **Classes**: OOP relationship graph + cluster/table view
2. **File Graph**: hierarchical import-aware file tree
3. **Route Tree**: discovered HTTP/page routes (Next.js + Express-style)
4. **DB Schema**: Prisma/Drizzle model and relation map

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

### Path recommendation

Use your **project root** path (not a deep subdirectory) for best route/schema/file discovery.

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

### `POST /api/analyze` body

```json
{
  "path": "/absolute/path/to/project",
  "exclude": ["node_modules", "dist"],
  "include": ["**/*.ts", "**/*.tsx"]
}
```

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
│       │   └── ExportControls.tsx
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
- Backend requires Deno permissions: `--allow-read --allow-net --allow-env`.
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

### Backend not reachable

- Ensure backend is running on `8000` and frontend on `3001`.
- Check terminal logs for permission or path validation errors.

![Code View](./oopgraph04.png)

---

## License

MIT Licence

---
