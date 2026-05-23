/**
 * Experimental Ink front-end for one-shot mode. The entire interaction —
 * thinking, the command suggestion, the action row, and the revise loop — lives
 * in a single in-place frame that erases itself on exit, so the only thing left
 * in the scrollback is the command the user actually ran. Generation and the
 * revise loop run inside the component; the host only runs the chosen command.
 */
import { Box, Text, render, useApp, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BehaviorConfig } from '../config.ts';
import type { CommandSuggestion } from '../prompt.ts';
import { parseReply } from '../prompt.ts';
import type { Message, Provider } from '../providers/index.ts';
import { copyToClipboard } from '../runtime.ts';
import { scanCommand } from '../safety.ts';

const MAX_REVISIONS = 20;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const ACTIONS = ['Run', 'Revise', 'Copy', 'Cancel'] as const;
type Action = (typeof ACTIONS)[number];

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
  onDone: (outcome: TuiOutcome) => void;
}

/** A small braille spinner that advances on a fixed interval. */
function Spinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % SPINNER.length), 80);
    return () => clearInterval(id);
  }, []);
  return <Text color="cyan">{SPINNER[i]}</Text>;
}

/** Minimal single-line text input: typing, backspace, Enter, Esc. */
function TextInput({
  value,
  placeholder,
  onChange,
  onSubmit,
  onCancel,
}: Readonly<{
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}>) {
  useInput((input, key) => {
    if (key.return) return onSubmit(value);
    if (key.escape) return onCancel();
    if (key.backspace || key.delete) return onChange(value.slice(0, -1));
    if (input && !key.ctrl && !key.meta) onChange(value + input);
  });
  return (
    <Text>
      {value ? <Text>{value}</Text> : <Text dimColor>{placeholder}</Text>}
      <Text inverse> </Text>
    </Text>
  );
}

function App({ provider, behavior, messages, onDone }: Readonly<AppProps>) {
  const { exit } = useApp();
  const alive = useRef(true);
  const revisions = useRef(0);
  const [phase, setPhase] = useState<Phase>('thinking');
  const [suggestion, setSuggestion] = useState<CommandSuggestion | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const [revText, setRevText] = useState('');
  const [copied, setCopied] = useState(false);

  const finish = useCallback(
    (outcome: TuiOutcome) => {
      if (!alive.current) return;
      alive.current = false;
      onDone(outcome);
      exit();
    },
    [onDone, exit],
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
    const reply = parseReply(full, 'oneshot');
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
  }, [provider, behavior, messages, finish]);

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

  if (phase === 'thinking') {
    return (
      <Box>
        <Spinner />
        <Text> Thinking…</Text>
      </Box>
    );
  }

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

  if (phase === 'confirm') {
    return (
      <Box flexDirection="column">
        <Text color="red">⚠ Potentially destructive: {reasons.join('; ')}.</Text>
        <Text>
          Run anyway? <Text dimColor>(y/N)</Text>
        </Text>
      </Box>
    );
  }

  // suggest
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">▌ </Text>
        <Text bold>{suggestion.command}</Text>
        {behavior.explain && suggestion.explanation ? (
          <Text dimColor>{`   ${suggestion.explanation}`}</Text>
        ) : null}
      </Box>
      {reasons.length > 0 ? <Text color="red">⚠ {reasons.join('; ')}</Text> : null}
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
    </Box>
  );
}

/**
 * Render the one-shot Ink app and resolve once the user picks an outcome. The
 * live frame is cleared before unmount so it leaves no scrollback trace.
 */
export function runOneShotTui(params: {
  provider: Provider;
  behavior: BehaviorConfig;
  messages: Message[];
}): Promise<TuiOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const onDone = (outcome: TuiOutcome): void => {
      if (settled) return;
      settled = true;
      instance.clear();
      resolve(outcome);
    };
    const instance = render(
      <App
        provider={params.provider}
        behavior={params.behavior}
        messages={params.messages}
        onDone={onDone}
      />,
    );
  });
}
