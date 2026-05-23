/**
 * The command-suggestion frame, shared by one-shot and interactive modes. This
 * container owns the flow — streaming generation, the revise loop, action
 * dispatch and the destructive-command gate — and delegates all rendering to
 * the pure views in ./suggestion-views.tsx. The whole interaction lives in a
 * single in-place frame that erases itself on exit (see ./render.ts), leaving
 * only the chosen result; the host runs the chosen command afterwards.
 */
import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BehaviorConfig } from '../config.ts';
import type { CommandSuggestion } from '../prompt.ts';
import { parseReply } from '../prompt.ts';
import type { Message, Provider } from '../providers/index.ts';
import { copyToClipboard } from '../runtime.ts';
import { scanCommand } from '../safety.ts';
import { TextInput } from './components.tsx';
import { runFrame } from './render.ts';
import {
  ACTIONS,
  type Action,
  ConfirmView,
  SuggestView,
  ThinkingView,
} from './suggestion-views.tsx';

const MAX_REVISIONS = 20;
type Mode = 'oneshot' | 'interactive';

/** What the host should do once the frame closes. */
export type TuiOutcome =
  | { kind: 'run'; command: string }
  | { kind: 'chat'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'cancel' };

type Phase = 'thinking' | 'suggest' | 'confirm' | 'revise';

interface AppProps {
  provider: Provider;
  behavior: BehaviorConfig;
  messages: Message[];
  mode: Mode;
  resolve: (outcome: TuiOutcome) => void;
}

function App({ provider, behavior, messages, mode, resolve }: Readonly<AppProps>) {
  const alive = useRef(true);
  const revisions = useRef(0);
  const [phase, setPhase] = useState<Phase>('thinking');
  const [suggestion, setSuggestion] = useState<CommandSuggestion | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const [revText, setRevText] = useState('');
  const [copied, setCopied] = useState(false);

  // Resolve once; runFrame handles unmount and clearing the frame.
  const finish = useCallback(
    (outcome: TuiOutcome) => {
      if (!alive.current) return;
      alive.current = false;
      resolve(outcome);
    },
    [resolve],
  );

  const generate = useCallback(async () => {
    setPhase('thinking');
    let full = '';
    try {
      for await (const chunk of provider.chat(messages, { think: behavior.think })) full += chunk;
    } catch (err) {
      finish({ kind: 'error', message: (err as Error).message });
      return;
    }
    if (!alive.current) return;
    messages.push({ role: 'assistant', content: full });
    const reply = parseReply(full, mode);
    if (reply.type === 'chat') {
      finish({ kind: 'chat', message: reply.message });
      return;
    }
    const safety = scanCommand(reply.command);
    if (behavior.autoConfirmSafe && !safety.dangerous) {
      finish({ kind: 'run', command: reply.command });
      return;
    }
    setSuggestion(reply);
    setReasons(safety.dangerous ? safety.reasons : []);
    setSel(0);
    setCopied(false);
    setPhase('suggest');
  }, [provider, behavior, messages, mode, finish]);

  // Kick off the first generation, and mark the component dead on unmount so a
  // late-resolving stream never writes state into a torn-down tree.
  useEffect(() => {
    void generate();
    return () => {
      alive.current = false;
    };
  }, [generate]);

  const choose = useCallback(
    (action: Action) => {
      if (!suggestion) return;
      if (action === 'Cancel') return finish({ kind: 'cancel' });
      if (action === 'Copy') {
        void copyToClipboard(suggestion.command).then((ok) => alive.current && setCopied(ok));
        return;
      }
      if (action === 'Revise') {
        setRevText('');
        setPhase('revise');
        return;
      }
      // Run
      if (reasons.length > 0) {
        setPhase('confirm');
        return;
      }
      finish({ kind: 'run', command: suggestion.command });
    },
    [suggestion, reasons, finish],
  );

  useInput(
    (input, key) => {
      if (phase === 'suggest') {
        if (key.leftArrow) setSel((s) => (s + ACTIONS.length - 1) % ACTIONS.length);
        else if (key.rightArrow) setSel((s) => (s + 1) % ACTIONS.length);
        else if (key.return) choose(ACTIONS[sel] as Action);
        else if (key.escape) finish({ kind: 'cancel' });
        return;
      }
      if (phase === 'confirm' && suggestion) {
        if (input === 'y' || input === 'Y') finish({ kind: 'run', command: suggestion.command });
        else if (key.escape || input === 'n' || input === 'N') setPhase('suggest');
      }
    },
    { isActive: phase === 'suggest' || phase === 'confirm' },
  );

  const submitRevision = useCallback(
    (feedback: string) => {
      const trimmed = feedback.trim();
      if (!trimmed) return setPhase('suggest');
      if (++revisions.current > MAX_REVISIONS) {
        finish({ kind: 'error', message: 'Too many revisions; stopping.' });
        return;
      }
      messages.push({ role: 'user', content: `Revise the command: ${trimmed}` });
      void generate();
    },
    [messages, generate, finish],
  );

  if (phase === 'thinking') return <ThinkingView />;

  if (phase === 'revise') {
    return (
      <Box>
        <Text color="cyan">▌ </Text>
        <TextInput
          value={revText}
          placeholder="what should change? e.g. use ripgrep instead"
          onChange={setRevText}
          onSubmit={submitRevision}
          onCancel={() => setPhase('suggest')}
        />
      </Box>
    );
  }

  if (!suggestion) return <Text> </Text>;
  if (phase === 'confirm') return <ConfirmView reasons={reasons} />;

  return (
    <SuggestView
      suggestion={suggestion}
      explain={behavior.explain}
      reasons={reasons}
      sel={sel}
      copied={copied}
    />
  );
}

/**
 * Render the suggestion frame and resolve once the user picks an outcome. The
 * host is responsible for any persistent output (running the command, printing
 * a chat reply, or reporting an error).
 */
export function runSuggestionTui(params: {
  provider: Provider;
  behavior: BehaviorConfig;
  messages: Message[];
  mode: Mode;
}): Promise<TuiOutcome> {
  return runFrame<TuiOutcome>((resolve) => (
    <App
      provider={params.provider}
      behavior={params.behavior}
      messages={params.messages}
      mode={params.mode}
      resolve={resolve}
    />
  ));
}
