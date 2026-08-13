import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'agv2-argvprobe-'));
const bin = join(dir, 'claude.exe');
execFileSync('gcc', ['-O0', '-o', bin, 'D:/Users/r.shi/work-space/incubator-mess/requirement-agent-skill/ace/plugin/skills/auto-goal-v2/tests/fixtures/argv-echo-stub.c'], { stdio: 'pipe' });

const args = ['-p', '--bare', '--no-session-persistence', '--setting-sources', '', '--tools', '', '--output-format', 'json', '--system-prompt', 'line one\nline two with spaces'];

async function run(shell) {
  return new Promise((res) => {
    const chunks = [];
    let err = null;
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell, cwd: dir });
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('error', (e) => { err = String(e.message); res({ err }); });
    child.on('exit', (code) => res({ code, err, out: Buffer.concat(chunks).toString('utf8') }));
    child.stdin.on('error', () => {});
    child.stdin.write('objective text');
    child.stdin.end();
  });
}

for (const shell of [false, true]) {
  const r = await run(shell);
  console.log(`--- shell: ${shell} ---`);
  console.log('exit', r.code, 'err', r.err);
  if (r.out) {
    try {
      const parsed = JSON.parse(r.out);
      console.log('argc:', parsed.argv_echo.argc);
      console.log('argv:', JSON.stringify(parsed.argv_echo.argv));
    } catch (e) { console.log('unparsed:', JSON.stringify(r.out.slice(0, 500))); }
  }
}
