// API group fixture: animation frames.
requestAnimationFrame(function frameA() {});
requestAnimationFrame(function frameB() {});
var f = requestAnimationFrame(function cancelledFrame() {});
cancelAnimationFrame(f);
