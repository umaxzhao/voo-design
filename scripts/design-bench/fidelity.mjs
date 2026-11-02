#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ready, browserOptions, awaitKill } from './runtime.mjs';
import { DESIGN_BENCH_TASKS } from './tasks.mjs';

const flockRequired = () => new Error('flock is required for fidelity (util-linux). Install it or run without the lock wrapper.');

// Keep the lock in a parent process, including when called as a library.
export async function fidelity(options) {
  const check = spawnSync('flock', ['--version']);
  if (check.error?.code === 'ENOENT') throw flockRequired();
  if (check.error) throw check.error;
  if (check.status !== 0) throw flockRequired();
  await mkdir(options.out, { recursive: true });
  const config = resolve(options.out, `.fidelity-${process.pid}.json`);
  await writeFile(config, JSON.stringify(options));
  try {
    await new Promise((done, reject) => {
      const child = spawn('flock', ['-w', process.env.VOO_FIDELITY_LOCK_TIMEOUT || '240', '/tmp/voo-e2e.lock', process.execPath, fileURLToPath(import.meta.url), '--worker', config], { stdio: 'inherit' });
      child.on('error', error => reject(error.code === 'ENOENT' ? flockRequired() : error)); child.on('exit', code => code === 0 ? done() : reject(new Error(code === 1 ? 'Fidelity failed (browser lock timeout or worker failure; see stderr)' : `Fidelity exited ${code}`)));
    });
  } finally { const { unlink } = await import('node:fs/promises'); await unlink(config); }
}
async function worker({ out, inputs, frame }) {
  const port = process.env.VOO_DESIGN_BENCH_VITE_PORT || '5199';
  const url = `http://127.0.0.1:${port}`;
  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.on('error', error => { vite.startError = error; });
  for (const pipe of [vite.stdout, vite.stderr]) pipe.on('data', chunk => process.stderr.write(chunk));
  let browser;
  try {
    await ready(url, vite);
    const { chromium } = await import('playwright'); browser = await chromium.launch(browserOptions);
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
    for (const input of inputs) {
      await page.goto(`${url}/?voo-test=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });

      const id = input.id; if (!/^[\w-]+$/.test(id)) throw new Error('Invalid id');
      const html = input.html ?? await readFile(input.file, 'utf8');
      const task = DESIGN_BENCH_TASKS.find(t => t.id === id);
      const size = input.frame || frame || (task && { width: task.frame.w, height: task.frame.h }) || { width: 480, height: 320 };
      await page.setViewportSize({ width: Math.max(1600, size.width), height: Math.max(1100, size.height) });
      const result = await page.evaluate(async ({ html, size }) => {
        const { HtmlRenderer } = await import('/src/canvas/agent/html_pipeline/render_html.js');
        const { htmlToNodes, elementKey } = await import('/src/canvas/agent/html_pipeline/html_to_nodes.js');
        const { CanvasStreamer } = await import('/src/canvas/agent/html_pipeline/incremental.js');
        const { createDocument } = await import('/src/canvas/editor/scene_model.js');
        const { layoutTextLines, textFont, textLineHeight } = await import('/src/canvas/editor/text_metrics.js');
        const renderer = new HtmlRenderer(); const doc = await renderer.render(html, size);
        const rect = r => ({ x: r.x, y: r.y, width: r.width, height: r.height });
        const props = ['display', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap', 'boxSizing', 'outlineWidth', 'outlineColor', 'outlineStyle', 'lineHeight', 'fontSize', 'fontFamily', 'fontWeight', 'flexWrap', 'flexDirection', 'alignItems', 'justifyContent', 'textAlign', 'whiteSpace'];
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) for (const p of ['Width', 'Color', 'Style']) props.push(`border${side}${p}`);
        const dom = [...doc.body.querySelectorAll('*'), doc.body].filter(el => !['STYLE','SCRIPT'].includes(el.tagName)).map(el => {
          const css = doc.defaultView.getComputedStyle(el), key = elementKey(el);
          el.setAttribute('data-voo-src', key);
          const texts = [...el.childNodes].flatMap((child, index) => {
            if (child.nodeType !== 3 || !child.textContent.trim()) return [];
            const range = doc.createRange(); range.selectNodeContents(child);
            const ctx = doc.createElement('canvas').getContext('2d'); ctx.font = css.font;
            const m = ctx.measureText('M'); const rs = [...range.getClientRects()].map(rect);
            const glyphRect = rect(range.getBoundingClientRect());
            const lineHeight = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.2;
            const first = rs[0] || glyphRect;
            let block = el;
            while (doc.defaultView.getComputedStyle(block).display === 'inline' && block.parentElement) block = block.parentElement;
            const bc = doc.defaultView.getComputedStyle(block), br = block.getBoundingClientRect();
            const px = value => parseFloat(value) || 0;
            const count = new Set(rs.map(r => Math.round(r.y))).size || 1;
            const lineBox = { ...glyphRect, y: first.y - (lineHeight - first.height) / 2, height: count * lineHeight };
            if (count > 1) Object.assign(lineBox, { x: br.x + px(bc.borderLeftWidth) + px(bc.paddingLeft), width: br.width - px(bc.borderLeftWidth) - px(bc.borderRightWidth) - px(bc.paddingLeft) - px(bc.paddingRight) });
            return [{ key: `${key}/text:${index}`, rect: glyphRect, lineBox, rects: rs,
              baseline: rs[0]?.y + (m.fontBoundingBoxAscent ?? parseFloat(css.fontSize) * .8), text: child.textContent }];
          });
          return { key, selector: `[data-voo-src=${JSON.stringify(key)}]`, parent: el.parentElement && elementKey(el.parentElement), rect: rect(el.getBoundingClientRect()), styles: Object.fromEntries(props.map(p => [p, css[p]])), texts };
        });
        const converted = htmlToNodes(doc, size);
        // Screenshot this exact measured DOM; visibility was only an iframe positioning detail.
        renderer.iframe.style.cssText = `position:fixed;left:0;top:0;border:0;width:${size.width}px;height:${size.height}px;z-index:2147483647;background:white`;
        window.__fidelityRenderer = renderer;
        const editor = window.__vooEditor; editor.updateDocument(createDocument(size.width, size.height));
        const streamer = new CanvasStreamer({ editor, frame: size, renderer }); streamer.start(); streamer.apply(converted);
        const beforeFinish = JSON.parse(JSON.stringify(editor.getDocument()));
        // Retain screenshot DOM until the host takes its screenshot.
        streamer.renderer = { dispose() {} }; streamer.finish();
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 1500)); // Match recapture's app settlement window.
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const loaded = JSON.parse(JSON.stringify(editor.getDocument()));
        const textMetrics = loaded.nodes.filter(n => n.kind === 'text' || n.type === 'text').map(n => {
          const ctx = document.createElement('canvas').getContext('2d'); ctx.font = textFont(n); const m = ctx.measureText('M');
          return { key: n.htmlKey, lines: layoutTextLines(ctx, n), baseline: n.y + (textLineHeight(n) - ((m.fontBoundingBoxAscent ?? n.fontSize*.8) + (m.fontBoundingBoxDescent ?? n.fontSize*.2)))/2 + (m.fontBoundingBoxAscent ?? n.fontSize*.8), lineHeight: textLineHeight(n) };
        });
        return { dom, converted, beforeFinish, loaded, textMetrics };
      }, { html, size });
      await page.screenshot({ path: resolve(out, `${id}.html.png`), clip: { x: 0, y: 0, width: size.width, height: size.height } });
      const png = await page.evaluate(async size => {
        window.__fidelityRenderer.dispose();
        const { executeCanvasTool } = await import('/src/canvas/agent/canvas_tools.js');
        const captured = await executeCanvasTool('capture_canvas', { maxSize: Math.max(size.width, size.height) });
        if (!captured.ok || !captured.dataUrl) throw Error('Canvas capture returned no PNG');
        return captured.dataUrl;
      }, size);
      await writeFile(resolve(out, `${id}.canvas.png`), Buffer.from(png.split(',')[1], 'base64'));
      const a = await readFile(resolve(out, `${id}.html.png`));
      const pixels = await page.evaluate(async ({ a, b, size }) => {
        const load = src => new Promise((ok, fail) => { const img = new Image(); img.onload = () => ok(img); img.onerror = fail; img.src = src; });
        const [imA, imB] = await Promise.all([load(a),load(b)]);
        const make = (w,h) => { const c = document.createElement('canvas'); c.width=w;c.height=h;return c; };
        const left=make(size.width,size.height),right=make(size.width,size.height),diff=make(size.width,size.height),sbs=make(size.width*2,size.height);
        left.getContext('2d').drawImage(imA,0,0);right.getContext('2d').drawImage(imB,0,0);
        const x=left.getContext('2d').getImageData(0,0,size.width,size.height),y=right.getContext('2d').getImageData(0,0,size.width,size.height),d=diff.getContext('2d').createImageData(size.width,size.height);
        let changed=0; for(let i=0;i<x.data.length;i+=4){const delta=Math.max(...[0,1,2,3].map(k=>Math.abs(x.data[i+k]-y.data[i+k])));if(delta>16)changed++;d.data[i]=delta>16?255:Math.round(x.data[i]*.25);d.data[i+1]=delta>16?0:Math.round(x.data[i+1]*.25);d.data[i+2]=delta>16?100:Math.round(x.data[i+2]*.25);d.data[i+3]=255;}
        diff.getContext('2d').putImageData(d,0,0);sbs.getContext('2d').drawImage(left,0,0);sbs.getContext('2d').drawImage(right,size.width,0);
        return { changed, total:size.width*size.height, canvasSize:{width:imB.width,height:imB.height}, diff:diff.toDataURL(),sbs:sbs.toDataURL() };
      }, { a:`data:image/png;base64,${a.toString('base64')}`,b:png,size });
      for(const ext of ['diff','sbs']) { await writeFile(resolve(out,`${id}.${ext}.png`),Buffer.from(pixels[ext].split(',')[1],'base64'));delete pixels[ext]; }
      const mismatches = compare(result);
      await writeFile(resolve(out,`${id}.diff.json`),JSON.stringify({id,frame:size,threshold:1,pixels,mismatches,...result},null,2)+'\n');
      console.log(`${id}: ${mismatches.length} mismatches; ${pixels.changed}/${pixels.total} pixels`);
    }
  } finally {
    try { await browser?.close(); } finally { await awaitKill(vite); }
  }
}

export function compare({dom,converted,loaded,textMetrics}) {
  const mismatches=[]; const get=k=>loaded.nodes.find(n=>n.htmlKey===k), raw=k=>converted.find(n=>n.htmlKey===k);
  const add=(key,property,expected,actual,cause,evidence)=>mismatches.push({key,property,expected,actual,cause,evidence});
  const check=(key,p,e,a,c,evidence)=>{if(Number.isFinite(e)&&Number.isFinite(a)&&Math.abs(e-a)>1)add(key,p,e,a,c,evidence);};
  const geometry=(key,r)=>{const n=get(key),v=raw(key);if(v&&!n)add(key,'missingNode','present',null,'html_to_nodes mapping','Converted node absent from loaded app document');if(!n||!v)return;for(const p of ['x','y','width','height']){check(key,`conversion.${p}`,r[p],v[p],'html_to_nodes mapping','DOM versus converter, before app creation');check(key,`loaded.${p}`,v[p],n[p],loaded.nodes.some(f=>f.id===n.parentId && f.autoLayout?.direction && f.autoLayout.direction!=='none')?'auto-layout engine':'renderer','Converter versus loaded node; inspect parent layout in loaded document');}};
  for(const el of dom){
    geometry(el.key,el.rect);const n=get(el.key);
    const sides=['Top','Right','Bottom','Left'];
    const color = value => { const m = value?.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? '#' + m.slice(1).map(v=>Number(v).toString(16).padStart(2,'0')).join('') : value?.toLowerCase(); };
    if(n && n.strokeWidth>0 && (n.strokeAlign??'inside')!=='inside')add(el.key,'strokeAlign','inside',n.strokeAlign,'renderer','CSS borders occupy inside of border box');
    for(const [i,side] of sides.entries()) {const expected=parseFloat(el.styles[`border${side}Width`])||0;const sideNode=get(`${el.key}/border:${i}`);const actual=sideNode?(i%2?sideNode.width:sideNode.height):n?.strokeWidth||0;check(el.key,`border${side}Width`,expected,actual,'html_to_nodes mapping','Uniform stroke or separate side rectangle');if(expected>0){const expectedColor=color(el.styles[`border${side}Color`]),actualColor=color(sideNode?.fill ?? n?.stroke);if(expectedColor!==actualColor)add(el.key,`border${side}Color`,expectedColor,actualColor??null,'html_to_nodes mapping','Computed CSS color versus side fill or uniform stroke');}}
    if(el.styles.outlineStyle !== 'none' && el.styles.outlineStyle !== 'hidden' && parseFloat(el.styles.outlineWidth)>0)add(el.key,'outline',el.styles.outlineWidth,null,'html_to_nodes mapping','Converter does not emit outlines');
    for(const t of el.texts){geometry(t.key,t.lineBox || t.rect);const tn=get(t.key),tm=textMetrics.find(m=>m.key===t.key);if(!tn||!tm)continue;check(t.key,'lineHeight',parseFloat(el.styles.lineHeight),tm.lineHeight,'html_to_nodes mapping','CSS px versus node fontSize × lineHeight');check(t.key,'baseline',t.baseline,tm.baseline,Math.abs((raw(t.key)?.y??0)-(t.lineBox || t.rect).y)>1?'html_to_nodes mapping':'renderer','DOM Range top + font ascent versus renderer baselineOffset formula');const count=new Set(t.rects.map(r=>Math.round(r.y))).size;if(count!==tm.lines.length)add(t.key,'wrap',count,tm.lines.length,'html_to_nodes mapping','DOM Range lines versus real layoutTextLines');}
    // Gap/padding are baked into absolute geometry. Compare measured offsets, not absent native layout props.
    const children=dom.filter(c=>c.parent===el.key&&get(c.key));
    for(let i=1;i<children.length;i++){const a=children[i-1],b=children[i],na=get(a.key),nb=get(b.key);const vertical=el.styles.flexDirection==='column';const axis=vertical?'y':'x',dim=vertical?'height':'width';check(el.key,`gap.${i}`,b.rect[axis]-a.rect[axis]-a.rect[dim],nb[axis]-na[axis]-na[dim],'html_to_nodes mapping','Observed sibling separation including alignment/wrap');}
    for(const c of children){const cn=get(c.key);for(const [side,axis,dim,end] of [['Left','x','width',false],['Top','y','height',false],['Right','x','width',true],['Bottom','y','height',true]]){const offset=(r,p)=>end?p[axis]+p[dim]-r[axis]-r[dim]:r[axis]-p[axis];if(n)check(c.key,`padding-offset.${side}`,offset(c.rect,el.rect),offset(cn,n),'html_to_nodes mapping','Content offset includes border, padding and alignment');}}
  }
  return mismatches;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(args[0]==='--worker') await worker(JSON.parse(await readFile(args[1],'utf8')));
  else {
    const opts={out:'/tmp/quality-real/fidelity/before',inputs:[]};let fixtureDir;
    for(const arg of args){const [k,...v]=arg.split('=');const value=v.join('=');if(k==='--out')opts.out=resolve(value);else if(k==='--fixtures')fixtureDir=value;else if(k==='--file')opts.inputs.push({file:resolve(value),id:basename(value,'.html')});else if(k==='--html')opts.inputs.push({html:value,id:'inline'});else if(k==='--frame'){const [width,height]=value.split('x').map(Number);if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)throw Error('Invalid frame');opts.frame={width,height};}else throw Error(`Unknown argument ${arg}`);}
    if(fixtureDir)for(const file of (await readdir(fixtureDir)).filter(f=>f.endsWith('.html')).sort())opts.inputs.push({file:resolve(fixtureDir,file),id:basename(file,'.html')});
    if(!opts.inputs.length)throw Error('Use --file=FILE, --html=STRING or --fixtures=DIR; optional --frame=WIDTHxHEIGHT, --out=DIR. Known task filenames use task frame dimensions.');
    await fidelity(opts);
  }
}
