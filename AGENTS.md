# Repository Guidelines

## Project Structure

Two-part TypeScript application:
- `backend/` - Deno API server + analysis pipeline
  - `backend/src/analyzer/` - TypeScript parsing and relationship mapping
  - `backend/src/server/` - HTTP handlers and routes
  - `backend/src/shared/types.ts` - Backend type definitions
  - `backend/src/cli.ts` - CLI entrypoint
- `frontend/` - Next.js visualizer UI
  - `frontend/src/app/` - Next.js app routes and global styles
  - `frontend/src/components/` - React components (`*.tsx`)
  - `frontend/src/lib/` - API client helpers
- `shared/types.ts` - Shared TypeScript types across frontend and backend

## Build, Test, and Development Commands

### Full Stack
```bash
./start.sh                    # Install deps, start backend (port 8000) + frontend (port 3001)
```

### Backend (Deno)
```bash
deno task start               # Start backend with file watching on port 8000
deno task cli                 # Run CLI entrypoint directly
deno run --allow-read --allow-net --allow-env backend/src/cli.ts --path ./my-project --port 8000

# Testing
deno test                     # Run all tests
deno test --allow-read        # Run tests with read permissions
deno test parser.test.ts      # Run single test file
deno test --filter "parseDirectory"  # Run specific test by name

# Type checking
deno check backend/src/**/*.ts
```

### Frontend (Next.js)
```bash
cd frontend
npm install                   # Install dependencies
npm run dev                   # Start development server on port 3001
npm run build                 # Production build
npm run start                 # Start production server
npm run lint                  # Run ESLint checks
```

## Code Style Guidelines

### TypeScript Configuration
- Strict mode enabled in both frontend and backend (`strict: true`)
- Target ES2020+ for backend, ES2017 for frontend
- Use explicit types for function parameters and return values
- Prefer interfaces over type aliases for object shapes
- Use `unknown` instead of `any` where possible

### Formatting
- 2-space indentation
- Single quotes for strings
- No trailing semicolons (follow existing patterns)
- Maximum line length: 100 characters (soft limit)

### Naming Conventions
- **Files**: PascalCase for React components (`Graph.tsx`, `NodeDetails.tsx`)
- **Files**: camelCase for utilities (`api.ts`, `handlers.ts`)
- **Components**: PascalCase (`Graph`, `NodeDetails`)
- **Functions/Variables**: camelCase (`analyzeProject`, `getEntityDetails`)
- **Types/Interfaces**: PascalCase (`ClassInfo`, `GraphNode`)
- **Constants**: UPPER_SNAKE_CASE for true constants (`RATE_LIMIT`, `CACHE_TTL_MS`)
- **Private methods**: prefix with underscore or use private modifier

### Imports
- Group imports: external libraries first, then internal modules
- Use explicit file extensions for Deno imports (`./handlers.ts`)
- Use path aliases for frontend (`@/components/Graph`)
- Prefer named imports over default exports for utilities
- React components can use default exports

### Error Handling
- Always wrap external operations in try-catch blocks
- Use type guards for error handling: `e instanceof Error ? e.message : "Unknown error"`
- Return structured error responses: `{ success: false, error: string }`
- Validate inputs at function boundaries using validation functions
- Use early returns for validation failures

### Code Patterns
- Prefer small, composable functions under 50 lines
- Keep React components focused on single responsibility
- Use React hooks pattern (useState, useEffect, useMemo)
- Mark client components with `'use client'` directive
- Use explicit return types for public functions
- Prefer `const` over `let`, avoid `var`

### Security
- Backend requires explicit Deno permissions (`--allow-read`, `--allow-net`, `--allow-env`)
- Validate all file paths to prevent directory traversal
- Sanitize user inputs before processing
- Set security headers (CORS, XSS protection, etc.)
- Never commit secrets or API keys

### Testing
- Backend tests: `*.test.ts` files alongside source files
- Frontend tests: `*.test.tsx` or `*.spec.tsx` near components
- Use Deno's built-in test runner with `Deno.test()`
- Prefer integration tests for API endpoints
- Mock external dependencies (Deno APIs, file system)

### Git Conventions
- Use Conventional Commits: `feat(backend): add caching`, `fix(frontend): resolve graph zoom`
- Keep commits atomic and focused
- Write clear, imperative commit messages
- Include PR summary, verification steps, and screenshots for UI changes
