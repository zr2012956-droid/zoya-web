import { Type, type FunctionDeclaration } from '@google/genai';

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'openWebsite',
    description: 'Open a website in a new browser tab.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: 'Site address, e.g. "youtube.com" or "https://example.com".' },
      },
      required: ['url'],
    },
  },
  {
    name: 'searchWeb',
    description: 'Search Google for a query in a new browser tab.',
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: 'What to search for.' } },
      required: ['query'],
    },
  },
  {
    name: 'getTime',
    description: "Get the user's current local date and time.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

type Args = Record<string, unknown> | undefined;
type ToolResult = Record<string, unknown>;

function openTab(url: string): ToolResult {
  const w = window.open(url, '_blank');
  if (!w) return { ok: false, error: 'The browser blocked the new tab. Ask the user to allow pop-ups.' };
  w.opener = null;
  return { ok: true, opened: url };
}

function normalizeUrl(raw: string): string | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const handlers: Record<string, (args: Args) => ToolResult> = {
  openWebsite: (args) => {
    const url = normalizeUrl(String(args?.url ?? '').trim());
    return url ? openTab(url) : { ok: false, error: 'That is not a valid http(s) address.' };
  },
  searchWeb: (args) => {
    const q = String(args?.query ?? '').trim();
    return q ? openTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`) : { ok: false, error: 'Empty query.' };
  },
  getTime: () => ({ ok: true, now: new Date().toLocaleString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
};

export function runTool(name: string | undefined, args: Args): ToolResult {
  const fn = name ? handlers[name] : undefined;
  if (!fn) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return fn(args);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Tool failed.' };
  }
}
