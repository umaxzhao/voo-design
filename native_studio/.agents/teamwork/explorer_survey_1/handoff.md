# Web Agent Reference Architecture Survey & Specification

**Author**: Explorer Survey 1 (Web Agent Reference Explorer)  
**Date**: 2026-10-21T16:55:00Z  
**Target Repository**: `voo_design/native_studio`  
**Reference Files**:
- `../src/canvas/agent/canvas_agent.js`
- `../src/canvas/agent/canvas_tools.js`
- `../src/canvas/agent/chat_stream.js`
- `../src/canvas/agent/image_generation.js`
- `../src/canvas/generation_routes.js`
- `../src/canvas/agent/session_history.js`
- `../src/canvas/agent/cli_agent_step.js`
- `../src/canvas/components/canvas_agent_panel.jsx`
- `../src/canvas/editor/command_table/` (Part 1 - Part 4)

---

## 1. Observation

Direct code inspections of the reference implementation revealed the following structural facts:

### 1.1 Web Agent Loop (`canvas_agent.js`)
- **System Prompt** (verbatim, lines 14–18):
  ```javascript
  const SYSTEM_PROMPT =
    "You are a design assistant inside a free-form design canvas. " +
    "Create and edit content by calling tools. Generate images with generate_image; " +
    "when the user has selected a layer, pass useSelection so it is used as the reference. " +
    "Keep replies short.";
  ```
- **Prompt Extension** (line 38): If `styleNote` is provided, it is appended:
  ```javascript
  const system = styleNote.trim() ? `${SYSTEM_PROMPT}\n\nStyle notes from the user: ${styleNote.trim()}` : SYSTEM_PROMPT;
  ```
- **Error Codes** (lines 10–12):
  ```javascript
  export const AGENT_ERROR = Object.freeze({
    STEP_LIMIT: "agentStepLimit",
  });
  ```
- **Default Constraints** (`canvas_tools.js`, lines 29–35):
  ```javascript
  export const AGENT_DEFAULTS = Object.freeze({
    confirmBeforeImage: true,
    useSelectionByDefault: true,
    defaultImageSize: "1024x1024",
    maxSteps: 8,
    styleNote: "",
  });
  ```
- **Loop Termination**: The loop terminates when `toolCalls.length === 0`, returning the accumulated `text` string, or throws an error with `.code = "agentStepLimit"` when `step >= maxSteps`.

### 1.2 Tool Definitions & Schemas (`canvas_tools.js`)
- `CANVAS_TOOL_SCHEMAS` (lines 45–71) defines exactly two function tools for the core agent loop:
  1. `generate_image`:
     ```json
     {
       "type": "function",
       "function": {
         "name": "generate_image",
         "description": "Generate one image and place it as a new image layer on the open canvas. When a layer is selected and useSelection is not false, the selected image is the reference.",
         "parameters": {
           "type": "object",
           "properties": {
             "prompt": { "type": "string" },
             "size": { "type": "string", "description": "Optional, for example 1024x1024." },
             "useSelection": { "type": "boolean" }
           },
           "required": ["prompt"]
         }
       }
     }
     ```
  2. `describe_selection`:
     ```json
     {
       "type": "function",
       "function": {
         "name": "describe_selection",
         "description": "Report which layer is currently selected on the canvas.",
         "parameters": {
           "type": "object",
           "properties": {}
         }
       }
     }
     ```
- Tool error codes (lines 39–43):
  ```javascript
  export const TOOL_ERROR = Object.freeze({
    NO_EDITOR: "agentNoEditor",
    NO_IMAGE_MODEL: "agentNoImageModel",
    CANCELLED: "agentCancelled",
  });
  ```

### 1.3 Extended Canvas Mutation Command Table (`command_table/`)
In the underlying design editor (`src/canvas/editor/command_table/`), commands are registered through `createEditorCommandBridge` with full undo/redo transaction support:
- `draw_rect`: `x`, `y`, `width`, `height`, `fill`, `stroke`, `strokeWidth`, `cornerRadius`.
- `draw_ellipse`: `x`, `y`, `width`, `height`, `fill`, `stroke`, `strokeWidth`.
- `draw_line`: `x1`, `y1`, `x2`, `y2`, `stroke`, `strokeWidth`.
- `add_pen_node`: `svgD`, `anchors` (`[{ x, y, in: [dx,dy], out: [dx,dy] }]`), `x`, `y`, `stroke`, `strokeWidth`, `fill`.
- `apply_copy_structure`: `structure` (`blocks: [{ text, fontSize, fill, weight, align, boxWidth }]`), `x`, `y`, `gap`.
- `apply_design_patches`: `patches: [{ targetId, patch: { x, y, width, height, fontSize } }]`.
- `fill_selection`: Content-aware smart fill on pixel selection.
- `repaint_selection`: AI inpaint/repaint with `prompt` on pixel selection.
- `refine_selection`: `operation` ("feather" | "expand" | "contract" | "smooth"), `amount`.
- `select_region`: `x`, `y`, `width`, `height`, `mode` ("replace" | "add" | "subtract" | "intersect").
- `get_editor_context`: Query layer kinds, selection state, and available actions.

### 1.4 LLM Streaming Client & SSE Protocol (`chat_stream.js`)
- **Endpoint**: `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
- **Method**: `POST`
- **Headers**:
  ```javascript
  {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${config.apiKey}`
  }
  ```
  Special case: If `new URL(config.baseUrl).hostname === "api.anthropic.com"`, add:
  ```javascript
  "anthropic-dangerous-direct-browser-access": "true"
  ```
- **Request Body**:
  ```json
  {
    "model": "<config.model>",
    "messages": [ ... ],
    "tools": [ ... ],
    "stream": true
  }
  ```
- **SSE Stream Decoding**:
  - Buffer chunks decoded with `TextDecoder({ stream: true })`.
  - Lines split on `\n`.
  - Filter prefix: `data: `
  - Termination: `[DONE]` signals end of stream (skipped).
  - Delta chunk: `event.choices?.[0]?.delta`
  - Text delta: `if (delta.content) { text += delta.content; onText?.(text); }`
  - Tool calls merging by index (`mergeToolCalls`):
    ```javascript
    function mergeToolCalls(calls, deltas) {
      for (const delta of deltas) {
        const slot = (calls[delta.index ?? 0] ??= {
          id: "",
          name: "",
          arguments: "",
        });
        if (delta.id) slot.id = delta.id;
        if (delta.function?.name) slot.name += delta.function.name;
        if (delta.function?.arguments) slot.arguments += delta.function.arguments;
      }
    }
    ```
- **Errors**:
  - Missing credentials/config: `CHAT_ERROR.NOT_CONFIGURED = "agentNotConfigured"`
  - HTTP error: `CHAT_ERROR.HTTP = "agentHttpError"` (`HTTP: ${response.status}`)

### 1.5 Multi-Turn Conversation & Session History (`session_history.js` & `canvas_agent_panel.jsx`)
- **Session Structure**:
  ```typescript
  interface AgentSession {
    id: string; // "session_<timestamp>_<random>"
    title: string; // derived from first user message (up to 24 chars) or session.title
    createdAt: number;
    updatedAt: number;
    messages: TranscriptItem[]; // Rich transcript for UI rendering
    history: ChatMessage[]; // OpenAI format messages across turns
  }
  ```
- **Across-Turn Flattening**:
  Within a single turn, intermediate tool calls and tool responses are appended to the in-flight `messages` array:
  1. `assistant` with `tool_calls`
  2. `tool` with `content: JSON.stringify(result)`
  However, once the turn completes, the persistent conversation `history` stored for subsequent turns contains strictly:
  ```javascript
  history = [
    ...history,
    { role: "user", content: text },
    { role: "assistant", content: reply }
  ];
  ```
- **Context Prefix**:
  When a node on the canvas is selected, user prompt text is automatically decorated:
  ```javascript
  `[Context: ${targetContext.name} (${targetContext.kind || "layer"}, id: ${targetContext.nodeId}${targetContext.width ? `, ${targetContext.width}x${targetContext.height}` : ""})]\n${text}`
  ```

### 1.6 Image Generation & Layer Ingestion (`image_generation.js`)
- **Polling Parameters**:
  - `DEFAULT_MAX_POLLS = 90`
  - `DEFAULT_POLL_INTERVAL_MS = 2000` (Max wait time: 180 seconds)
- **Status States (`REMOTE_JOB_STATUS`)**:
  - `"pending"` -> keep polling
  - `"processing"` -> keep polling
  - `"completed"` -> return `{ taskId, urls }`
  - `"failed"` -> throw `IMAGE_GENERATION_ERROR.FAILED` (`"generateImageFailed"`)
- **Timeouts / Errors**:
  - `"generateImageTimeout"`
  - `"generateImageNoResult"`
  - `"generateImageNoEditor"`
- **Layer Placement Contract (`makeCentredImageNode` & `insertImage`)**:
  1. Image is loaded/decoded into a bitmap.
  2. Bounding box calculation:
     - `maxWidth = doc.width * 0.8`
     - `maxHeight = doc.height * 0.8`
     - `scale = min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)`
     - `width = bitmap.width * scale`, `height = bitmap.height * scale`
  3. Positioning:
     - Default (centered): `x = doc.width / 2 - width / 2`, `y = doc.height / 2 - height / 2`
     - With `point`: `x = point.x - width / 2`, `y = point.y - height / 2`
  4. Layer instantiated: `kind = "image"`, `imageId`, `src`.
  5. State mutation: added to `doc.nodes`, committed with undo history label `"editor.layer.add"`, and newly created layer is selected via `select(node.id)`.

---

## 2. Logic Chain & Architecture Mapping

```
+---------------------------------------------------------------------------------+
|                                 USER INPUT                                      |
|  - Text prompt from composer ("Create a blue rounded card with title 'Welcome'") |
|  - Optional Selection Context ([Context: Rectangle 1 (rect, id: n_123, 400x300)])|
+----------------------------------------+----------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                            AGENT LOOP (runAgentTurn)                            |
|  1. Construct messages: [System Prompt + StyleNote, ...History, User Prompt]    |
|  2. Enter Step Loop: step 0 .. maxSteps (default: 8)                           |
+----------------------------------------+----------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                       STREAMING CLIENT (streamChatTurn)                         |
|  - POST /chat/completions (OpenAI SSE wire format)                              |
|  - Parse "data: {...}" chunks                                                   |
|  - Accumulate delta.content -> onText(text) callback (real-time UI update)      |
|  - Accumulate delta.tool_calls -> mergeToolCalls by index (id, name, arguments) |
+----------------------------------------+----------------------------------------+
                                         |
                 +-----------------------+-----------------------+
                 |                                               |
         toolCalls.length == 0                           toolCalls.length > 0
                 |                                               |
                 v                                               v
        [Return Final Text]                       [Process Each Tool Call]
                                                                 |
                                 +-------------------------------+-------------------------------+
                                 |                                                               |
                       call.name == "generate_image"                                  call.name == "describe_selection"
                                 |                                                               |
                                 v                                                               v
                      [Remote Image Job Pipeline]                                        [Query Canvas Selection]
                      - Check selection reference (PNG)                                  - Return { selectedId: "..." }
                      - Submit to provider (/images/generations or /edits)               - Append tool result to messages
                      - Poll status until completed (2s intervals, max 90)                               |
                      - Place image layer (center 80%, undoable)                                         |
                      - Return { taskId, placed: true }                                                  |
                                 |                                                               |
                                 +-------------------------------+-------------------------------+
                                                                 |
                                                                 v
                                                 [Append Assistant & Tool Messages]
                                                 - role: "assistant", tool_calls: [...]
                                                 - role: "tool", tool_call_id: id, content: JSON
                                                                 |
                                                                 v
                                                     [Repeat Step Loop (step + 1)]
```

### 2.1 Mapping Web Components to Pure Swift 6 (`native_studio`)
| Web/Electron Implementation | Native Studio Architecture | Swift Protocol / Types |
| :--- | :--- | :--- |
| `chat_stream.js` (`streamChatTurn`) | `URLSession` Async Stream SSE Parser | `AsyncThrowingStream<ChatStreamChunk, Error>` |
| `canvas_agent.js` (`runAgentTurn`) | `AIAgentEngine` actor / service | `actor AIAgentEngine` with `runTurn(...)` |
| `canvas_tools.js` (`CANVAS_TOOL_SCHEMAS`) | `CanvasToolRegistry` & Tool Schemas | `struct ToolDefinition: Codable` |
| `canvas_tools.js` (`executeCanvasTool`) | `CommandManager` command dispatch | `StudioCommand` (`InsertNodeCommand`, etc.) |
| `image_generation.js` (`runImageJob`) | `RemoteImagePipeline` via `URLSession` | `struct ImageGenerationJob` |
| `editor.insertImage` | `InsertNodeCommand` with `VOONode(kind: .image)` | `CommandManager.execute(InsertNodeCommand)` |
| `session_history.js` | `UserDefaults` / JSON local store | `struct AgentSession: Codable` |
| `local_ai_repair.js` (LaMa ONNX) | CoreImage / Vision / Metal Compute | `VNCoreMLModel` / CI Inpainting Filter |
| `local_matting.js` (BiRefNet) | Vision Framework Foreground Mask | `VNGenerateForegroundInstanceMaskRequest` |

### 2.2 Canonical Tool Schemas Specification for Swift 6

In addition to porting `generate_image` and `describe_selection`, Requirement R2 explicitly specifies that `native_studio` must implement vector and layer manipulation tools (`create_shape`, `create_text`, `modify_layer`) executed through `CommandManager`. Here are the exact canonical schemas:

#### 1. `generate_image`
```json
{
  "type": "function",
  "function": {
    "name": "generate_image",
    "description": "Generate an image and place it as a new image layer on the canvas. When a layer is selected and useSelection is true, the selected layer image is used as the reference.",
    "parameters": {
      "type": "object",
      "properties": {
        "prompt": { "type": "string", "description": "The detailed visual prompt describing the image to generate." },
        "size": { "type": "string", "enum": ["1024x1024", "1024x1536", "1536x1024"], "description": "Target image resolution preset." },
        "useSelection": { "type": "boolean", "description": "Whether to use the currently selected layer as an image-to-image reference." }
      },
      "required": ["prompt"]
    }
  }
}
```

#### 2. `create_shape`
```json
{
  "type": "function",
  "function": {
    "name": "create_shape",
    "description": "Create and insert a geometric shape layer (rectangle or ellipse) into the document.",
    "parameters": {
      "type": "object",
      "properties": {
        "shapeType": { "type": "string", "enum": ["rect", "ellipse"], "description": "Type of geometric shape." },
        "x": { "type": "number", "description": "X coordinate in document points." },
        "y": { "type": "number", "description": "Y coordinate in document points." },
        "width": { "type": "number", "description": "Width in document points (> 0)." },
        "height": { "type": "number", "description": "Height in document points (> 0)." },
        "fill": { "type": "string", "description": "Hex fill color (e.g. #3B82F6) or transparent." },
        "stroke": { "type": "string", "description": "Hex stroke outline color." },
        "strokeWidth": { "type": "number", "description": "Stroke line thickness in points." },
        "cornerRadius": { "type": "number", "description": "Corner radius for rounded rectangles." }
      },
      "required": ["shapeType", "x", "y", "width", "height"]
    }
  }
}
```

#### 3. `create_text`
```json
{
  "type": "function",
  "function": {
    "name": "create_text",
    "description": "Create and insert an editable typography/text layer into the document.",
    "parameters": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "Text content string." },
        "x": { "type": "number", "description": "X coordinate in document points." },
        "y": { "type": "number", "description": "Y coordinate in document points." },
        "fontSize": { "type": "number", "description": "Font size in points (default: 16)." },
        "fontFamily": { "type": "string", "description": "Font family name (default: Inter / System)." },
        "fontWeight": { "type": "string", "enum": ["regular", "medium", "semibold", "bold"], "description": "Font weight." },
        "fill": { "type": "string", "description": "Hex text fill color (default: #FFFFFF)." },
        "textAlign": { "type": "string", "enum": ["left", "center", "right"], "description": "Text alignment." }
      },
      "required": ["text", "x", "y"]
    }
  }
}
```

#### 4. `modify_layer`
```json
{
  "type": "function",
  "function": {
    "name": "modify_layer",
    "description": "Modify properties (geometry, style, text content, opacity, visibility) of an existing canvas layer.",
    "parameters": {
      "type": "object",
      "properties": {
        "nodeId": { "type": "string", "description": "Unique identifier of the target node." },
        "x": { "type": "number", "description": "New X coordinate." },
        "y": { "type": "number", "description": "New Y coordinate." },
        "width": { "type": "number", "description": "New width." },
        "height": { "type": "number", "description": "New height." },
        "rotation": { "type": "number", "description": "Rotation angle in degrees." },
        "fill": { "type": "string", "description": "New hex fill color." },
        "stroke": { "type": "string", "description": "New hex stroke color." },
        "strokeWidth": { "type": "number", "description": "New stroke width." },
        "opacity": { "type": "number", "description": "Opacity from 0.0 to 1.0." },
        "text": { "type": "string", "description": "Updated text content (for text layers)." }
      },
      "required": ["nodeId"]
    }
  }
}
```

#### 5. `describe_selection`
```json
{
  "type": "function",
  "function": {
    "name": "describe_selection",
    "description": "Get detailed information about the currently selected node(s) on the canvas.",
    "parameters": {
      "type": "object",
      "properties": {}
    }
  }
}
```

---

## 3. Caveats

1. **Browser vs. Desktop Execution**:
   - In the Web/Electron app, `anthropic-dangerous-direct-browser-access: true` is sent because requests originate from a Chromium renderer context. In macOS native AppKit, requests originate from native `URLSession` without CORS or browser origin constraints.
2. **Provider Key Storage**:
   - In Web, credentials are kept in `localStorage` or `credential_store.js` (`chrome.storage` / indexedDB). In macOS Native Studio, sensitive API keys must be securely persisted using macOS `Keychain` or secure `UserDefaults`.
3. **Local ONNX vs. CoreImage/Vision**:
   - Web uses `onnxruntime-web` (WebGPU/WASM) for LaMa (512px inpainting) and BiRefNet (background removal). macOS has native hardware-accelerated Apple Vision (`VNGenerateForegroundInstanceMaskRequest` available on macOS 14+) and CoreImage filter chains (`CIBlendWithMask`, inpainting shaders), which execute faster and require no 100MB+ remote weights download.
4. **Intermediate Tool State in History**:
   - Notice that while in-flight turn execution appends intermediate `assistant (tool_calls)` and `tool (result)` items to `messages`, the Web reference flattens cross-turn session history into `{ role: "user", content: text }` and `{ role: "assistant", content: reply }`. The native engine must follow this convention to avoid context bloat across long editing sessions.

---

## 4. Conclusion

1. **Architecture Symmetry**:
   The Web reference AI agent is built on a clean, decoupled 3-tier structure:
   - **Protocol Tier**: OpenAI-compatible streaming SSE client (`chat_stream.js`).
   - **Loop Tier**: Turn-based step executor with maximum step bounds and structured tool event callbacks (`canvas_agent.js`).
   - **Command Bridge Tier**: Strict separation between tool dispatch and document mutation, where all modifications commit through atomic commands with undo history.
2. **Readiness for Swift Implementation**:
   All specifications, parameters, regexes, SSE line protocols, and geometry scaling formulas have been fully documented above. Downstream engineering agents (LLM streaming engine, canvas tool commands, UI integration) have complete blueprint fidelity to implement the Swift equivalents without ambiguity.

---

## 5. Verification Method

To independently verify the facts and findings documented in this survey:

1. **Verify Web Reference System Prompt & Loop**:
   ```bash
   grep -n "SYSTEM_PROMPT" ../src/canvas/agent/canvas_agent.js
   grep -n "maxSteps" ../src/canvas/agent/canvas_tools.js
   ```
2. **Verify Tool Schemas in Web Codebase**:
   ```bash
   grep -A 25 "CANVAS_TOOL_SCHEMAS" ../src/canvas/agent/canvas_tools.js
   ```
3. **Verify SSE Delta Merging Logic**:
   ```bash
   grep -A 15 "mergeToolCalls" ../src/canvas/agent/chat_stream.js
   ```
4. **Verify Centered Image Layer Insertion Math**:
   ```bash
   grep -A 16 "makeCentredImageNode" ../src/canvas/editor/doc_ops_nodes.js
   grep -A 20 "insertImage(" ../src/canvas/editor/editor_engine_layers.js
   ```
5. **Verify Native Studio Foundation Alignment**:
   ```bash
   # Check DocumentModel node kinds
   grep -A 15 "public enum NodeKind" Sources/Models/DocumentModel.swift
   # Check CommandManager base commands
   grep -A 25 "public final class InsertNodeCommand" Sources/Engine/CommandManager.swift
   ```
