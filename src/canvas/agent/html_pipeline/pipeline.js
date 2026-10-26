import { runAntiAiChecks } from './anti_ai_checks.js';
import { configuredImageGenerator } from './images.js';
import { createDirections, pickDirection } from './directions.js';
import { generateHtml } from './generate_html.js';
import { CanvasStreamer } from './incremental.js';
import { critiqueHtml, repairHtml } from './critique.js';
import { setActiveDesignSystem } from '../design_system/store.js';
import { fromStyleKit } from '../design_system/from_style_kit.js';
import { STYLE_KITS } from '../design_quality/style_kits.js';
export async function runHtmlPipeline({ brief, frame, styleKitId = null, editor, streamStep, config, signal = new AbortController().signal, onProgress, chooseDirection }) {
  const progress = (stage, status) => onProgress?.({ stage, status });
  const trace = [];
  let stage = 'directions', streamer;
  try {
    progress(stage, 'in_progress');
    const result = await createDirections({ brief, streamStep, config, signal }); trace.push(...result.trace);
    progress(stage, 'completed');
    stage = 'selection'; progress(stage, 'in_progress');
    const choice = chooseDirection ? await chooseDirection(result.value, { signal }) : 'auto';
    signal?.throwIfAborted();
    let direction = pickDirection(result.value, choice);
    if (styleKitId && STYLE_KITS[styleKitId]) {
      // The user explicitly picked a style kit on the welcome screen: it wins
      // over the art-direction model's own palette so the preview matches the
      // choice. Layout/mood text from the direction is kept.
      const kit = STYLE_KITS[styleKitId];
      direction = { ...direction, name: kit.name, mood: kit.mood, designSystem: fromStyleKit(kit) };
    }
    progress(stage, 'completed');
    streamer = new CanvasStreamer({ editor, frame, signal }); streamer.start();
    setActiveDesignSystem(editor, direction.designSystem);
    stage = 'generation'; progress(stage, 'in_progress');
    const generated = await generateHtml({ brief, frame, direction, streamStep, config, signal, onSnapshot: html => { streamer.snapshot(html); } });
    trace.push(...generated.trace);
    await streamer.flush(); progress(stage, 'completed');
    stage = 'critique'; progress(stage, 'in_progress');
    let reviewed = await critiqueHtml({ editor, frameId: streamer.frameId, frame, brief, html: generated.html, streamStep, config, signal });
    let checks = runAntiAiChecks({ html: reviewed.html, frame });
    trace.push(...reviewed.trace);
    if (checks.hardFail) {
      trace.push({ stage: 'anti_ai_checks', ...checks });
      progress(stage, 'completed');
      stage = 'repair'; progress(stage, 'in_progress');
      const repaired = await repairHtml({ brief, html: reviewed.html, issues: checks.issues, streamStep, config, signal });
      reviewed = { ...repaired, repaired: true };
      trace.push(...repaired.trace);
      checks = runAntiAiChecks({ html: reviewed.html, frame });
    }
    trace.push({ stage: 'anti_ai_checks', ...checks });
    await globalThis.__vooBenchSourceHtml?.(reviewed.html);
    if (checks.hardFail) throw new Error('Design contains decorative icons: ' + checks.issues.filter(i => i.hard).map(i => i.problem).join('; '));
    if (stage === 'critique') progress(stage, 'completed');
    if (reviewed.repaired) {
      if (stage !== 'repair') { stage = 'repair'; progress(stage, 'in_progress'); }
      await streamer.snapshot(reviewed.html); await streamer.flush(); progress(stage, 'completed');
    }
    // Optional injected image provider must honor AbortSignal and return native
    // image fill properties. The normal offline and benchmark path skips it.
    const imageGenerator = (!globalThis.__VOO_DESIGN_BENCH__ || globalThis.__VOO_DESIGN_BENCH_IMAGES__) && (config?.htmlImageGenerator ?? configuredImageGenerator());
    if (imageGenerator) {
      stage = 'images'; progress(stage, 'in_progress');
      const controller = new AbortController();
      const abort = () => controller.abort(); signal?.throwIfAborted(); signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 20000);
      try {
        const slots = [...streamer.previous.values()].filter(v => v.node.imagePrompt).slice(0, 4);
        await Promise.race([Promise.all(slots.map(async slot => {
          try { const fill = await imageGenerator({ prompt: slot.node.imagePrompt, signal: controller.signal }); if (!controller.signal.aborted && fill) editor.updateNode(slot.id, fill); }
          catch (error) { trace.push({ stage: 'images', errors: [error.message] }); }
        })), new Promise(resolve => controller.signal.addEventListener('abort', resolve, { once: true }))]);
      } finally { clearTimeout(timeout); controller.abort(); signal?.removeEventListener('abort', abort); }
      signal?.throwIfAborted(); progress(stage, 'completed');
    }
    return { html: reviewed.html, directionId: direction.id, frameId: streamer.frameId ?? null, nodeCount: streamer.previous.size, verbosityPenalty: checks.verbosityPenalty, trace };
  } catch (error) { progress(stage, signal?.aborted ? 'cancelled' : 'failed'); throw error; }
  finally { if (streamer) { try { await streamer.flush(); } finally { streamer.finish(); } } }
}
const CREATION_VERB = /\b(?:create|build|design|generate|make)\b|(?:生成|创建|设计|制作|搭建|构建|绘制|做|来一[张个套份])/i;
const CREATION_NOUN = /\b(?:canvas|ui|layout|form|card|screen|page|website|dashboard|landing|app|interface|poster|modal|home|hero)\b|(?:页面|界面|落地页|首页|官网|网站|看板|仪表盘|大屏|应用|app|海报|移动端|幻灯片|演示文稿|演示|详情页|卡片|表单|导航页|作品集)/i;
const EDIT_INTENT = /\b(?:edit|refine|fix|update|existing)\b|(?:修改|调整|修复|更新|编辑|修改一下|现有|已有)/i;

export function shouldUseHtmlPipeline({ editor, userText, enabled = true }) {
  if (!enabled || !editor || typeof globalThis.document?.createElement !== 'function') return false;
  const doc = editor.getDocument?.() ?? editor.getDoc?.();
  if (!doc || !Array.isArray(doc.nodes) || doc.nodes.length !== 0) return false;
  const text = String(userText ?? '');
  return CREATION_VERB.test(text) && CREATION_NOUN.test(text) && !EDIT_INTENT.test(text);
}
