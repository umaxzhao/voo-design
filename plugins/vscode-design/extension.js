const vscode = require("vscode");

/**
 * Activates the VOO Design VS Code / Cursor extension.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let panel = null;

  const disposable = vscode.commands.registerCommand("voo.openDesignMode", () => {
    const config = vscode.workspace.getConfiguration("voo");
    const editorUrl = config.get("editorUrl") || "http://localhost:5173/?embed=1";

    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    panel = vscode.window.createWebviewPanel(
      "vooDesignMode",
      "VOO Design",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = getWebviewContent(editorUrl);

    panel.onDidDispose(() => {
      panel = null;
    }, null, context.subscriptions);
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(editorUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VOO Design</title>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #000000;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
  </style>
</head>
<body>
  <iframe src="${editorUrl}" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
</body>
</html>`;
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
