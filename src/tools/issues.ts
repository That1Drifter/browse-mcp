import { logIssue, readIssues, logPath } from '../issues.js';
import { text, currentUrl, type ToolModule } from './types.js';

export const issues: ToolModule = {
  tools: [
    {
      name: 'browser_report_difficulty',
      description:
        'Log a usability problem with this MCP server so it can be improved. Call this proactively whenever a browse tool was awkward, surprising, or required workarounds — e.g. a ref did not match the element you expected, a snapshot was too noisy, you had to retry a click, a tool response was ambiguous, or a needed capability is missing. Be specific. These notes drive future improvements.',
      inputSchema: {
        type: 'object',
        properties: {
          note: {
            type: 'string',
            description: 'Plain-language description of the friction or missing capability',
          },
          context: {
            type: 'object',
            description: 'Optional: structured context (tool name, args, URL, what you tried)',
          },
        },
        required: ['note'],
      },
    },
    {
      name: 'browser_review_issues',
      description:
        'Read recent auto-logged errors and reported difficulties for this MCP server. Useful at the start of a session to surface known rough edges, or to plan improvements.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max entries to return (default 30)' },
          kind: {
            type: 'string',
            enum: ['error', 'difficulty', 'all'],
            description: 'Filter by kind (default: all)',
          },
        },
      },
    },
  ],
  handlers: {
    async browser_report_difficulty(a) {
      await logIssue({
        kind: 'difficulty',
        note: a.note,
        context: a.context,
        url: await currentUrl(),
      });
      return text(`Logged. Thanks — noted to ${logPath()}`);
    },

    async browser_review_issues(a) {
      const limit = typeof a.limit === 'number' ? a.limit : 30;
      const kind = a.kind || 'all';
      const all = await readIssues(limit * 2);
      const filtered = kind === 'all' ? all : all.filter((i) => i.kind === kind);
      const slice = filtered.slice(-limit);
      if (slice.length === 0) return text('(no issues logged yet)');
      const lines = slice.map((i) => {
        const head = `[${i.ts}] ${i.kind}${i.tool ? ` ${i.tool}` : ''}`;
        const body =
          i.kind === 'error'
            ? `  error: ${i.error}${i.args ? `\n  args: ${JSON.stringify(i.args)}` : ''}${i.url ? `\n  url: ${i.url}` : ''}`
            : `  note: ${i.note}${i.context ? `\n  context: ${JSON.stringify(i.context)}` : ''}${i.url ? `\n  url: ${i.url}` : ''}`;
        return `${head}\n${body}`;
      });
      return text(lines.join('\n\n') + `\n\n(source: ${logPath()})`);
    },
  },
};
