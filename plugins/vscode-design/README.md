# VOO Design Mode for VS Code & Cursor

Embed the VOO Design editor directly into your IDE alongside your code.

## Quick Start

1. Start VOO Design in your terminal:
   ```sh
   npm run dev
   ```
2. In VS Code or Cursor:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
   - Type and select: **VOO: Open Design Mode**
3. The editor opens in a side panel with full canvas editing and real-time MCP bridge connectivity.

## Configuration

In your VS Code `settings.json`:

```json
{
  "voo.editorUrl": "http://localhost:5173/?embed=1"
}
```
