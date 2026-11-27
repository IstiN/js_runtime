// math-parity.js — engine parity oracle for the vendored three.js bundle.
// Runs AFTER the preload of libs/three/three.min.js in any engine:
//   Chromium: via Playwright (test/three/parity.test.js)
//   QuickJS:  build/host/qjs_harness --iid parity --preload libs/three/three.min.js --script fixtures/three/math-parity.js
// Computes the fixed parity set of js_runtime#4 (Matrix4 compose, decompose,
// invert, multiply; Vector3 and Quaternion transforms; Euler conversions;
// position checksums of BoxGeometry, SphereGeometry, TorusKnotGeometry;
// matrixWorld of a positioned and rotated Mesh) and prints ONE canonical
// JSON object (keys sorted, numbers rounded to 9 significant digits) through
// console.log, so both engines must produce identical parsed values.
if (typeof console === 'undefined') {
  // Bare QuickJS (qjs_harness) has no console; route it to sendMessage.
  globalThis.console = { log: function (message) { sendMessage('console.log', message); } };
}

function round(value) { return Number(value.toPrecision(9)); }
function roundAll(values) { return values.map(round); }
function checksum(array) { return round(array.reduce(function (a, v, i) { return a + v * (i + 1); }, 0)); }

// Not a node:test file: bare `node --test` discovers every .js under test/
// and runs this without the three.min.js preload; leave quietly there. The
// parity engines (qjs_harness --preload, Chromium) always preload first.
function main() {
  var results = {};

  var position = new THREE.Vector3(1.5, -2.25, 3.75);
  var quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.7, 1.1, 'XYZ'));
  var scale = new THREE.Vector3(2, 3, 4);
  var composed = new THREE.Matrix4().compose(position, quaternion, scale);
  results.matrix4Compose = roundAll(composed.elements);

  var outPosition = new THREE.Vector3();
  var outQuaternion = new THREE.Quaternion();
  var outScale = new THREE.Vector3();
  composed.decompose(outPosition, outQuaternion, outScale);
  results.matrix4Decompose = {
    position: roundAll(outPosition.toArray()),
    quaternion: roundAll(outQuaternion.toArray()),
    scale: roundAll(outScale.toArray())
  };

  results.matrix4Invert = roundAll(composed.clone().invert().elements);
  results.matrix4Multiply = roundAll(new THREE.Matrix4().multiplyMatrices(composed, new THREE.Matrix4().makeTranslation(1, 2, 3)).elements);

  results.eulerToQuaternion = roundAll(quaternion.toArray());
  var fromQuaternion = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  results.quaternionToEuler = [round(fromQuaternion.x), round(fromQuaternion.y), round(fromQuaternion.z), fromQuaternion.order];

  results.matrixOnVector = roundAll(new THREE.Vector3(1, 2, 3).applyMatrix4(composed).toArray());
  results.quaternionOnVector = roundAll(new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).toArray());

  var mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.position.set(3, 4, 5);
  mesh.rotation.set(0.2, 0.5, 0.8);
  mesh.updateMatrixWorld(true);
  results.meshMatrixWorld = roundAll(mesh.matrixWorld.elements);

  results.geometryChecksums = {
    boxGeometry: checksum(mesh.geometry.getAttribute('position').array),
    sphereGeometry: checksum(new THREE.SphereGeometry(1, 32, 16).getAttribute('position').array),
    torusKnotGeometry: checksum(new THREE.TorusKnotGeometry(1, 0.4, 64, 8).getAttribute('position').array)
  };

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object') {
      var sorted = {};
      Object.keys(value).sort().forEach(function (key) { sorted[key] = canonical(value[key]); });
      return sorted;
    }
    return value;
  }

  console.log(JSON.stringify(canonical(results)));
}

main();
