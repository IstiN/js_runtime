// API group fixture: promise-backed host services (no resolution here —
// the host resolves through the __jsr* globals, which the runners drive).
jsr.fetchJson('http://127.0.0.1:1/api', { method: 'post', headers: { a: 'b' } });
jsr.fetchJson('http://127.0.0.1:1/api2');
jsr.exec('ls -l');
jsr.openUrl('https://example.com');
jsr.hostCall('asr.record', { lang: 'en' });
jsr.hostCall('args.default');
jsr.capture({ format: 'png' });
jsr.capture();
jsr.loadAsset('fixtures/data.json');
jsr.storage.get('theme');
jsr.storage.set('theme', 'dark');
jsr.secrets.get('token');
jsr.secrets.set('token', 's3cret');
jsr.secrets.delete('token');
jsr.exportState({ count: 1 });
jsr.scene3d.create('s1', { fov: 60 });
jsr.scene3d.addModel('s1', { id: 'm1' });
jsr.scene3d.setTransform('s1', 'm1', { position: [1, 2, 3] });
jsr.scene3d.setTransforms('s1', [{ modelId: 'm1', rotation: [0, 1, 0] }]);
jsr.scene3d.playAnimation('s1', 'm1', { name: 'walk', loop: true });
jsr.scene3d.stopAnimation('s1', 'm1');
jsr.scene3d.setCamera('s1', { position: [0, 0, 5] });
jsr.scene3d.setLight('s1', { intensity: 2 });
jsr.scene3d.removeModel('s1', 'm1');
jsr.scene3d.destroy('s1');
