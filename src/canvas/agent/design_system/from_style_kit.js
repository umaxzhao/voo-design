import { STYLE_KITS } from '../design_quality/style_kits.js';
import { DESIGN_TOKENS, contrastRatio } from '../design_quality/tokens.js';
import { FONT_ROLES, validateDesignSystem } from './schema.js';

// Flatten translucent kit colors over their actual backdrop; v1 contract colors are opaque.
function opaque(color, backdrop) {
  if (color.startsWith('#')) return color;
  const [r,g,b,a = 1] = color.match(/[\d.]+/g).map(Number);
  const bg = backdrop.slice(1).match(/../g).map(x => parseInt(x,16));
  return '#' + [r,g,b].map((n,i) => Math.round(n*a + bg[i]*(1-a)).toString(16).padStart(2,'0')).join('');
}
export function fromStyleKit(kit) {
  if (typeof kit === 'string') kit = STYLE_KITS[kit];
  if (!kit) throw new Error('Unknown style kit');
  const p = kit.palette, surface = opaque(p.surface,p.bg);
  const ink = color => contrastRatio('#FFFFFF', color) >= contrastRatio('#000000',color) ? '#FFFFFF' : '#000000';
  const sizes = kit.typeScale;
  const roleSizes = [sizes.at(-1),sizes.at(-2),sizes.at(-3),sizes.at(-4),sizes.includes(16)?16:sizes[2],sizes[1],sizes[1],sizes[0]];
  const ds = { version:1, id:kit.id, name:kit.name, colorMode: contrastRatio('#FFFFFF',surface) > contrastRatio('#000000',surface) ? 'dark':'light',
    colors:{primary:p.accent,onPrimary:p.accentText,secondary:p.success,onSecondary:ink(p.success),tertiary:p.warning,onTertiary:ink(p.warning),neutral:p.textMuted.startsWith('#')?p.textMuted:opaque(p.textMuted,surface),surface,surfaceVariant:opaque(p.surfaceAlt,p.bg),onSurface:p.text,onSurfaceVariant:opaque(p.textMuted,surface),outline:opaque(p.border,surface),error:p.danger,onError:ink(p.danger),background:p.bg},
    typography:{fontHeadline:kit.fonts.display,fontBody:kit.fonts.body,fontLabel:kit.fonts.body,scale:Object.fromEntries(FONT_ROLES.map((role,i)=>[role,{fontSize:roleSizes[i],lineHeight:Math.ceil(roleSizes[i]*(i<3?1.2:1.5)),fontWeight:i<4?600:i<6?400:500,letterSpacing:0}]))},
    spacing:{unit:4,scale:[...DESIGN_TOKENS.spacing]},roundness:{none:0,...kit.radius},elevation:{sm:kit.shadow.sm.css,md:kit.shadow.md.css},
    components:{button:{radius:kit.radius.md,paddingX:16,paddingY:8,fontRole:'labelLg'},card:{radius:kit.radius.lg,padding:kit.spacingDensity==='dense'?12:24,elevation:'sm'},input:{radius:kit.radius.md,height:40,border:1},chip:{radius:kit.radius.full}},
    designMd:[kit.mood,`Layout: ${kit.layoutPatterns.join('; ')}`,`Do: ${kit.dos.join('; ')}`,`Avoid: ${kit.donts.join('; ')}`].join('\n').slice(0,4000)};
  const result = validateDesignSystem(ds);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.value;
}
export const DESIGN_SYSTEM_PRESETS = Object.fromEntries(Object.values(STYLE_KITS).map(kit => [kit.id, fromStyleKit(kit)]));
