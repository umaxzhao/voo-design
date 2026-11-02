// Static product-state mock, driven by the production context resolver.
// Run under flock /tmp/voo-e2e.lock. PLAYWRIGHT_MODULE can point at a shared install.
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolvePanelForContext, PROPERTY_SECTIONS } from '../src/canvas/components/editor_properties/resolve_panel_context.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = '/workspace/tmp/shots-props-by-type';
const mirror = '/workspace/shots-props-by-type';
await mkdir(out, { recursive: true }); await mkdir(mirror, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1080 }, deviceScaleFactor: 1 });
const labels = { alignment:'对齐　⇤　↔　⇥　⇡　↕　⇣', transform:'位置与尺寸', constraints:'约束', layoutChild:'自动布局子项', layer:'图层', radius:'圆角', fill:'填充', stroke:'描边', effects:'效果', export:'导出', clip:'裁剪内容', autoLayout:'自动布局', layoutGrid:'布局网格', typography:'文字', component:'组件', arc:'弧线' };
const fields = { transform:'X　120　　 Y　80<br>W　320　　 H　200　♧<br>旋转　0°　　翻转　↔　↕', constraints:'水平　左　　垂直　上', layoutChild:'宽度　固定　　高度　固定', layer:'不透明度　100%<br>混合模式　正常', radius:'半径　8　　四角　8 / 8 / 8 / 8', fill:'■　#D4D4D4　　100%', stroke:'■　#737373　　1 px　内部', effects:'＋　添加效果', export:'1×　PNG　　导出', clip:'☑　裁剪内容', autoLayout:'＋　添加自动布局', layoutGrid:'☐　显示网格　　8 px', typography:'Inter　Regular　16<br>行高　自动　　字距　0', component:'主组件　　变体', arc:'起始角度　0°<br>扫过角度　360°　　内半径　0' };
for (const type of ['rectangle','frame','text','image','vector','group','component','ellipse','line','shape-tool-no-selection']) {
  const empty = type === 'shape-tool-no-selection';
  const context = resolvePanelForContext({ tool:'rect', selection:empty ? [] : [{kind:type}] });
  const sections = context.sections.filter(s => s !== 'layoutChild'); // fixture has no auto-layout parent
  const body = empty ? '<section><h3>形状</h3><div class="wheel"></div><p>填充　■　#D4D4D4</p><p>描边　1　2　4　8 px</p></section>' : sections.map(s => `<section><h3>${labels[s] || s}</h3><p>${fields[s] || '＋'}</p></section>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#303030;color:#d4d4d4;font:12px Arial,sans-serif}header{height:48px;background:#151515;padding:16px}header span{float:right}main{position:absolute;left:190px;top:240px;width:450px;height:300px;background:#d4d4d4;border:1px solid #fff;color:#333;display:grid;place-items:center;font-size:32px}aside{position:absolute;right:24px;top:86px;width:280px;background:#101010;border-radius:20px;padding:16px}h2{font-size:13px;margin:0 0 12px}h3{font-size:11px;font-weight:500;color:#aaa;margin:0 0 9px}section{border-top:1px solid #333;padding:11px 0 3px}p{line-height:25px;margin:0;background:#222;border-radius:7px;padding:4px 8px}.toolbar{position:absolute;top:60px;left:160px;background:#111;padding:14px;border-radius:8px}.note{position:absolute;bottom:20px;left:24px;color:#aaa}.wheel{margin:12px auto;width:150px;height:150px;border-radius:50%;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);mask:radial-gradient(transparent 50%,#000 51%)}</style><header>VOO<span>Open　 Save　 Settings</span></header>${context.topBar ? '<div class="toolbar">图像　　裁切　　替换图像　　调整　　适合 / 填满</div>' : ''}<main>${type}</main><aside><h2>${empty ? '形状' : '属性'}</h2>${body}</aside><div class="note">Static HTML product-state mock · ${type} · resolver: ${context.panel} · UI=Figma / image=Affinity top bar</div>`;
  await writeFile(`${out}/${type}.html`,html);
  await page.setContent(html); await page.screenshot({ path:`${out}/${type}.png`, fullPage:true });
  await copyFile(`${out}/${type}.png`,`${mirror}/${type}.png`);
}
await browser.close();
console.log('Saved ten static panel-state mocks to both screenshot directories.');
