// Lucide icon data from the installed ISC-licensed lucide-react package.
import { __iconData as icon0 } from 'lucide-react/dist/esm/icons/search.mjs';
import { __iconData as icon1 } from 'lucide-react/dist/esm/icons/menu.mjs';
import { __iconData as icon2 } from 'lucide-react/dist/esm/icons/x.mjs';
import { __iconData as icon3 } from 'lucide-react/dist/esm/icons/check.mjs';
import { __iconData as icon4 } from 'lucide-react/dist/esm/icons/plus.mjs';
import { __iconData as icon5 } from 'lucide-react/dist/esm/icons/minus.mjs';
import { __iconData as icon6 } from 'lucide-react/dist/esm/icons/arrow-left.mjs';
import { __iconData as icon7 } from 'lucide-react/dist/esm/icons/arrow-right.mjs';
import { __iconData as icon8 } from 'lucide-react/dist/esm/icons/arrow-up.mjs';
import { __iconData as icon9 } from 'lucide-react/dist/esm/icons/arrow-down.mjs';
import { __iconData as icon10 } from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import { __iconData as icon11 } from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import { __iconData as icon12 } from 'lucide-react/dist/esm/icons/chevron-up.mjs';
import { __iconData as icon13 } from 'lucide-react/dist/esm/icons/chevron-down.mjs';
import { __iconData as icon14 } from 'lucide-react/dist/esm/icons/house.mjs';
import { __iconData as icon15 } from 'lucide-react/dist/esm/icons/settings.mjs';
import { __iconData as icon16 } from 'lucide-react/dist/esm/icons/user.mjs';
import { __iconData as icon17 } from 'lucide-react/dist/esm/icons/users.mjs';
import { __iconData as icon18 } from 'lucide-react/dist/esm/icons/bell.mjs';
import { __iconData as icon19 } from 'lucide-react/dist/esm/icons/mail.mjs';
import { __iconData as icon20 } from 'lucide-react/dist/esm/icons/calendar.mjs';
import { __iconData as icon21 } from 'lucide-react/dist/esm/icons/clock.mjs';
import { __iconData as icon22 } from 'lucide-react/dist/esm/icons/download.mjs';
import { __iconData as icon23 } from 'lucide-react/dist/esm/icons/upload.mjs';
import { __iconData as icon24 } from 'lucide-react/dist/esm/icons/external-link.mjs';
import { __iconData as icon25 } from 'lucide-react/dist/esm/icons/link.mjs';
import { __iconData as icon26 } from 'lucide-react/dist/esm/icons/copy.mjs';
import { __iconData as icon27 } from 'lucide-react/dist/esm/icons/trash.mjs';
import { __iconData as icon28 } from 'lucide-react/dist/esm/icons/pencil.mjs';
import { __iconData as icon29 } from 'lucide-react/dist/esm/icons/funnel.mjs';
import { __iconData as icon30 } from 'lucide-react/dist/esm/icons/sliders-horizontal.mjs';
import { __iconData as icon31 } from 'lucide-react/dist/esm/icons/ellipsis.mjs';
import { __iconData as icon32 } from 'lucide-react/dist/esm/icons/ellipsis-vertical.mjs';
import { __iconData as icon33 } from 'lucide-react/dist/esm/icons/eye.mjs';
import { __iconData as icon34 } from 'lucide-react/dist/esm/icons/eye-off.mjs';
import { __iconData as icon35 } from 'lucide-react/dist/esm/icons/lock.mjs';
import { __iconData as icon36 } from 'lucide-react/dist/esm/icons/log-out.mjs';
import { __iconData as icon37 } from 'lucide-react/dist/esm/icons/heart.mjs';
import { __iconData as icon38 } from 'lucide-react/dist/esm/icons/bookmark.mjs';
import { __iconData as icon39 } from 'lucide-react/dist/esm/icons/file.mjs';
import { __iconData as icon40 } from 'lucide-react/dist/esm/icons/folder.mjs';
import { __iconData as icon41 } from 'lucide-react/dist/esm/icons/circle-question-mark.mjs';
import { __iconData as icon42 } from 'lucide-react/dist/esm/icons/info.mjs';
export const ICONS = {
  'search': icon0,
  'menu': icon1,
  'x': icon2,
  'check': icon3,
  'plus': icon4,
  'minus': icon5,
  'arrow-left': icon6,
  'arrow-right': icon7,
  'arrow-up': icon8,
  'arrow-down': icon9,
  'chevron-left': icon10,
  'chevron-right': icon11,
  'chevron-up': icon12,
  'chevron-down': icon13,
  'home': icon14,
  'settings': icon15,
  'user': icon16,
  'users': icon17,
  'bell': icon18,
  'mail': icon19,
  'calendar': icon20,
  'clock': icon21,
  'download': icon22,
  'upload': icon23,
  'external-link': icon24,
  'link': icon25,
  'copy': icon26,
  'trash': icon27,
  'pencil': icon28,
  'filter': icon29,
  'sliders-horizontal': icon30,
  'more-horizontal': icon31,
  'more-vertical': icon32,
  'eye': icon33,
  'eye-off': icon34,
  'lock': icon35,
  'log-out': icon36,
  'heart': icon37,
  'bookmark': icon38,
  'file': icon39,
  'folder': icon40,
  'circle-help': icon41,
  'info': icon42
};
const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function expandLucideIcons(html) {
  return html.replace(/<i\b([^>]*?)\sdata-lucide\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>\s*<\/i\s*>/gi, (source, before, a, b, c, after) => {
    const name = a || b || c, icon = ICONS[name];
    if (!icon) return source;
    const body = icon.node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key]) => key !== 'key').map(([key, value]) => `${key}="${escape(value)}"`).join(' ')}></${tag}>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"${before}${after} data-lucide="${escape(name)}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  });
}
