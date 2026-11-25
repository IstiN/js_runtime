// three-shim.js — optional canvas shim for hosts without `document`.
//
// Load AFTER libs/three/three.min.js. When a host registered
// globalThis.__jsrCreateCanvas(type) -> host context, renderer classes get a
// canvas from document.createElement('canvas'). Without a registered host the
// named error below is thrown. Pure-math three.js needs neither this shim nor
// a host; the boundary is documented in libs/three/docs/THREE.md.
(function () {
  'use strict';
  if (typeof document !== 'undefined') return;
  var UNSUPPORTED = 'three.unsupported: canvas backend not available';

  function getContext(type) {
    var create = globalThis.__jsrCreateCanvas;
    if (typeof create !== 'function') throw new Error(UNSUPPORTED);
    return create(type);
  }

  function createElement(tag) {
    if (tag !== 'canvas') throw new Error(UNSUPPORTED);
    return { width: 300, height: 150, getContext: getContext };
  }

  globalThis.document = {
    createElement: createElement,
    createElementNS: function (_ns, tag) { return createElement(tag); }
  };
})();
