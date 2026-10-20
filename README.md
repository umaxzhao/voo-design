<p align="center">
  <img src="public/voo-mark.svg" width="96" height="96" alt="VOO Design" />
</p>

<h1 align="center">VOO Design</h1>

<p align="center">
  <strong>A vector and raster design editor</strong><br />
  <sub>Runs on the desktop (Electron) and in the browser</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" />
  <img src="https://img.shields.io/badge/Electron-desktop-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 5" />
</p>

![VOO Design dashboard](docs/screenshots/dashboard.jpg)

**VOO Design** is a design editor for vector shapes, pixel layers, text, masks and filters, all in one document. Local AI tools (background removal, upscaling, inpainting) run on your machine.

![VOO Design editor](docs/screenshots/editor.jpg)

---

## Features

### Editing
- **Vector and pixel layers**: rectangles, ellipses, paths drawn with the pen tool, text, images, groups and boolean operations.
- **Selection tools**: marquee, lasso and magnetic lasso, with snapping, equal-gap distribution and alignment.
- **Pixel tools**: brush, eraser, paint and mask editing, with undo and redo.
- **Transforms**: free transform, mesh transform and puppet warp.
- **Non-destructive adjustments**: adjustment layers and blend modes.

### Output
- **Export** to PNG, JPG, WebP, SVG, PDF, PSD and a standalone HTML page.
- **Save and open** `.voo` project files, which hold the document and its image data.

### Local AI (on-device)
- **Background removal** with an on-device matting model.
- **Upscaling** with Real-ESRGAN-style compact models.
- **AI repair and inpainting** with a LaMa model.

The models run locally through ONNX Runtime. See [AI models](#ai-models) below.

---

## Getting started

Requires Node.js and npm.

```bash
git clone https://github.com/umaxzhao/voo-design.git
cd voo-design
npm install
```

Run the web app:

```bash
npm run dev          # http://localhost:5173
```

Run the desktop app with the dev server:

```bash
npm run electron:dev
```

Build the web app, or package the desktop app:

```bash
npm run build
npm run electron:build
```

---

## Testing

```bash
npm test             # unit tests (vitest)
npm run lint:design  # design-token lint
```

---

## AI models

Model weights are not stored in this repository.

- **Desktop installer**: the installer includes the models that the local AI features need.
- **Web and development builds**: models are downloaded the first time you use a feature, then cached by the browser. They come from the URL in `VITE_MODEL_BASE_URL` (default `https://voo.run/models`).

To serve models from your own host, create a `.env` file:

```bash
VITE_MODEL_BASE_URL=https://your-host.example/models
```

Each model keeps its own license. Check it before you redistribute the model or use it commercially. For example, the background-removal model `rmbg-1.4` is listed under the `bria-rmbg-1.4` license in [`src/canvas/editor/matting_models.js`](src/canvas/editor/matting_models.js).

---

## Project layout

| Path | Contents |
| :--- | :--- |
| `src/canvas/editor/` | Editor engine, tools, rendering, export and AI pipelines |
| `src/canvas/components/` | React UI: toolbars, panels, layers, dialogs |
| `src/shared/` | Shared code: i18n, providers, persistence contracts |
| `electron/` | Electron main and preload processes |
| `vendor/voo-canvas-core/` | Skia scene renderer, included as a local package |
| `tests/unit/` | Unit tests |

---

## License

MIT. See [LICENSE](LICENSE).
