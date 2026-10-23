import { expect, it, vi } from 'vitest';
import { closeSnapshot, createSnapshotEmitter, generateHtml } from '../../../src/canvas/agent/html_pipeline/generate_html.js';
import { DESIGN_SYSTEM_PRESETS } from '../../../src/canvas/agent/design_system/from_style_kit.js';
it('closes nested tags, ignores void tags and withholds unfinished styles', () => {
  expect(closeSnapshot('<html><body><section><br><p>Hello')).toBe('<html><body><section><br><p>Hello</p></section></body></html>');
  expect(closeSnapshot('<html><head><style>body{')).toBeNull();
  expect(closeSnapshot('<body><div>Done<spa')).toBe('<body><div>Done</div></body>');
});
it('throttles snapshots to 300ms and always emits a final rewrite', () => {
  let time = 0; const callback = vi.fn(); const emitter = createSnapshotEmitter(callback, () => time);
  emitter.push('<body>A'); time = 299; emitter.push('<body>B'); expect(callback).toHaveBeenCalledTimes(1);
  time = 300; emitter.push('<body>C'); expect(callback).toHaveBeenCalledTimes(2);
  emitter.push('<body>Final', true); expect(callback).toHaveBeenLastCalledWith('<body>Final</body>', { final: true });
});
it.each(['cumulative', 'delta'])('accepts %s transport and emits final HTML', async mode => {
  const html = '<html><body><main>Finished</main></body></html>', onSnapshot = vi.fn();
  const streamStep = async ({ onText }) => { onText('<html><body>'); onText(mode === 'delta' ? '<main>Finished' : '<html><body><main>Finished'); return { text: html }; };
  const result = await generateHtml({ brief: 'page', frame: { width: 800, height: 600 }, direction: { designSystem: Object.values(DESIGN_SYSTEM_PRESETS)[0] }, streamStep, onSnapshot });
  expect(result.html).toBe(html); expect(onSnapshot).toHaveBeenLastCalledWith(html, { final: true });
});
