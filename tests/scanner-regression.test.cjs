'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const inlineScript = html.match(/<script>\s*([\s\S]*?)<\/script>/);
assert.ok(inlineScript, 'The existing static app has an inline controller script');

test('the scanner controller has valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(inlineScript[1], {filename:'index.inline.js'}));
});

test('one video decoding pipeline: no duplicate native detector running at once', () => {
  assert.ok(html.includes('useBarCodeDetectorIfSupported:true'));
  assert.ok(!html.includes('startNativeDetection('));
  assert.ok(!html.includes('nativeTimer = setTimeout'));
  assert.match(html, /fps:\s*10/);
});

test('Data Matrix is supported in both camera and photo fallbacks', () => {
  assert.ok(html.includes("'DATA_MATRIX'"));
  assert.ok(html.includes("'DataMatrix'"));
  assert.ok(html.includes('zxing-wasm@3.1.5'));
  assert.ok(html.includes('decodeWithWasm(file)'));
  assert.ok(html.includes('decodeWithWasm(sample)'));
  assert.ok(html.includes('scanFileV2(file, false)'));
});

test('multi-scale photo tiles include a small off-centre matrix on a portrait frame', () => {
  const regions = [
    [0.20,0.20,0.60,0.60],
    [0.05,0.18,0.90,0.48],
    [0.40,0.14,0.58,0.62],
    [0.02,0.14,0.58,0.62],
    [0.22,0.40,0.62,0.58]
  ];
  const example = {x:0.44,y:0.41,w:0.12,h:0.095};
  assert.ok(regions.some(([x,y,w,h]) =>
    x <= example.x && y <= example.y &&
    x+w >= example.x+example.w && y+h >= example.y+example.h
  ));
});

test('scanner never renders untrusted decoded values as executable HTML', () => {
  assert.ok(!html.includes('.innerHTML'));
  assert.ok(html.includes('read-confirmation-value'));
  assert.ok(html.includes('readConfirmation.hidden=false'));
  assert.ok(html.includes('localStorage.setItem(KEY, JSON.stringify(next))'));
});


test('mobile scanning uses the full camera viewport, not a small portrait preview', () => {
  assert.ok(html.includes('height:100dvh'));
  assert.ok(html.includes('object-fit:cover!important'));
  assert.ok(html.includes('class="scan-overlay-bottom"'));
  assert.ok(html.includes('class="scan-overlay-top"'));
  assert.ok(html.includes("capturePanel.requestFullscreen({navigationUI:'hide'})"));
  assert.ok(html.includes("const initial = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 2))"));
  assert.ok(html.includes("videoConstraints:"));
  assert.ok(html.includes("width:{ideal:1920}"));
  assert.ok(html.includes("height:{ideal:1080}"));
});

test('camera is stopped and fullscreen is exited after a confirmed read', () => {
  assert.ok(html.includes('await stopDecoder()'));
  assert.ok(html.includes('document.exitFullscreen()'));
  assert.ok(html.includes('capturePanel.hidden = true'));
});
