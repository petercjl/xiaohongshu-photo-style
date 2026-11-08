import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const tool = 'xiaohongshu-photo-style';
const entry = path.join(root, pkg.bin[tool]);
const invoke = (args, bin = entry) => JSON.parse(execFileSync(process.execPath, [bin, ...args, '--json'], { encoding: 'utf8' }));
const failure = (args, code, bin = entry) => {
  const result = spawnSync(process.execPath, [bin, ...args, '--json'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stderr).code, code);
};

test('package identity and all 12 visual references', () => {
  execFileSync(process.execPath, [path.join(root, 'src/identity.mjs')]);
  assert.equal(invoke(['version']).version, pkg.version);
  const source = invoke(['skill', 'source', '--skill', tool]);
  assert.equal(source.package, pkg.name);
  const cards = path.join(root, 'skills', tool, 'references', 'lettering-cards.md');
  const links = [...fs.readFileSync(cards, 'utf8').matchAll(/!\[[^\]]+\]\(([^)]+)\)/g)];
  assert.equal(new Set(links.map(m => m[1])).size, 12);
  for (const [, target] of links) {
    const bytes = fs.readFileSync(path.resolve(path.dirname(cards), target));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 600);
    assert.equal(bytes.readUInt32BE(20), 300);
  }
});

test('explicit host target, ownership, repeat sync, edit protection', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), tool + '-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const target = path.join(dir, tool);
  const flags = ['--agent', 'example-agent', '--skill-directory', target];
  failure(['skill', 'install', '--agent', 'example-agent'], 'TARGET_REQUIRED');
  assert.equal(invoke(['skill', 'status', ...flags]).installed, false);
  assert.equal(invoke(['skill', 'install', ...flags]).current, true);
  assert.equal(invoke(['skill', 'update', ...flags]).current, true);
  assert.equal(invoke(['version'], path.join(target, '.runtime', pkg.bin[tool])).version, pkg.version);
  fs.appendFileSync(path.join(target, 'SKILL.md'), '\nLocal edit\n');
  assert.notEqual(spawnSync(process.execPath, [entry, 'skill', 'update', ...flags, '--json']).status, 0);
  assert.match(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), /Local edit/);
});
