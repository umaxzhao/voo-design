/**
 * VOO Editor Panel — Client half.
 *
 * Registers a right-Sidebar tab type and body that run the VOO Design editor
 * (served on the loopback bridge origin by the Host half) inside an iframe.
 * Loaded as a classic script by the Harness web page; only `react` is required
 * from the browser module table.
 */
window.__ModuleLoader__.load({
  // The loader id must equal the bundle package name (`voo`).
  id: 'voo',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Tab type identity in the sidebar tab system and the body registration key (kept stable across the bundle merge). */
    const ID = 'voo-editor-panel';
    /** Page kind the guide entry opens. */
    const KIND = 'voo';
    /** Locale namespace owning every visible string here. */
    const NS = 'vooEditorPanel';
    /** The Host half serves the built editor on this loopback origin. */
    const EDITOR_URL = 'http://127.0.0.1:4173/?embed';

    /** VOO mark, copied from the repository artwork (dist/voo-mark.svg). */
    const MARK_PATH = 'M21 6.25V16.75L11.5 22L2 16.75V6.25L11.5 1L21 6.25ZM11.5 22L21 6.25H2L11.5 22ZM11.5 6.66016C14.2777 6.66016 16.5294 8.82703 16.5294 11.5C16.5294 14.173 14.2777 16.3398 11.5 16.3398C8.72233 16.3398 6.47059 14.173 6.47059 11.5C6.47059 8.82703 8.72233 6.66016 11.5 6.66016Z';

    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      'type.label': 'VOO 编辑器',
      'guide.title': 'VOO 设计编辑器',
      'guide.description': '在右侧面板里运行 VOO 设计编辑器，与 Agent 的画布工具共享同一个本地画布。',
      'loading': '正在加载 VOO 编辑器…',
    };

    /** English dictionary, keyed to match the Chinese one. */
    const en = {
      'type.label': 'VOO editor',
      'guide.title': 'VOO Design editor',
      'guide.description': 'Run the VOO Design editor in the right sidebar, sharing one local canvas with the agent canvas tools.',
      'loading': 'Loading the VOO editor…',
    };

    /**
     * The VOO mark as a guide entry glyph.
     * @param props - rendered size and class; the guide passes 22 or 26.
     * @returns the mark, inked with `currentColor`.
     */
    function VooGlyph({ size = 24, className }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          focusable: 'false',
          className,
          style: { display: 'block' },
        },
        h('path', { d: MARK_PATH, fill: 'currentColor' }),
      );
    }

    /**
     * The tab body: a full-bleed iframe over the Host-served editor, with a
     * light loading overlay until its first load. The refresh command remounts
     * the iframe so the editor starts clean.
     * @param props - the framework `t` seat and the tab record hook.
     * @returns the pane filling the Sidebar body.
     */
    function VooPanel({ t, useTabInfo }) {
      const { tab } = useTabInfo();
      const [loading, setLoading] = React.useState(true);
      const [revision, setRevision] = React.useState(0);

      React.useEffect(
        () =>
          tab.actions.bindCommands({
            refresh: () => {
              setLoading(true);
              setRevision((value) => value + 1);
            },
          }),
        [tab.actions, tab.id],
      );

      return h(
        'div',
        {
          style: {
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            background: 'var(--dsw-alias-bg-base)',
          },
        },
        h('iframe', {
          key: revision,
          src: EDITOR_URL,
          title: t('type.label'),
          onLoad: () => setLoading(false),
          style: {
            width: '100%',
            height: '100%',
            border: 0,
            display: 'block',
            background: 'var(--dsw-alias-bg-base)',
          },
        }),
        loading
          ? h(
              'div',
              {
                key: 'loading',
                style: {
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  color: 'var(--dsw-alias-label-secondary)',
                  background: 'var(--dsw-alias-bg-base)',
                  fontSize: 12,
                  lineHeight: 1.5,
                },
              },
              t('loading'),
            )
          : null,
      );
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => {
          const disposeDictionary = ctx.locale.register(NS, { zh, en });
          const t = ctx.locale.bind(NS);

          const disposeType = ctx.sidebarRightTabs.register({
            id: ID,
            kind: KIND,
            keepMounted: true,
            title: () => t('type.label'),
            guide: [
              {
                id: KIND,
                order: 40,
                title: () => t('guide.title'),
                description: () => t('guide.description'),
                icon: VooGlyph,
              },
            ],
          });

          const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, locale: NS }, VooPanel),
          );

          return () => {
            disposeBody();
            disposeType();
            disposeDictionary();
          };
        }, 'voo-editor-panel: tab type');
      },
    };
  },
});
