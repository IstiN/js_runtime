// build.mjs — reproducible three.js bundle for JSR.
//
//   node libs/three/build.mjs --source <three.js checkout>
//   node libs/three/build.mjs --source <three.js checkout> --verify
//
// Builds an esbuild IIFE bundle with the global THREE (target es2020,
// minified, entry src/Three.js of the checkout pinned in source-pin.json)
// and writes three.min.js plus three.min.js.sha256 (SHA-256 over the bundle
// bytes). Same input gives the same bytes. --verify rebuilds and exits 1
// when the committed bundle or hash file differs from the clean rebuild.
// The checkout is scratch (see docs/THREE.md); this script never edits the
// generated bundle by hand — compatibility patches live in POLYFILLS below.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIN = JSON.parse(await readFile(path.join(HERE, 'source-pin.json'), 'utf8'));
const BUNDLE = path.join(HERE, 'three.min.js');

const args = process.argv.slice(2);
const sourceArg = args.indexOf('--source');
const SOURCE = path.resolve(sourceArg >= 0 ? args[sourceArg + 1] : process.env.THREE_SRC || '/tmp/jsr-three-r186');
const verify = args.includes('--verify');

// Polyfills for built-ins that three.js r186 uses and QuickJS 2024-01-13
// lacks. Kept to the smallest set proven necessary by running the minimal
// fixture in build/host/qjs_harness; each entry covers one named missing
// built-in and is documented in docs/THREE.md.
const POLYFILLS = '';

const result = await build({
  entryPoints: [path.join(SOURCE, 'src/Three.js')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'THREE',
  platform: 'neutral',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  define: { __THREE_DEVTOOLS__: 'undefined' },
  banner: POLYFILLS ? { js: POLYFILLS } : undefined,
});
if (result.outputFiles.length !== 1) throw new Error('Unexpected esbuild outputs');
const bytes = Buffer.from(result.outputFiles[0].contents);
const hash = createHash('sha256').update(bytes).digest('hex');

if (verify) {
  const committed = await readFile(BUNDLE);
  const recorded = (await readFile(`${BUNDLE}.sha256`, 'utf8')).trim();
  if (!committed.equals(bytes)) {
    console.error(`FAIL three.min.js differs from the clean pinned rebuild of ${PIN.commit}`);
    process.exit(1);
  }
  if (recorded !== hash) {
    console.error('FAIL three.min.js.sha256 does not match three.min.js');
    process.exit(1);
  }
  console.log(`OK ${PIN.commit} ${hash}`);
} else {
  await writeFile(BUNDLE, bytes);
  await writeFile(`${BUNDLE}.sha256`, `${hash}\n`);
  console.log(`OK ${PIN.commit} ${hash} (${bytes.length} bytes)`);
}
