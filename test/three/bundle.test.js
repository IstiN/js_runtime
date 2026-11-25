import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.resolve(HERE, '../../libs/three/three.min.js');

test('three.min.js.sha256 matches the committed bundle', () => {
  const bundle = readFileSync(BUNDLE);
  const recorded = readFileSync(`${BUNDLE}.sha256`, 'utf8').trim();
  assert.ok(bundle.length > 0);
  assert.equal(createHash('sha256').update(bundle).digest('hex'), recorded);
});
