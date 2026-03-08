# Repository Guidelines

## Project Structure & Module Organization
This repository is a two-part app:
- `backend/` (Deno): API + analysis pipeline.
  - `backend/src/analyzer/` parsing and relationship mapping
  - `backend/src/server/` HTTP handlers and routes
  - `backend/src/shared/` shared backend types
  - `backend/src/cli.ts` CLI entrypoint
- `frontend/` (Next.js): visualizer UI.
  - `frontend/src/app/` app routes and global styles
  - `frontend/src/components/` React components (`*.tsx`)
  - `frontend/src/lib/` API client helpers
- `shared/` shared TypeScript types used across frontend and backend
- Root files: `start.sh`, `deno.json`, `README.md`

## Build, Test, and Development Commands
- `./start.sh` — installs frontend dependencies, starts backend (`deno run ... backend/src/cli.ts`) and frontend (`npm run dev -p 3001`).
- `deno task start` — starts backend with file watching on port 8000.
- `deno task cli` — runs CLI entrypoint directly.
- `cd frontend && npm run dev` — start only frontend UI.
- `cd frontend && npm run build` — production build.
- `cd frontend && npm run lint` — run Next.js lint checks.

## Coding Style & Naming Conventions
- Use TypeScript throughout (`.ts`, `.tsx`).
- Favor `strict` typing and explicit interfaces/types.
- 2-space indentation.
- Existing patterns: PascalCase for React components/files (`Graph.tsx`, `NodeDetails.tsx`), camelCase for variables/functions, `kebab-case` or `snake_case` for CSS utility/helper names.
- Keep API boundary data shapes defined in shared types.
- Prefer small, composable functions and keep naming aligned to feature domain (`analyzeProject`, `createCorsHeaders`).

## Testing Guidelines
- Current repo has no dedicated test suite included yet.
- Add backend tests as `*.test.ts` and run:
  - `deno test --allow-read`
- Add frontend tests as `*.test.tsx`/`*.spec.tsx` near the component or under a dedicated `__tests__` folder.
- Suggested minimum coverage before merge: parser/analyzer logic, route validation, and core UI interactions in analysis/filtering flows.

## Commit & Pull Request Guidelines
- No explicit commit convention is documented in history artifacts available here.
- Use clear, imperative commit messages; prefer Conventional Commits (e.g. `feat(backend): add relationship deduping`).
- PRs should include: concise summary, files changed, manual verification steps, related issue/feature context, and screenshots for UI changes.

## Security & Configuration Tips
- Backend requires explicit permissions in scripts (`--allow-read`, `--allow-net`, `--allow-env`).
- Runtime env vars are expected from code (`PORT`, `RATE_LIMIT`, `ALLOWED_ORIGIN`-style values).
- Avoid committing secrets, local absolute paths, or generated analysis caches.
