/**
 * Injected script for webview or iframe to support:
 * 1. Interactive element inspection & picking (highlight box + tag badge)
 * 2. DOM tree styling serialization (baking computed styles into inline CSS)
 * 3. Converting relative image URLs to absolute URLs
 */

export const INJECTED_PICKER_CODE = `
(() => {
  if (window.__vooPickerInstalled) return;
  window.__vooPickerInstalled = true;

  let activePicker = false;
  let overlay = null;
  let label = null;
  let hoveredElement = null;

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = '__voo_picker_overlay__';
    overlay.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 2147483647',
      'border: 2px solid #3b82f6',
      'background: rgba(59, 130, 246, 0.18)',
      'box-sizing: border-box',
      'border-radius: 3px',
      'transition: all 0.04s ease-out',
      'display: none',
    ].join(' !important;') + ' !important;';

    label = document.createElement('div');
    label.style.cssText = [
      'position: absolute',
      'top: -24px',
      'left: -2px',
      'background: #1d4ed8',
      'color: #ffffff',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
      'font-size: 11px',
      'font-weight: 600',
      'padding: 2px 6px',
      'border-radius: 3px',
      'white-space: nowrap',
      'line-height: 14px',
      'box-shadow: 0 2px 6px rgba(0,0,0,0.3)',
      'pointer-events: none',
    ].join(' !important;') + ' !important;';

    overlay.appendChild(label);
    document.documentElement.appendChild(overlay);
  }

  function updateOverlay(el) {
    if (!el || el === document.documentElement || el === document.body || el === overlay) {
      if (overlay) overlay.style.display = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    createOverlay();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const tag = el.tagName.toLowerCase();
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/)[0]
      : '';
    const id = el.id ? '#' + el.id : '';
    const size = Math.round(rect.width) + ' × ' + Math.round(rect.height);
    label.textContent = tag + id + cls + ' (' + size + ')';

    // Flip label inside if too close to top
    if (rect.top < 26) {
      label.style.top = '4px';
    } else {
      label.style.top = '-24px';
    }
  }

  const ESSENTIAL_CSS_PROPS = [
    'display', 'flex-direction', 'justify-content', 'align-items', 'gap', 'flex-wrap',
    'background-color', 'background-image', 'color',
    'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing', 'text-align',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'box-shadow', 'opacity'
  ];

  function serializeNodeWithStyles(el, maxDepth = 6, currentDepth = 0) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id === '__voo_picker_overlay__') return '';
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return '';

    const computed = window.getComputedStyle(el);
    if (computed.display === 'none' || computed.visibility === 'hidden') return '';

    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();

    // Collect essential styles
    const styles = [];
    // Bake explicit width/height for layout consistency
    if (rect.width > 0 && (tag !== 'span' && tag !== 'a' && computed.display !== 'inline')) {
      styles.push('width:' + Math.round(rect.width) + 'px');
    }
    if (rect.height > 0 && (tag !== 'span' && tag !== 'a' && computed.display !== 'inline')) {
      styles.push('height:' + Math.round(rect.height) + 'px');
    }

    for (const prop of ESSENTIAL_CSS_PROPS) {
      const val = computed.getPropertyValue(prop);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== 'rgba(0, 0, 0, 0)') {
        styles.push(prop + ':' + val);
      }
    }

    // Attributes
    const attrs = [];
    attrs.push('style="' + styles.join(';') + '"');
    if (tag === 'img' && el.src) {
      try {
        const absUrl = new URL(el.getAttribute('src') || el.src, window.location.href).href;
        attrs.push('src="' + absUrl + '"');
      } catch {
        attrs.push('src="' + el.src + '"');
      }
      if (el.alt) attrs.push('alt="' + el.alt.replace(/"/g, '&quot;') + '"');
    }

    let innerContent = '';
    if (currentDepth < maxDepth) {
      for (const child of el.childNodes) {
        if (child.nodeType === 3) {
          const text = child.textContent;
          if (text && text.trim()) innerContent += text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        } else if (child.nodeType === 1) {
          innerContent += serializeNodeWithStyles(child, maxDepth, currentDepth + 1);
        }
      }
    } else {
      innerContent = (el.innerText || '').trim();
    }

    if (tag === 'img' || tag === 'input' || tag === 'br' || tag === 'hr') {
      return '<' + tag + ' ' + attrs.join(' ') + ' />';
    }

    return '<' + tag + ' ' + attrs.join(' ') + '>' + innerContent + '</' + tag + '>';
  }

  function handlePointerMove(e) {
    if (!activePicker) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== hoveredElement && el !== overlay && !overlay?.contains(el)) {
      hoveredElement = el;
      updateOverlay(el);
    }
  }

  function handleClick(e) {
    if (!activePicker) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = hoveredElement || e.target;
    if (target && target !== overlay) {
      const rect = target.getBoundingClientRect();
      const serialized = serializeNodeWithStyles(target);
      const title = target.getAttribute('aria-label') || target.innerText?.slice(0, 30) || target.tagName.toLowerCase();

      notifyHost({
        type: 'voo:element-picked',
        html: serialized,
        width: Math.round(rect.width) || 400,
        height: Math.round(rect.height) || 200,
        title: title.trim() || 'Imported Element',
      });
      stopPicker();
    }
  }

  function handleKeyDown(e) {
    if (!activePicker) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      stopPicker();
      notifyHost({ type: 'voo:picker-cancelled' });
    }
  }

  function notifyHost(payload) {
    try {
      console.log('__VOO_PICK__:' + JSON.stringify(payload));
    } catch {}
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
    // If in Electron webview
    if (window.ipcRenderer) {
      window.ipcRenderer.sendToHost(payload.type, payload);
    }
    try {
      window.__vooHostNotify?.(payload);
    } catch {}
  }

  window.__vooStartPicker = function() {
    activePicker = true;
    createOverlay();
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('keydown', handleKeyDown, true);
  };

  window.__vooStopPicker = function() {
    activePicker = false;
    hoveredElement = null;
    if (overlay) overlay.style.display = 'none';
    window.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('keydown', handleKeyDown, true);
  };

  window.__vooExtractFullPage = function() {
    const root = document.body;
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const docBg = window.getComputedStyle(document.documentElement).backgroundColor;
    const resolvedBg = (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent')
      ? bodyBg
      : (docBg && docBg !== 'rgba(0, 0, 0, 0)' && docBg !== 'transparent') ? docBg : null;

    const html = serializeNodeWithStyles(root, 16, 0);
    const title = document.title || 'Imported Web Page';
    const scrollH = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0,
      window.innerHeight || 0
    );
    return {
      html,
      width: window.innerWidth || document.documentElement.clientWidth || 1200,
      height: scrollH,
      title,
      backgroundColor: resolvedBg,
    };
  };

  window.addEventListener('message', (event) => {
    if (event.data?.action === 'start-picker') window.__vooStartPicker();
    if (event.data?.action === 'stop-picker') window.__vooStopPicker();
  });
})();
`;
