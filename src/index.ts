#!/usr/bin/env node
import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { logIssue } from './issues.js';
import { navigation } from './tools/navigation.js';
import { snapshotTools } from './tools/snapshot.js';
import { content } from './tools/content.js';
import { search } from './tools/search.js';
import { debug } from './tools/debug.js';
import { edit } from './tools/edit.js';
import { session } from './tools/session.js';
import { issues } from './tools/issues.js';
import { text, currentUrl, type ToolDef, type Handler, type ToolModule } from './tools/types.js';
import { filterTools } from './toolFilter.js';
import { CLI_COMMANDS } from './cliArgs.js';

// Resolves to the repo-root package.json from both src/ and dist/.
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const server = new Server({ name: 'browse-mcp', version }, { capabilities: { tools: {} } });

// Merge per-category modules into flat tool list + handler map.
const MODULES: ToolModule[] = [
  navigation,
  snapshotTools,
  content,
  search,
  debug,
  edit,
  session,
  issues,
];

const tools: ToolDef[] = MODULES.flatMap((m) => m.tools);
const handlers: Record<string, Handler> = Object.assign({}, ...MODULES.map((m) => m.handlers));

// Tool exposure filtering (BROWSE_MCP_TOOLS bundles/presets) lives in
// toolFilter.ts so tests can exercise it without starting the server.
const exposedTools = filterTools(tools);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: exposedTools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const a = args as Record<string, any>;

  try {
    const handler = handlers[name];
    if (!handler) return text(`Unknown tool: ${name}`, true);
    return await handler(a);
  } catch (err: any) {
    await logIssue({
      kind: 'error',
      tool: name,
      args: a,
      error: err?.message || String(err),
      url: await currentUrl(),
    });
    return text(`Error: ${err.message}`, true);
  }
});

async function main() {
  // CLI mode: `browse-mcp read|search|research ...` — see src/cli.ts (#41).
  // No args (or unknown first arg) = MCP server over stdio, as before.
  const first = process.argv[2];
  if (first && CLI_COMMANDS.has(first)) {
    const { runCli } = await import('./cli.js');
    await runCli(process.argv.slice(2));
    return;
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
