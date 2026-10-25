import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
const workflow = await readFile(
  new URL('../.github/workflows/checks.yml', import.meta.url),
  'utf8',
);
const step = (name) => workflow.split('      - name: ' + name + '\n')[1].split('      - name: ')[0];
const script = (name) =>
  step(name)
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
test('the CD key reaches only deployment runtime, never pull/build or CI test jobs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'accescheck-deploy-'));
  try {
    const cli = join(root, 'vercel'),
      trace = join(root, 'trace.jsonl');
    await writeFile(
      cli,
      '#!' +
        process.execPath +
        '\nconst fs = require("node:fs");fs.appendFileSync(process.env.TRACE_FILE, JSON.stringify({args:process.argv.slice(2),hasKey:!!process.env.OPENAI_API_KEY})+"\\n");',
    );
    await chmod(cli, 0o755);
    const common = {
      PATH: root + ':' + dirname(process.execPath) + ':/usr/bin:/bin',
      TRACE_FILE: trace,
      VERCEL_TOKEN: 'fixture-vercel-token',
      GITHUB_OUTPUT: join(root, 'outputs'),
    };
    execFileSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script('Build production')],
      { env: common, stdio: 'pipe' },
    );
    execFileSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script('Deploy production')],
      {
        env: {
          ...common,
          OPENAI_API_KEY: 'fixture-private-key',
          OPENAI_SEARCH_MODEL: 'gpt-5.4-mini',
        },
        stdio: 'pipe',
      },
    );
    const recorded = (await readFile(trace, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(
      recorded.map((call) => call.hasKey),
      [false, false, true],
    );
    const calls = recorded.map((call) => call.args);
    assert.equal(await readFile(common.GITHUB_OUTPUT, 'utf8'), 'search_configured=true\n');
    assert.ok(!step('Build production').includes('OPENAI_API_KEY'));
    assert.equal(calls.length, 3);
    assert.equal(calls[0][0], 'pull');
    assert.equal(calls[1][0], 'build');
    assert.equal(calls[2][0], 'deploy');
    for (const args of calls.slice(0, 2)) {
      assert.ok(!args.some((value) => value.includes('fixture-private-key')));
      assert.ok(!args.includes('--env'));
    }
    assert.ok(calls[2].includes('OPENAI_API_KEY=fixture-private-key'));
    assert.ok(calls[2].includes('OPENAI_SEARCH_MODEL=gpt-5.4-mini'));
    assert.ok(!workflow.split('  deploy-production:')[0].includes('secrets.OPENAI_API_KEY'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('deploying without an optional key keeps the directory configuration and passes no empty runtime variables', async () => {
  const root = await mkdtemp(join(tmpdir(), 'accescheck-no-key-'));
  try {
    const cli = join(root, 'vercel'),
      trace = join(root, 'trace.jsonl'),
      output = join(root, 'outputs');
    await writeFile(
      cli,
      '#!' +
        process.execPath +
        '\nrequire("node:fs").writeFileSync(process.env.TRACE_FILE,JSON.stringify(process.argv.slice(2)));',
    );
    await chmod(cli, 0o755);
    execFileSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script('Deploy production')],
      {
        env: {
          PATH: root + ':/usr/bin:/bin',
          TRACE_FILE: trace,
          GITHUB_OUTPUT: output,
          VERCEL_TOKEN: 'fixture-token',
          OPENAI_API_KEY: '',
          OPENAI_MODEL: '',
          OPENAI_SEARCH_MODEL: '',
          OPENAI_REVIEW_MODEL: '',
        },
        stdio: 'pipe',
      },
    );
    const args = JSON.parse(await readFile(trace, 'utf8'));
    assert.ok(!args.includes('--env'));
    assert.equal(await readFile(output, 'utf8'), 'search_configured=false\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
