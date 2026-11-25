// Acceptance fixture of js_runtime#4: the scene graph builds in bare QuickJS.
//
// Engine script, run by qjs_harness (not node --test):
//   build/host/qjs_harness --iid t1 --call 'globalThis.THREE = undefined;' \
//     --preload libs/three/three.min.js --script fixtures/three/minimal.js
// The `globalThis.THREE = undefined` call proves the bundle itself creates
// the THREE global.
var scene = new THREE.Scene();
var mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
scene.add(mesh);
sendMessage('three-probe', JSON.stringify({
  sceneType: scene.type,
  children: scene.children.length,
  hasPosition: mesh.position instanceof THREE.Vector3,
  vertices: mesh.geometry.getAttribute('position').count
}));
