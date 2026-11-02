module.exports = function setupMenu({ app, Menu, dispatchMenuAction, platform }) {
  const isMac = platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: "About VOO Design", click: () => dispatchMenuAction("help:about") },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Document",
          accelerator: "CmdOrCtrl+N",
          click: () => dispatchMenuAction("file:new"),
        },
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => dispatchMenuAction("file:open"),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => dispatchMenuAction("file:save"),
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => dispatchMenuAction("file:saveAs"),
        },
        { type: "separator" },
        {
          label: "Export PNG...",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => dispatchMenuAction("export:png"),
        },
        {
          label: "Export SVG...",
          click: () => dispatchMenuAction("export:svg"),
        },
        {
          label: "Export PSD...",
          click: () => dispatchMenuAction("export:psd"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          click: () => dispatchMenuAction("edit:undo"),
        },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Shift+Z",
          click: () => dispatchMenuAction("edit:redo"),
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        {
          label: "Duplicate",
          accelerator: "CmdOrCtrl+D",
          click: () => dispatchMenuAction("edit:duplicate"),
        },
        {
          label: "Delete",
          accelerator: "Backspace",
          click: () => dispatchMenuAction("edit:delete"),
        },
        { type: "separator" },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          click: () => dispatchMenuAction("edit:selectAll"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Fit to Screen",
          accelerator: "CmdOrCtrl+0",
          click: () => dispatchMenuAction("view:fit"),
        },
        {
          label: "Actual Size (100%)",
          accelerator: "CmdOrCtrl+1",
          click: () => dispatchMenuAction("view:actualSize"),
        },
        {
          label: "Zoom to Selection",
          accelerator: "CmdOrCtrl+2",
          click: () => dispatchMenuAction("view:zoomSelection"),
        },
        { type: "separator" },
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Plus",
          click: () => dispatchMenuAction("view:zoomIn"),
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          click: () => dispatchMenuAction("view:zoomOut"),
        },
        { type: "separator" },
        { role: "toggledevtools" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
  ];

  template.push({
    label: app.getLocale?.().startsWith("zh") ? "帮助" : "Help",
    submenu: [
      { label: app.getLocale?.().startsWith("zh") ? "关于 VOO Design" : "About VOO Design", click: () => dispatchMenuAction("help:about") },
      { label: app.getLocale?.().startsWith("zh") ? "新手引导" : "Welcome tour", click: () => dispatchMenuAction("help:first-run") },
      { label: app.getLocale?.().startsWith("zh") ? "Agent / CLI 设置向导" : "Agent / CLI Setup Wizard", click: () => dispatchMenuAction("help:onboarding") },
    ],
  });
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};
