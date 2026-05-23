/**
 * Presentational pieces of the suggestion frame. These are pure views: they
 * render the model from props and hold no flow logic, so the container in
 * suggestion-app.tsx stays focused on state and input handling.
 */
import { Box, Text } from 'ink';
import type { CommandSuggestion } from '../prompt.ts';
import { Spinner } from './components.tsx';

export const ACTIONS = ['Run', 'Revise', 'Copy', 'Cancel'] as const;
export type Action = (typeof ACTIONS)[number];

/** The "generating" placeholder shown while the model streams. */
export function ThinkingView() {
  return (
    <Box>
      <Spinner />
      <Text> Thinking…</Text>
    </Box>
  );
}

/** The y/N gate shown before running a command flagged as destructive. */
export function ConfirmView({ reasons }: Readonly<{ reasons: string[] }>) {
  return (
    <Box flexDirection="column">
      <Text color="red">⚠ Potentially destructive: {reasons.join('; ')}.</Text>
      <Text>
        Run anyway? <Text dimColor>(y/N)</Text>
      </Text>
    </Box>
  );
}

/** The horizontal Run · Revise · Copy · Cancel row with the active item lit. */
function ActionRow({ sel, copied }: Readonly<{ sel: number; copied: boolean }>) {
  return (
    <Box>
      {ACTIONS.map((a, i) => (
        <Text key={a}>
          <Text inverse={i === sel} dimColor={i !== sel}>
            {` ${a} `}
          </Text>
          {i < ACTIONS.length - 1 ? <Text dimColor> · </Text> : null}
        </Text>
      ))}
      {copied ? <Text dimColor>{'   copied'}</Text> : null}
    </Box>
  );
}

/** The command, its optional explanation and safety note, plus the action row. */
export function SuggestView({
  suggestion,
  explain,
  reasons,
  sel,
  copied,
}: Readonly<{
  suggestion: CommandSuggestion;
  explain: boolean;
  reasons: string[];
  sel: number;
  copied: boolean;
}>) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">▌ </Text>
        <Text bold>{suggestion.command}</Text>
        {explain && suggestion.explanation ? (
          <Text dimColor>{`   ${suggestion.explanation}`}</Text>
        ) : null}
      </Box>
      {reasons.length > 0 ? <Text color="red">⚠ {reasons.join('; ')}</Text> : null}
      <ActionRow sel={sel} copied={copied} />
    </Box>
  );
}
