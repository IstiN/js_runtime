// Shared helper for test/three: run the bare QuickJS harness built by
// `bash tool/build_all.sh host`.
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HARNESS = path.resolve(HERE, '../../build/host/qjs_harness');
export const BUNDLE = path.resolve(HERE, '../../libs/three/three.min.js');

export function harnessAvailable() {
  try {
    accessSync(HARNESS, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function runQjs(args) {
  const result = spawnSync(HARNESS, args, { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
