#!/usr/bin/env node
// extract_bootstrap.mjs — generates the two canonical bootstrap halves from
// the pinned kJsWidgetBootstrap (contract of the whole JSR family):
//   default                 write bootstrap-runtime.js (repository root)
//   --emit-widget <path>    write the widget half to <path>
//   --check                 regenerate in memory, exit 1 on drift with the
//                           committed bootstrap-runtime.js
// Split rule (plan 1.2): the runtime half is the explicit RUNTIME set —
// the top-level statements listed in RUNTIME_STATEMENTS plus `var jsr`
// filtered to RUNTIME_MEMBERS; everything else is the widget half in
// reference order (the 19 widget members inside Object.assign(jsr, {...})
// plus widget-only statements such as __jsrHostEvent). Statement text is
// copied verbatim; the only structural change is the split of the one `jsr`
// literal. Named overrides in tool/bootstrap-overrides/<target>.js replace a
// top-level statement (`<name>.js`) or a jsr member (`jsr.<member>.js`) —
// used to restructure functions for the CRAP gate without hand-editing the
// generated file. Every override is listed with its reason in
// docs/BOOTSTRAP.md.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function lockSha() {
  const line = readFileSync(join(root, 'conformance.lock'), 'utf8').trim();
  return line.match(/@([0-9a-f]{40})/)[1];
}

function referenceJs() {
  const dart = readFileSync(
    join(
      root,
      '.conformance',
      'flutter_js_widget_runtime',
      'lib',
      'src',
      'runtime',
      'js_widget_bootstrap.dart',
    ),
    'utf8',
  );
  const begin = dart.indexOf("= r'''") + "= r'''".length;
  const end = dart.indexOf("''';", begin);
  if (begin < "= r'''".length || end === -1) {
    throw new Error('kJsWidgetBootstrap raw string not found in the pinned dart file');
  }
  return dart.slice(begin, end); // up to the newline before the closing '''
}

const RUNTIME_STATEMENTS = new Set([
  '__cbs',
  '__iv_cbs',
  '__raf_cbs',
  '__jsrResolve',
  '__jsrInterval',
  '__jsrRaf',
  '__jsrWarmResolve',
  '__tag',
  '__send',
  '__idCounter',
  '__nid',
  '__joinArgs',
  '__timers',
  'console',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  '__jsrAudioTrackCounter',
  '__jsrAudioMaxSamples',
  '__jsrAudioMaxDuration',
  '__jsrAudioNumber',
  '__jsrAudioName',
  '__jsrAudioNoteFrequency',
  '__jsrAudioFilter',
  '__jsrAudioLfo',
  '__jsrAudioFm',
  '__jsrAudioEffects',
  '__jsrAudioEffectTailSeconds',
  '__jsrAudioApplyDelay',
  '__jsrAudioApplyReverb',
  '__jsrAudioApplyTrackEffects',
  '__jsrAudioBiquad',
  '__JsAudioSynth',
  '__jsrAudioEnvelope',
]);

const RUNTIME_MEMBERS = new Set([
  'audio',
  'fetchJson',
  'exec',
  'hostCall',
  'hostCallBinary',
  'b64encode',
  'capture',
  'storage',
  'exportState',
  'openUrl',
  'secrets',
  'loadAsset',
  'scene3d',
]);

function declaredName(stmt) {
  if (stmt.type === 'FunctionDeclaration' && stmt.id) return stmt.id.name;
  if (stmt.type === 'VariableDeclaration') {
    return stmt.declarations
      .filter((d) => d.id.type === 'Identifier')
      .map((d) => d.id.name)
      .join(','); // single-name statements only in the reference
  }
  return null;
}

function memberName(prop) {
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'Literal') return String(prop.key.value);
  return null;
}

// Splits the reference into the two halves. Returns raw text snippets.
function split(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest' });
  const statements = ast.body.map((stmt) => ({
    node: stmt,
    text: src.slice(stmt.start, stmt.end),
    start: stmt.start,
  }));

  // The performance shim is an if statement, matched by shape.
  const isPerformanceShim = (s) =>
    s.node.type === 'IfStatement' &&
    s.node.test.type === 'BinaryExpression' &&
    src.slice(s.node.test.start, s.node.test.end).includes('performance');

  const runtimeParts = [];
  const widgetParts = [];
  let jsrNode = null;

  for (const s of statements) {
    const name = declaredName(s.node);
    if (name === 'jsr' && s.node.type === 'VariableDeclaration') {
      jsrNode = s.node;
      continue;
    }
    if (
      RUNTIME_STATEMENTS.has(name) ||
      isPerformanceShim(s) ||
      (name && name.split(',').every((n) => RUNTIME_STATEMENTS.has(n))) ||
      s.text.startsWith('__JsAudioSynth.prototype.') // instance methods of the runtime audio synth
    ) {
      runtimeParts.push(s);
    } else {
      widgetParts.push(s);
    }
  }
  if (!jsrNode) throw new Error('var jsr literal not found in the reference');

  const obj = jsrNode.declarations[0].init;
  if (obj.type !== 'ObjectExpression') {
    throw new Error('jsr declaration is not an object literal');
  }
  const props = obj.properties.map((p, i) => ({
    node: p,
    name: memberName(p),
    text: src.slice(p.start, p.end),
    index: i,
  }));
  for (const p of props) {
    if (!p.name) throw new Error('jsr member with computed key found');
  }
  if (props.filter((p) => RUNTIME_MEMBERS.has(p.name)).length !== RUNTIME_MEMBERS.size) {
    throw new Error(
      `runtime member mismatch: found ${props.filter((p) => RUNTIME_MEMBERS.has(p.name)).map((p) => p.name).join(',')}`,
    );
  }

  return {
    runtime: runtimeParts,
    widget: widgetParts,
    props,
    jsrPosition: jsrNode.start,
  };
}

// Builds the two literal texts from the (possibly overridden) member texts.
function literals(props) {
  const literal = (list) => list.map((p) => p.text).join(',\n');
  return {
    runtimeJsr: `var jsr = {\n${literal(props.filter((p) => RUNTIME_MEMBERS.has(p.name)))}\n};`,
    widgetJsr: `Object.assign(jsr, {\n${literal(props.filter((p) => !RUNTIME_MEMBERS.has(p.name)))}\n});`,
  };
}

function loadOverrides() {
  const dir = join(root, 'tool', 'bootstrap-overrides');
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    return [];
  }
  return files.map((f) => ({ target: f.slice(0, -3), text: readFileSync(join(dir, f), 'utf8') }));
}

// Applies overrides to the raw statement/member snippets. An override file
// may carry a `// jsr-append-top-level` marker: text before it replaces the
// target, text after it is appended to the runtime half as new top-level
// statements (used when a restructured member needs new helper functions).
const APPEND_MARKER = '// jsr-append-top-level';

function splitOverrideText(text) {
  const idx = text.indexOf(APPEND_MARKER);
  if (idx === -1) return { body: text.trim(), extra: null };
  return { body: text.slice(0, idx).trim(), extra: text.slice(idx + APPEND_MARKER.length).trim() };
}

function appendRuntime(splitResult, extra) {
  splitResult.runtime.push({ node: null, text: extra, start: splitResult.jsrPosition });
}

// Applies overrides to the raw statement/member snippets.
function applyOverrides(splitResult, overrides) {
  for (const o of overrides) {
    const { body, extra } = splitOverrideText(o.text);
    if (o.target.startsWith('jsr.')) {
      // Member override: replaces one jsr member text (nested names like
      // jsr.storage.get are not supported; members are replaced whole).
      const member = o.target.slice(4);
      const p = splitResult.props.find((q) => q.name === member);
      if (!p) throw new Error(`override target jsr.${member} not found`);
      p.text = body;
    } else {
      const starts = (t, n) =>
        t.startsWith(`function ${n}`) ||
        t.startsWith(`var ${n}`) ||
        t.startsWith(`let ${n}`) ||
        t.startsWith(`const ${n}`) ||
        t.startsWith(`${n} =`);
      const i = splitResult.runtime.findIndex((p) => starts(p.text, o.target));
      if (i !== -1) {
        splitResult.runtime[i].text = body;
      } else {
        const w = splitResult.widget.findIndex((p) => starts(p.text, o.target));
        if (w === -1) throw new Error(`override target ${o.target} not found`);
        splitResult.widget[w].text = body;
      }
    }
    if (extra) appendRuntime(splitResult, extra);
  }
  return splitResult;
}


function header(kind) {
  return `// Generated from IstiN/flutter_js_widget_runtime@${lockSha()}:lib/src/runtime/js_widget_bootstrap.dart (${kind} half) by scripts/extract_bootstrap.mjs — do not edit.\n`;
}

function assemble(kind, parts, jsrText, jsrAt) {
  // Re-insert the (filtered) jsr literal at its reference position. The
  // widget half (scratch output for the js_widget_runtime lane) carries no
  // provenance header: its first line is Object.assign(jsr, {.
  const out = kind === 'widget' ? [] : [header(kind)];
  let inserted = false;
  for (const p of parts) {
    if (!inserted && p.start > jsrAt) {
      out.push(jsrText, '\n');
      inserted = true;
    }
    out.push(p.text, '\n');
  }
  if (!inserted) out.push(jsrText, '\n');
  return out.join('');
}

function generate() {
  const src = referenceJs();
  const splitResult = split(src);
  applyOverrides(splitResult, loadOverrides());
  const jsr = literals(splitResult.props);
  return {
    runtime: assemble('runtime', splitResult.runtime, jsr.runtimeJsr, splitResult.jsrPosition),
    widget: assemble('widget', splitResult.widget, jsr.widgetJsr, splitResult.jsrPosition),
  };
}

const args = process.argv.slice(2);
const emitWidgetIdx = args.indexOf('--emit-widget');
const check = args.includes('--check');
if (args.includes('--help') || emitWidgetIdx !== -1 && !args[emitWidgetIdx + 1]) {
  console.error('usage: extract_bootstrap.mjs [--emit-widget <path>] [--check]');
  process.exit(check ? 0 : 1);
}
const generated = generate();
if (check) {
  const committed = readFileSync(join(root, 'bootstrap-runtime.js'), 'utf8');
  if (committed !== generated.runtime) {
    console.error('bootstrap drift: committed bootstrap-runtime.js differs from the generated text (run scripts/extract_bootstrap.mjs)');
    process.exit(1);
  }
  console.log('bootstrap-runtime.js matches the generator output');
} else {
  writeFileSync(join(root, 'bootstrap-runtime.js'), generated.runtime);
  console.log(`wrote bootstrap-runtime.js (${generated.runtime.length} bytes)`);
}
if (emitWidgetIdx !== -1) {
  writeFileSync(args[emitWidgetIdx + 1], generated.widget);
  console.log(`wrote widget half (${generated.widget.length} bytes)`);
}
