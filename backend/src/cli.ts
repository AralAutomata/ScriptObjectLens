#!/usr/bin/env -S deno run --allow-all

import { startServer } from "./server/server.ts";

interface CLIArgs {
  path: string;
  port: number;
}

function parseArgs(): CLIArgs {
  const args = Deno.args;
  let path = Deno.cwd();
  let port = 8000;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === "--path" || arg === "-p") {
      if (i + 1 < args.length) {
        path = args[++i];
      }
    } else if (arg === "--port" || arg === "-o") {
      if (i + 1 < args.length) {
        const parsed = parseInt(args[++i], 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
          console.error(`Invalid port: "${args[i]}". Must be a number between 1 and 65535.`);
          Deno.exit(1);
        }
        port = parsed;
      }
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      Deno.exit(0);
    } else if (!arg.startsWith("-")) {
      path = arg;
    }
  }

  return { path, port };
}

function printHelp(): void {
  console.log(`
TypeScript Code Structure Visualizer
Usage: deno run --allow-all backend/src/cli.ts [options]

Options:
  --path, -p <path>    Directory to analyze (default: current directory)
  --port, -o <port>   Port for the API server (default: 8000)
  --help, -h          Show this help message

Example:
  deno run --allow-all backend/src/cli.ts --path ./my-project --port 8000
`);
}

const { path, port } = parseArgs();

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║      TypeScript Code Structure Visualizer - API Server        ║
╠═══════════════════════════════════════════════════════════════╣
║  Scan Path: ${path.padEnd(56)}║
║  Port:     ${port.toString().padEnd(56)}║
╚═══════════════════════════════════════════════════════════════╝

Starting API server...
`);

startServer(port);

console.log(`
API is ready! 

Next steps:
1. Start the frontend: cd frontend && npm run dev
2. Open http://localhost:3000 in your browser
3. Enter the path to your TypeScript/JavaScript project
`);
