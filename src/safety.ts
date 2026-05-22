/**
 * Static scan for destructive command patterns. A flagged command always
 * requires explicit extra confirmation and is NEVER auto-run, even when
 * auto-confirm is enabled. This is a heuristic guard, not a sandbox: it errs
 * toward warning rather than guaranteeing safety.
 */
export interface SafetyResult {
  dangerous: boolean;
  reasons: string[];
}

interface Rule {
  pattern: RegExp;
  reason: string;
}

const RULES: Rule[] = [
  {
    pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r)\b/i,
    reason: 'recursive force delete (rm -rf)',
  },
  { pattern: /\brm\s+-[a-z]*\s+\/(?:\s|$)/i, reason: 'deletes the filesystem root' },
  { pattern: /\bdd\b[^|]*\bof=\/dev\//i, reason: 'dd writing directly to a device' },
  { pattern: /\bmkfs(\.\w+)?\b/i, reason: 'formats a filesystem (mkfs)' },
  { pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'fork bomb' },
  {
    pattern: /\bchmod\s+-[a-z]*R[a-z]*\s+0*777\b/i,
    reason: 'recursive chmod 777 (world-writable)',
  },
  { pattern: /\bchown\s+-[a-z]*R\b/i, reason: 'recursive ownership change' },
  {
    pattern: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i,
    reason: 'pipes a remote script straight into a shell',
  },
  { pattern: />\s*\/dev\/(sd[a-z]|nvme\d|disk\d)/i, reason: 'overwrites a raw block device' },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/i, reason: 'powers off or reboots the machine' },
  {
    pattern: /\bgit\s+(push\s+.*--force\b|push\s+-f\b)/i,
    reason: 'force-push can overwrite remote history',
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    reason: 'discards uncommitted changes (git reset --hard)',
  },
  { pattern: /\bfind\b[^|]*\s-delete\b/i, reason: 'bulk delete via find -delete' },
  { pattern: /\b(sudo\s+)?truncate\s+-s\s*0\b/i, reason: 'truncates a file to zero bytes' },
  { pattern: />\s*\/etc\//i, reason: 'overwrites a system configuration file' },
];

/** Scan a command string and report any destructive patterns matched. */
export function scanCommand(command: string): SafetyResult {
  const reasons: string[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(command)) reasons.push(rule.reason);
  }
  return { dangerous: reasons.length > 0, reasons };
}
