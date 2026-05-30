/**
 * The slash-command table: the single source of truth for both the in-prompt
 * autocomplete palette and the `/help` listing, so the two can never drift.
 * Dispatch still lives in the session; this only describes the commands.
 */
export interface SlashCommand {
  readonly name: string;
  readonly summary: string;
  readonly aliases?: readonly string[];
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: '/exit', summary: 'end the session', aliases: ['/quit', '/bye'] },
  { name: '/clear', summary: 'clear conversation history' },
  { name: '/model', summary: 'switch model' },
  { name: '/provider', summary: 'switch provider (re-run setup)' },
  { name: '/think', summary: 'toggle model reasoning on/off' },
  { name: '/help', summary: 'show this help' },
];

/** Commands whose name or any alias prefix-matches the typed slash token. */
export function matchCommands(token: string): readonly SlashCommand[] {
  const q = token.toLowerCase();
  return SLASH_COMMANDS.filter(
    (c) => c.name.startsWith(q) || c.aliases?.some((a) => a.startsWith(q)),
  );
}

/** The `/help` body, derived so it stays in lockstep with the palette. */
export function helpText(): string {
  const width = Math.max(...SLASH_COMMANDS.map((c) => c.name.length));
  return SLASH_COMMANDS.map((c) => {
    const alias = c.aliases?.length ? ` (aliases: ${c.aliases.join(', ')})` : '';
    return `${c.name.padEnd(width)}  ${c.summary}${alias}`;
  }).join('\n');
}
