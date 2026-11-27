// API group fixture: timers.
setTimeout(function onceA() {}, 250);
setTimeout(function onceDefault() {});
setInterval(function loopA() {}, 1000);
var t = setTimeout(function named() {}, 5);
clearTimeout(t);
var u = setInterval(function cancelled() {}, 10);
clearInterval(u);
