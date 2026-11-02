# Web images via your signed-in Chrome

The design agent can call `generate_image_web` to create pictures in the ChatGPT or Gemini tab you are already signed into, then place them on the canvas. VOO Design does not drive those pages with a remote-debugging port. Google sign-in is unreliable in that kind of browser. Instead the desktop app speaks to a Chrome extension over a loopback WebSocket that only accepts this extension's origin.

The browser build of the editor cannot do this. It tells the agent that web image generation needs the desktop app.

## What runs where

1. The Agent panel calls `generate_image_web`.
2. The Electron main process opens your normal Google Chrome with the provider URL and no automation flags (`electron/chrome-launcher.js`). It does not pass `--remote-debugging-port`, `--enable-automation`, `--user-data-dir`, or `--load-extension`.
3. The extension (`extension/`) dials `ws://127.0.0.1:17632`. The desktop bridge (`electron/extension_bridge.js`) accepts only `chrome-extension://iippbemfbmjdkfpjbhjcfcbcmmjidaim`.
4. A `link.job` frame is acknowledged within 15 seconds. The content script types the prompt, waits until you are signed in (up to five minutes), and sends the new images back.
5. The app places each image with the same `placeImage` path as other generated images.

Chrome 137 and later removed `--load-extension`, so the extension is loaded by hand once.

## Build and install

From the repository root:

```bash
npm run build:extension
```

That writes `extension/dist/background.js` and `extension/dist/content.js`. Then:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose Load unpacked and select this repo's `extension` folder (the folder that contains `manifest.json`, not `extension/dist` alone).
4. Start the VOO Design desktop app (`npm run electron:dev` or a packaged build).
5. Ask the agent to generate an image with ChatGPT or Gemini. Sign in in the Chrome window if it asks. Leave that window open until the pictures land on the canvas.

The extension id is pinned by the manifest `key` so it matches the bridge allowlist. Loading a copy with a different key will fail with "extension not linked".

## Errors the Agent panel shows

| Code | Meaning |
| --- | --- |
| `needsDesktopApp` | This window is the browser build, not Electron. |
| `extensionNotLinked` | Chrome is open but the extension has not connected. |
| `chromeLaunchFailed` | Google Chrome was not found. |
| `loginRequired` | Still signed out after five minutes. |
| `composerMissing` | The prompt box was not on the page. |
| `timeout` | The turn did not finish in time, or the job was not acknowledged. |
| `noImages` | The turn finished without a new image. |

## Manual checks

Automated tests mock the bridge. On your machine, confirm:

- Chrome opens your real profile, not a debug-port window, and you stay signed in.
- With the extension unloaded, the panel says the extension is not connected.
- With the extension loaded but signed out, the panel says to sign in, and the tab stays open.
- After a ChatGPT or Gemini image finishes, it appears on the canvas.
- The browser build (`npm run dev` in a normal browser tab) returns the desktop-app message instead of launching Chrome.
