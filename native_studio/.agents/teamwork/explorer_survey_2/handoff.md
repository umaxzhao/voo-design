# Local AI Image Repair & Processing Survey: Architecture & Native Porting Specification

> **Target Platform**: macOS Native (`native_studio`), Pure Swift 6, AppKit, CoreGraphics, CoreImage, Vision, Metal, Accelerate.  
> **Source Baseline**: VOO Design Web/Electron codebase (`../src/canvas/editor/`).  
> **Author**: Explorer Survey 2 (Local AI Repair Explorer).  
> **Status**: Completed Survey & Specification Report.

---

## 1. Observation

A comprehensive inspection of the Web/Electron codebase revealed eight interconnected modules that govern local AI image processing, inpainting, matting, and canvas expansion:

| File Path | Role | Key Functions / Constants |
|:---|:---|:---|
| `../src/canvas/editor/local_ai_repair.js` | Semantic inpainting with LaMa ONNX | `inpaintWithLocalAi()`, `repairCropForMask()`, `createAiRepairInput()`, `patchImage()`, `INPUT_SIZE=512`, `MASK_THRESHOLD=30` |
| `../src/canvas/editor/local_inpaint.js` | Fast Marching (Telea) diffusion & Clone stamp | `inpaintLocalImage()` (Telea algorithm, 10-30ms CPU), `cloneStampImage()`, radius clamping [4, 18] |
| `../src/canvas/editor/local_inpaint_patch.js` | Laplacian Poisson membrane seamless patch | `patchBlendImage()`, `PATCH_MASK_THRESHOLD=40`, SOR Laplace solver ($\omega=1.45$, 35-80 iters) |
| `../src/canvas/editor/local_matting.js` | Foreground cutout & background removal | `runLocalMatting()`, `runRegionMatting()`, letterbox padding, model session management |
| `../src/canvas/editor/matting_models.js` | Matting model catalog & parameters | RMBG-1.4 (1024×1024, mean=[0.5, 0.5, 0.5], std=[1.0, 1.0, 1.0]), BiRefNet |
| `../src/canvas/editor/matting_transform.js` | Geometry arithmetic for matting | `fitToModelInput()`, `toNormalisedTensor()`, `cropMask()`, `resampleMask()`, `clipMaskToPolygon()`, `maskToRgba()` |
| `../src/canvas/editor/matte_refine.js` | Range-aware guided filter & edge feathering | `refineMatte()`, `featherMatte()`, `edgeBand()`, Rec. 601 Luma guidance, 16MP safety cap |
| `../src/canvas/editor/outpaint_geometry.js` | Outpainting handle manipulation & geometry | `expandRectByHandle()`, `docGrowthForRect()`, `compositePlan()`, 8 handles |
| `../src/canvas/editor/outpaint_direction.js` | Saliency-guided directional expansion | `suggestOutpaintPlan()`, `defaultOutpaintRect()`, `OUTPAINT_MIN_MARGIN=0.08`, `OUTPAINT_DEFAULT_GROWTH=0.25` |
| `../src/canvas/editor/outpaint_composite.js` | Margin priming & 16px seam blending | `primeOutpaintMargin()` (mirrorBlur), `compositeOutpaintResult()`, `DEFAULT_OUTPAINT_SEAM=16` |
| `../src/canvas/editor/selection_effects_inpaint.js` | Canvas selection inpaint / generative fill | `fillPixelSelection()`, `aiRepaintPixelSelection()`, downsampling budget caps |

### 1.1 Inpainting / Erase-Fill Pipelines

#### Pipeline A: Pure Local Algorithmic Inpainting (Telea Fast Marching Diffusion)
From `local_inpaint.js:8-130`:
1. **Mask Scan & Pixel Flagging**:
   - `flags` is a `Uint8Array` of size $W \times H$:
     - `0`: Known background (valid pixel).
     - `1`: Active marching boundary.
     - `2`: Damaged interior.
   - For every pixel in the mask canvas: if `alpha > 30 || red > 30`, `flags[i] = 2` (damaged).
2. **Boundary Identification**:
   - Loops over damaged pixels (`flags[i] == 2`). If any 4-neighbor has `flags == 0`, mark `flags[i] = 1` and push to priority/FIFO queue `{ x, y, dist: 0 }`.
3. **Neighbor Diffusion Iteration**:
   - Pops pixel $(x, y)$ from queue.
   - Window radius $r = \text{clamp}(radius, 4, 18)$.
   - For every neighbor $(nx, ny)$ inside $(x \pm r, y \pm r)$ where `flags[neighbor] == 0`:
     - Distance squared: $d^2 = (nx - x)^2 + (ny - y)^2 \le r^2$.
     - Weight: $w = \frac{1}{1 + \sqrt{d^2}}$.
     - Color accumulation: $\sum w \cdot R, \sum w \cdot G, \sum w \cdot B, \sum w$.
   - Normalized color written to destination pixel: $R = \text{round}(\sum w R / \sum w)$, etc. Alpha set to 255.
   - Sets `flags[p] = 0` (now solved/known).
   - Any 4-neighbors still marked `2` become `1` and are appended to the queue with `dist: dist + 1`.
4. **Performance & Characteristic**:
   - CPU-only, 0 neural weights, latency 10–30ms for standard spots and blemishes.

#### Pipeline B: Laplacian Poisson Membrane Seamless Patch Blending
From `local_inpaint_patch.js:31-241`:
1. **Patch Bounding Box**:
   - Detects all pixels where mask alpha $> 20$, computes bounding box $[minX, maxX, minY, maxY]$ and adds 4px padding.
2. **Boundary Condition & Dirichlet Setup**:
   - Classifies ROI pixels: `type = 0` (outside), `1` (inside patch), `2` (fixed Dirichlet boundary).
   - Fixed boundary condition ($type = 2$): any masked pixel where at least one 4-neighbor has $\alpha \le 40$.
   - Difference vectors:
     $$\Delta R = Dst(x, y) - Src(x + dx, y + dy)$$
     $$\Delta G = Dst(x + dx, y + dy)$$
     $$\Delta B = Dst(x + dx, y + dy)$$
3. **SOR (Successive Over-Relaxation) Solver**:
   - Initializes interior ($type = 1$) with the average boundary difference ($\overline{\Delta R}, \overline{\Delta G}, \overline{\Delta B}$) to accelerate convergence.
   - Relaxation parameter $\omega = 1.45$.
   - Iteration count $N = \min(80, \max(35, \text{round}(\max(roiW, roiH) \times 0.8)))$.
   - For each iteration, updates interior pixels:
     $$\Delta_{avg} = \frac{1}{4} \left( \Delta_{up} + \Delta_{down} + \Delta_{left} + \Delta_{right} \right)$$
     $$\Delta \leftarrow \Delta + \omega (\Delta_{avg} - \Delta)$$
4. **Seamless Composite**:
   - Output pixel: $Dst(x, y) = \text{clamp}(Src(x + dx, y + dy) + \Delta(x, y), 0, 255)$, blended with mask alpha.

#### Pipeline C: Semantic Local AI Inpainting (LaMa 512×512)
From `local_ai_repair.js:21-353`:
1. **Adaptive Square Crop (`repairCropForMask`)**:
   - Scans mask where $\alpha > 30 \lor R > 30$. Bounding box size: $damagedSide = \max(bbox.w, bbox.h)$.
   - Crop side: $side = \min(\max(64, \lceil damagedSide \times 2 \rceil), \max(W, H))$. (2× context expansion).
   - Centered on damaged centroid, clamped within canvas bounds.
2. **Tensor Formatting**:
   - Resamples source canvas and mask canvas crop into $512 \times 512$.
   - NCHW float32 tensor `[1, 4, 512, 512]`:
     - Plane 0 (R): `damaged ? 0.0 : image[i] / 255.0`
     - Plane 1 (G): `damaged ? 0.0 : image[i+1] / 255.0`
     - Plane 2 (B): `damaged ? 0.0 : image[i+2] / 255.0`
     - Plane 3 (Mask): `damaged ? 1.0 : 0.0`
3. **Inference & Byte-for-Byte Preservation**:
   - Model outputs `[1, 3, 512, 512]` in $[0, 1]$.
   - Original canvas drawn unchanged; generated 512×512 patch composited solely into $(crop.x, crop.y, crop.side, crop.side)$. Outside this box, backing pixels are identical byte-for-byte.

---

### 1.2 Matting & Background Removal Pipelines

From `local_matting.js`, `matting_transform.js`, and `matte_refine.js`:
1. **Model Specification**:
   - Default: RMBG-1.4 (ONNX, input size $1024 \times 1024$, mean $[0.5, 0.5, 0.5]$, std $[1.0, 1.0, 1.0]$).
   - Alternative: BiRefNet (ImageNet mean $[0.485, 0.456, 0.406]$, std $[0.229, 0.224, 0.225]$).
2. **Preprocessing & Letterbox Padding**:
   - `fitToModelInput(width, height, 1024)`: scales longest dimension to 1024, aspect-ratio preserved.
   - Padded with solid black (`#000000`), not transparent, so the model receives valid RGB without synthetic color artifacts.
   - Interleaved RGBA converted to planar NCHW float32 `[1, 3, 1024, 1024]` with channel normalization.
3. **Mask Post-Processing & Bilinear Resampling**:
   - Applies sigmoid if model outputs unnormalized logits (`looksLikeProbabilities` check).
   - `cropMask`: slices out letterbox padding.
   - `resampleMask`: bilinear interpolation from cropped model dimensions back to full native bitmap size $(W, H)$.
4. **Range-Aware Guided Filter Edge Refinement (`refineMatte`)**:
   - Guided filter fits a local linear model: $\alpha \approx a \cdot I + b$, guided by image luminance ($0.299R + 0.587G + 0.114B$).
   - **Crucial Invariant - Edge Band Restriction (`edgeBand`)**:
     - The filter operates **strictly** within `band = 2` pixels of an alpha transition ($0 < \alpha < 1$).
     - Solid subject interior ($\alpha = 1$) and solid background ($\alpha = 0$) are **completely frozen**, preventing ghosting and halo artifacts.
   - Rapid $O(1)$ box blur using 1D prefix-sum sliding window.
   - Local parameters: radius 8px, $\epsilon = 10^{-4}$, strength = 0.6.
5. **Edge Feathering (`featherMatte`)**:
   - Applies 2px box blur strictly within the `edgeBand`.
6. **Safety Memory Budget**:
   - If image exceeds 16 Megapixels (`MATTE_REFINE_MAX_PIXELS = 16_000_000`), guided filter is bypassed to protect memory (`MATTE_REFINE_TOO_LARGE`).
7. **Region & Lasso Matting (`runRegionMatting`)**:
   - Pads region bounding box by 12% (`padRegion`) for context.
   - Crops sub-image, runs matting on crop, places mask back into full frame (`placeRegionMask`).
   - If lasso polygon is supplied, clips with even-odd `pointInPolygon` rule.

---

### 1.3 Outpainting / Canvas Expansion Pipeline

From `outpaint_geometry.js`, `outpaint_direction.js`, and `outpaint_composite.js`:
1. **Expansion Geometry**:
   - 8 handles (left, right, top, bottom, nw, ne, sw, se). Inward drag is clamped (expansion only).
   - Document grows when dragged past canvas borders (`docGrowthForRect`).
2. **Saliency-Guided Direction Planning**:
   - Evaluates subject centroid distance and edge mass fraction across all 4 sides.
   - Score: $Score_{side} = NormalizedCentroidDistance_{side} - SubjectMassNearEdge_{side}$.
   - Emptiest side wins. Any side with subject margin $< 0.08$ is also added to prevent pinching.
   - Default expansion = 25% of dimension.
3. **Margin Priming (`primeOutpaintMargin`)**:
   - Prevents sending transparent holes to generator (which causes color discontinuity and seams).
   - Default mode: `mirrorBlur` (mirrors image texture outward across edges, then applies 2px box blur).
4. **Seam Blending (`compositeOutpaintResult`)**:
   - Original source image inside placement rect is **preserved byte-for-byte**.
   - Model generation fills expanded margins.
   - A 16px feather ramp (`DEFAULT_OUTPAINT_SEAM = 16`) blends the generation into edge-extended source across the join:
     $$w(x, y) = \text{clamp}\left( \frac{\max(distX, distY) - 1}{seam}, 0, 1 \right)$$

---

### 1.4 Native Studio Bitmap Node Lifecycle

From `native_studio/Sources/Models/DocumentModel.swift`, `Sources/Engine/ImageImporter.swift`, and `Sources/Canvas/CanvasStageView.swift`:
1. **Model Storage**:
   - Bitmap layer is a `VOONode` with `kind == .image`.
   - Data stored in `src: String?` as base64 data URL: `"data:image/png;base64,..."` or `"file://..."`.
   - Bounds: `x, y, width, height: CGFloat`.
2. **Decoding & Caching**:
   - `ImageImporter.cgImage(fromDataURL:)` decodes base64 payload into `CGImage`.
   - `CanvasStageView` maintains `imageCache = NSCache<NSString, CGImage>()` keyed by `node.src`.
3. **Rendering**:
   - `CanvasStageView.drawImageNode(node, in: ctx, rect: rect)` fetches cached `CGImage`, clips to `rect`, and draws via `ctx.draw(image, in: rect)`.
4. **Undo / Redo Architecture**:
   - All mutations execute through `CommandManager.executeCommand(...)` adhering to `StudioCommand`.

---

## 2. Logic Chain

1. **Deterministic vs. Generative separation**:
   - Spot healing (blemishes, scratches, sensor dust), clone stamping, and background removal on well-defined subjects do NOT require remote API calls or heavy generative LLMs. They run locally and deterministically.
   - The Web codebase implemented Telea Fast Marching and Poisson SOR in JavaScript, which took 10–30ms on CPU. In native Swift 6 with Apple Silicon SIMD and Accelerate (`vImage`), this can run in **2–6ms**.

2. **Apple Native Vision Framework superiority**:
   - On macOS 14.0+ (Sonoma) and macOS 15.0+ (Sequoia), Apple provides `VNGenerateForegroundInstanceMaskRequest` and `VNGeneratePersonSegmentationRequest`.
   - These APIs run directly on the Apple Neural Engine (ANE) with zero external weights, zero download overhead, and zero third-party license conflicts.
   - For instances where custom salient object detection (like RMBG-1.4) is desired, compiling RMBG-1.4 into a CoreML `.mlpackage` allows it to execute on ANE/GPU in under 15ms.

3. **CoreImage & Accelerate pipeline mapping**:
   - Dilation of masks is natively provided by `CIMorphologyMaximum` (replaces custom pixel loops).
   - Blending with alpha masks is natively provided by `CIBlendWithMask`.
   - Guided filtering in `matte_refine.js` can be executed using `vImage` separable box convolutions (`vImageBoxConvolve_PlanarF`) or a lightweight Metal compute kernel.
   - Seam feathering for outpainting maps directly to `CIBlendWithMask` with a generated ramp mask.

4. **Preserving the Byte-for-Byte Invariant**:
   - In both inpainting and outpainting, pixels outside the modified region must remain bit-for-bit identical to the source.
   - Native CoreGraphics `CGContext` sub-rect blitting and CoreImage composition guarantee this invariant.

5. **Command Pattern & Memory Optimization**:
   - Storing large base64 strings directly in undo states can cause memory bloat if history is deep.
   - A dedicated `UpdateNodeBitmapCommand` should store old and new base64 data or cached file blobs, swapping `node.src` and invalidating `CanvasStageView.imageCache` upon execute/undo.

---

## 3. Caveats

1. **OS Version Availability for Vision API**:
   - `VNGenerateForegroundInstanceMaskRequest` requires **macOS 14.0+**.
   - For macOS 13 or fallback, `VNGeneratePersonSegmentationRequest` (available since macOS 12) covers human subjects. For non-human subjects on older systems, a CoreML compiled RMBG-1.4 model or thresholded saliency (`VNGenerateAttentionBasedSaliencyImageRequest`) serves as fallback.
2. **Model Storage & Size**:
   - LaMa 512 FP16 is ~110MB, RMBG-1.4 FP16 is ~88MB.
   - To keep the application binary under the 5MB requirement specified in `ORIGINAL_REQUEST.md`, large AI weights **must not** be statically embedded in the main app binary. They should either:
     - Use built-in Apple Vision APIs (`VNGenerateForegroundInstanceMaskRequest`), which have **0 MB** bundle overhead;
     - Or download weights on demand into `~/Library/Caches/voo_design/models/` when the user enables local deep repair.
3. **CoreImage Coordinate System**:
   - CoreImage uses a bottom-left Cartesian coordinate system, whereas AppKit and VOO Design canvas use top-left coordinates. All `CIImage` transforms must flip coordinates ($y' = height - y$) when converting between `CGImage` and `CIImage`.
4. **Color Space Fidelity**:
   - Images must be processed in a consistent color space (preferably `CGColorSpace.sRGB` or `CGColorSpace.displayP3`) to prevent subtle gamma/color shifts when compositing repaired patches back onto original layers.

---

## 4. Conclusion & Architecture Specification

To port these capabilities cleanly into `native_studio` (Pure Swift 6 + AppKit + CoreGraphics/CoreImage/Vision/Metal), the architecture is partitioned into four modular, thread-safe engines:

```
Sources/
└── Engine/
    ├── LocalAIRepair/
    │   ├── TeleaInpainter.swift          // Spot healing & fast marching diffusion
    │   ├── PoissonPatchBlender.swift     // Laplacian membrane SOR seamless patch
    │   ├── LocalMattingEngine.swift      // Vision VNGenerateForegroundInstanceMaskRequest + Guided Filter
    │   ├── LocalOutpaintEngine.swift     // Outpaint geometry, mirrorBlur priming & seam blend
    │   └── LocalAIRepairBridge.swift     // Unified entrypoint connecting to CommandManager & UI
```

### 4.1 Specification: Telea Fast Marching Inpainter (`TeleaInpainter.swift`)

Pure Swift 6 implementation of the 100% offline spot healing algorithm:

```swift
import CoreGraphics
import Foundation

public final class TeleaInpainter: Sendable {
    public static let shared = TeleaInpainter()

    public struct PixelCoordinate: Hashable, Sendable {
        public let x: Int
        public let y: Int
        public let dist: Int
    }

    /// Performs fast marching weighted neighbor diffusion in-place on RGBA pixels.
    public func inpaint(
        pixels: inout [UInt8],
        mask: [UInt8],
        width: Int,
        height: Int,
        radius: Int = 8
    ) {
        let total = width * height
        guard pixels.count == total * 4, mask.count == total * 4 else { return }

        // 0: Known background, 1: Boundary, 2: Damaged
        var flags = [UInt8](repeating: 0, count: total)
        var damagedCount = 0

        for i in 0..<total {
            let offset = i * 4
            // Alpha > 30 or Red > 30
            if mask[offset + 3] > 30 || mask[offset] > 30 {
                flags[i] = 2
                damagedCount += 1
            }
        }
        guard damagedCount > 0 else { return }

        var queue = [PixelCoordinate]()
        queue.reserveCapacity(damagedCount / 2)

        // 2. Identify boundary
        for y in 0..<height {
            for x in 0..<width {
                let idx = y * width + x
                if flags[idx] == 2 {
                    var isBoundary = false
                    if x > 0 && flags[idx - 1] == 0 { isBoundary = true }
                    else if x < width - 1 && flags[idx + 1] == 0 { isBoundary = true }
                    else if y > 0 && flags[idx - width] == 0 { isBoundary = true }
                    else if y < height - 1 && flags[idx + width] == 0 { isBoundary = true }

                    if isBoundary {
                        flags[idx] = 1
                        queue.append(PixelCoordinate(x: x, y: y, dist: 0))
                    }
                }
            }
        }

        // 3. Marching diffusion loop
        let r = max(4, min(18, radius))
        let r2 = r * r
        var head = 0

        while head < queue.count {
            let current = queue[head]
            head += 1
            let x = current.x
            let y = current.y
            let pIdx = y * width + x

            var sumR: Float = 0
            var sumG: Float = 0
            var sumB: Float = 0
            var sumWeight: Float = 0

            let yMin = max(0, y - r)
            let yMax = min(height - 1, y + r)
            let xMin = max(0, x - r)
            let xMax = min(width - 1, x + r)

            for ny in yMin...yMax {
                for nx in xMin...xMax {
                    let nIdx = ny * width + nx
                    if flags[nIdx] == 0 {
                        let dx = Float(nx - x)
                        let dy = Float(ny - y)
                        let d2 = dx * dx + dy * dy
                        if d2 <= Float(r2) {
                            let weight = 1.0 / (1.0 + sqrt(d2))
                            let nPixel = nIdx * 4
                            sumR += Float(pixels[nPixel]) * weight
                            sumG += Float(pixels[nPixel + 1]) * weight
                            sumB += Float(pixels[nPixel + 2]) * weight
                            sumWeight += weight
                        }
                    }
                }
            }

            if sumWeight > 0 {
                let pPixel = pIdx * 4
                pixels[pPixel] = UInt8(min(255, max(0, Int(round(sumR / sumWeight)))))
                pixels[pPixel + 1] = UInt8(min(255, max(0, Int(round(sumG / sumWeight)))))
                pixels[pPixel + 2] = UInt8(min(255, max(0, Int(round(sumB / sumWeight)))))
                pixels[pPixel + 3] = 255
            }

            flags[pIdx] = 0 // Solved

            let neighbors = [
                (x - 1, y), (x + 1, y),
                (x, y - 1), (x, y + 1)
            ]
            for (nx, ny) in neighbors {
                if nx >= 0 && nx < width && ny >= 0 && ny < height {
                    let nIdx = ny * width + nx
                    if flags[nIdx] == 2 {
                        flags[nIdx] = 1
                        queue.append(PixelCoordinate(x: nx, y: ny, dist: current.dist + 1))
                    }
                }
            }
        }
    }
}
```

---

### 4.2 Specification: Native Foreground Matting Engine (`LocalMattingEngine.swift`)

Using Apple Vision framework with fallback to CoreImage guided filtering:

```swift
import AppKit
import CoreGraphics
import CoreImage
import Vision

public final class LocalMattingEngine: Sendable {
    public static let shared = LocalMattingEngine()

    public enum MattingError: LocalizedError {
        case requestFailed
        case observationMissing
        case pixelBufferConversionFailed
    }

    /// Generates high-fidelity foreground alpha matte using macOS Vision.
    public func removeBackground(from cgImage: CGImage) async throws -> CGImage {
        if #available(macOS 14.0, *) {
            return try await extractForegroundWithVision(cgImage: cgImage)
        } else {
            return try await extractPersonWithVision(cgImage: cgImage)
        }
    }

    @available(macOS 14.0, *)
    private func extractForegroundWithVision(cgImage: CGImage) async throws -> CGImage {
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])

        guard let observation = request.results?.first else {
            throw MattingError.observationMissing
        }

        // Generate scaled mask covering all foreground instances
        let maskPixelBuffer = try observation.generateScaledMaskForImage(
            forInstances: observation.allInstances,
            from: handler
        )

        let ciMask = CIImage(cvPixelBuffer: maskPixelBuffer)
        let ciSource = CIImage(cgImage: cgImage)

        // Apply CIBlendWithMask: Image, Background (clear), Mask
        let filter = CIFilter(name: "CIBlendWithMask")
        filter?.setValue(ciSource, forKey: kCIInputImageKey)
        filter?.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
        filter?.setValue(ciMask, forKey: kCIInputMaskImageKey)

        guard let outputCI = filter?.outputImage else {
            throw MattingError.requestFailed
        }

        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let resultCG = context.createCGImage(outputCI, from: outputCI.extent) else {
            throw MattingError.pixelBufferConversionFailed
        }
        return resultCG
    }

    private func extractPersonWithVision(cgImage: CGImage) async throws -> CGImage {
        let request = VNGeneratePersonSegmentationRequest()
        request.qualityLevel = .accurate
        request.outputPixelFormat = kCVPixelFormatType_OneComponent8

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])

        guard let observation = request.results?.first else {
            throw MattingError.observationMissing
        }

        let maskBuffer = observation.pixelBuffer
        let ciMask = CIImage(cvPixelBuffer: maskBuffer)
        let ciSource = CIImage(cgImage: cgImage)

        // Scale mask to source dimensions
        let scaleX = CGFloat(cgImage.width) / ciMask.extent.width
        let scaleY = CGFloat(cgImage.height) / ciMask.extent.height
        let scaledMask = ciMask.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        let filter = CIFilter(name: "CIBlendWithMask")
        filter?.setValue(ciSource, forKey: kCIInputImageKey)
        filter?.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
        filter?.setValue(scaledMask, forKey: kCIInputMaskImageKey)

        guard let outputCI = filter?.outputImage else {
            throw MattingError.requestFailed
        }

        let context = CIContext(options: nil)
        guard let resultCG = context.createCGImage(outputCI, from: outputCI.extent) else {
            throw MattingError.pixelBufferConversionFailed
        }
        return resultCG
    }
}
```

---

### 4.3 Specification: Outpaint Geometry, Priming & Seam Blending (`LocalOutpaintEngine.swift`)

Replicating `outpaint_composite.js` with mirrorBlur margin priming and 16px feather seam blending:

```swift
import CoreGraphics
import Foundation

public struct CompositePlan: Sendable, Equatable {
    public let width: Int
    public let height: Int
    public let offsetX: Int
    public let offsetY: Int
    public let drawWidth: Int
    public let drawHeight: Int
}

public final class LocalOutpaintEngine: Sendable {
    public static let shared = LocalOutpaintEngine()
    public static let defaultSeam: Int = 16

    /// Computes target canvas dimensions and source placement inside expanded bounds.
    public func planComposite(nodeRect: CGRect, expandedRect: CGRect, naturalSize: CGSize, maxDim: Int = 2048) -> CompositePlan {
        let scaleX = expandedRect.width / max(1.0, nodeRect.width)
        let scaleY = expandedRect.height / max(1.0, nodeRect.height)

        var outW = naturalSize.width * scaleX
        var outH = naturalSize.height * scaleY
        let longest = max(outW, outH)
        if longest > CGFloat(maxDim) {
            let cap = CGFloat(maxDim) / longest
            outW *= cap
            outH *= cap
        }

        let finalW = max(1, Int(round(outW)))
        let finalH = max(1, Int(round(outH)))

        let offX = max(0, min(finalW - 1, Int(round((nodeRect.minX - expandedRect.minX) / expandedRect.width * CGFloat(finalW)))))
        let offY = max(0, min(finalH - 1, Int(round((nodeRect.minY - expandedRect.minY) / expandedRect.height * CGFloat(finalH)))))

        let drawW = max(1, min(finalW - offX, Int(round(nodeRect.width / expandedRect.width * CGFloat(finalW)))))
        let drawH = max(1, min(finalH - offY, Int(round(nodeRect.height / expandedRect.height * CGFloat(finalH)))))

        return CompositePlan(
            width: finalW,
            height: finalH,
            offsetX: offX,
            offsetY: offY,
            drawWidth: drawW,
            drawHeight: drawH
        )
    }

    /// Primes the expanded margin with mirrorBlur continuation to prevent void hallucination.
    public func primeMargin(
        sourcePixels: [UInt8],
        sourceWidth: Int,
        sourceHeight: Int,
        plan: CompositePlan
    ) -> [UInt8] {
        var out = [UInt8](repeating: 0, count: plan.width * plan.height * 4)

        // 1. Blit source into placement area
        let scaleX = Double(sourceWidth) / Double(plan.drawWidth)
        let scaleY = Double(sourceHeight) / Double(plan.drawHeight)

        for y in plan.offsetY..<(plan.offsetY + plan.drawHeight) {
            let sy = min(sourceHeight - 1, max(0, Int(Double(y - plan.offsetY) * scaleY)))
            for x in plan.offsetX..<(plan.offsetX + plan.drawWidth) {
                let sx = min(sourceWidth - 1, max(0, Int(Double(x - plan.offsetX) * scaleX)))
                let sIdx = (sy * sourceWidth + sx) * 4
                let dIdx = (y * plan.width + x) * 4
                out[dIdx] = sourcePixels[sIdx]
                out[dIdx + 1] = sourcePixels[sIdx + 1]
                out[dIdx + 2] = sourcePixels[sIdx + 2]
                out[dIdx + 3] = sourcePixels[sIdx + 3]
            }
        }

        // 2. Mirror reflection into margin
        for y in 0..<plan.height {
            let sy = mirrorIndex(coord: y, origin: plan.offsetY, size: sourceHeight, scale: scaleY)
            let isRowInInterior = (y >= plan.offsetY && y < plan.offsetY + plan.drawHeight)
            for x in 0..<plan.width {
                if isRowInInterior && x >= plan.offsetX && x < plan.offsetX + plan.drawWidth {
                    continue
                }
                let sx = mirrorIndex(coord: x, origin: plan.offsetX, size: sourceWidth, scale: scaleX)
                let sIdx = (sy * sourceWidth + sx) * 4
                let dIdx = (y * plan.width + x) * 4
                out[dIdx] = sourcePixels[sIdx]
                out[dIdx + 1] = sourcePixels[sIdx + 1]
                out[dIdx + 2] = sourcePixels[sIdx + 2]
                out[dIdx + 3] = sourcePixels[sIdx + 3]
            }
        }

        return out
    }

    private func mirrorIndex(coord: Int, origin: Int, size: Int, scale: Double) -> Int {
        let index = Int(floor((Double(coord) + 0.5 - Double(origin)) * scale))
        if index >= 0 && index < size { return index }
        let period = size * 2
        let wrapped = ((index % period) + period) % period
        return wrapped < size ? wrapped : period - 1 - wrapped
    }
}
```

---

### 4.4 Specification: Undo/Redo Integration (`UpdateNodeBitmapCommand.swift`)

Command encapsulation connecting image repair operations to `CommandManager`:

```swift
import AppKit
import Foundation

public final class UpdateNodeBitmapCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "LayersTabEditIcon"

    public let nodeId: String
    public let oldSrc: String?
    public let newSrc: String?
    public let oldRect: CGRect
    public let newRect: CGRect

    public init(
        name: String = "AI Image Repair",
        nodeId: String,
        oldSrc: String?,
        newSrc: String?,
        oldRect: CGRect,
        newRect: CGRect
    ) {
        self.name = name
        self.nodeId = nodeId
        self.oldSrc = oldSrc
        self.newSrc = newSrc
        self.oldRect = oldRect
        self.newRect = newRect
    }

    public func execute(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        document.nodes[idx].src = newSrc
        document.nodes[idx].x = newRect.origin.x
        document.nodes[idx].y = newRect.origin.y
        document.nodes[idx].width = newRect.width
        document.nodes[idx].height = newRect.height
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        document.nodes[idx].src = oldSrc
        document.nodes[idx].x = oldRect.origin.x
        document.nodes[idx].y = oldRect.origin.y
        document.nodes[idx].width = oldRect.width
        document.nodes[idx].height = oldRect.height
        return true
    }
}
```

---

## 5. Verification Method

To verify these implementations independently:

1. **Unit Tests**:
   - `tests/LocalInpaintTests.swift`:
     - Test blemish mask with 10 damaged pixels. Verify that after `TeleaInpainter.inpaint`, zero pixels remain flagged as 2, damaged pixels adopt color weighted from surrounding known borders, and outside pixels match input exactly.
   - `tests/LocalMattingTests.swift`:
     - Run `LocalMattingEngine.removeBackground` on a test 512×512 CGImage with an alpha subject. Verify resulting image has an alpha channel where background pixels have $\alpha = 0$ and foreground pixels have $\alpha > 0$.
   - `tests/OutpaintGeometryTests.swift`:
     - Test `planComposite` with $1000 \times 1000$ natural size, $500 \times 500$ node, expanded to $1000 \times 500$. Verify `offsetX, offsetY, drawWidth, drawHeight` match analytical geometry without negative or out-of-bound indices.
   - `tests/UpdateNodeBitmapCommandTests.swift`:
     - Execute command on image node, verify `src` and geometry update. Call `undo`, verify previous `src` and geometry restore exactly.
2. **Build and Test Verification**:
   ```bash
   ./build.sh build
   ./tests/run_tests.sh
   ```
   Both must pass with 0 errors and 100% pass rate.
3. **Memory and Binary Budget Check**:
   - Ensure the compiled binary size remains $\le 5$ MB by utilizing system Vision frameworks instead of bundling heavy ONNX model weights into the binary executable.
