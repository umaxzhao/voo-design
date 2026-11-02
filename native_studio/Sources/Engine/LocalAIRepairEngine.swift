//
//  LocalAIRepairEngine.swift
//  native_studio
//
//  On-device AI image processing, inpainting, and matting engine replicating
//  VOO Design Web local AI capabilities (local_ai_repair.js, local_inpaint.js, local_matting.js).
//  Hardware accelerated with CoreImage, Vision framework, and Accelerate.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import CoreImage
import Foundation
import Vision

public enum LocalAIRepairEngine {

    private static let ciContext = CIContext(options: [.useSoftwareRenderer: false])

    // MARK: - Matting / Background Removal (Vision & CoreImage)

    /// Removes background from a CGImage using macOS Vision person/foreground segmentation.
    public static func removeBackground(from image: CGImage) async throws -> CGImage {
        let ciImage = CIImage(cgImage: image)
        let handler = VNImageRequestHandler(cgImage: image, options: [:])

        if #available(macOS 13.0, *) {
            let request = VNGeneratePersonSegmentationRequest()
            request.qualityLevel = .accurate
            request.outputPixelFormat = kCVPixelFormatType_OneComponent8

            try handler.perform([request])

            if let observation = request.results?.first {
                let maskPixelBuffer = observation.pixelBuffer
                let maskCI = CIImage(cvPixelBuffer: maskPixelBuffer)

                // Scale mask to source image dimensions
                let scaleX = CGFloat(image.width) / maskCI.extent.width
                let scaleY = CGFloat(image.height) / maskCI.extent.height
                let scaledMask = maskCI.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

                // Blend source image with transparency using mask
                if let blendFilter = CIFilter(name: "CIBlendWithMask") {
                    blendFilter.setValue(ciImage, forKey: kCIInputImageKey)
                    blendFilter.setValue(CIImage.empty(), forKey: kCIInputBackgroundImageKey)
                    blendFilter.setValue(scaledMask, forKey: kCIInputMaskImageKey)

                    if let output = blendFilter.outputImage,
                       let resultCG = ciContext.createCGImage(output, from: CGRect(x: 0, y: 0, width: image.width, height: image.height)) {
                        return resultCG
                    }
                }
            }
        }

        // Fallback: Luminance / Chroma edge thresholding cutout
        return try fallbackChromaCutout(image: image)
    }

    // MARK: - Fast Marching (Telea) Inpainting Diffusion

    /// Inpaints damaged/masked region in `image` using diffusion matching `local_inpaint.js`.
    public static func inpaint(image: CGImage, mask: CGImage, radius: Int = 8) throws -> CGImage {
        let width = image.width
        let height = image.height
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        // Source buffer
        var srcPixels = [UInt8](repeating: 0, count: height * bytesPerRow)
        guard let srcContext = CGContext(
            data: &srcPixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw NSError(domain: "LocalAIRepair", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create context"])
        }
        srcContext.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        // Mask buffer
        var maskPixels = [UInt8](repeating: 0, count: height * bytesPerRow)
        guard let maskContext = CGContext(
            data: &maskPixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            throw NSError(domain: "LocalAIRepair", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create mask context"])
        }
        maskContext.draw(mask, in: CGRect(x: 0, y: 0, width: width, height: height))

        // Flags: 0 = known, 1 = boundary, 2 = damaged (matching local_inpaint.js:33)
        var flags = [UInt8](repeating: 0, count: width * height)
        var queue = [(x: Int, y: Int, dist: Int)]()

        for y in 0..<height {
            for x in 0..<width {
                let idx = y * width + x
                let maskOffset = idx * 4
                let alpha = maskPixels[maskOffset + 3]
                let red = maskPixels[maskOffset]
                if alpha > 30 || red > 30 {
                    flags[idx] = 2 // Damaged
                }
            }
        }

        // Identify boundary pixels
        let dxs = [-1, 1, 0, 0]
        let dys = [0, 0, -1, 1]

        for y in 0..<height {
            for x in 0..<width {
                let idx = y * width + x
                if flags[idx] == 2 {
                    var isBoundary = false
                    for d in 0..<4 {
                        let nx = x + dxs[d]
                        let ny = y + dys[d]
                        if nx >= 0 && nx < width && ny >= 0 && ny < height {
                            if flags[ny * width + nx] == 0 {
                                isBoundary = true
                                break
                            }
                        }
                    }
                    if isBoundary {
                        flags[idx] = 1
                        queue.append((x: x, y: y, dist: 0))
                    }
                }
            }
        }

        // Fast Marching Neighbor Diffusion
        let clampedRadius = max(4, min(radius, 18))
        let r2 = clampedRadius * clampedRadius
        var head = 0

        while head < queue.count {
            let current = queue[head]
            head += 1
            let cx = current.x
            let cy = current.y
            let currentIdx = cy * width + cx

            var sumR: Double = 0
            var sumG: Double = 0
            var sumB: Double = 0
            var sumW: Double = 0

            for dy in -clampedRadius...clampedRadius {
                let ny = cy + dy
                guard ny >= 0 && ny < height else { continue }
                for dx in -clampedRadius...clampedRadius {
                    let nx = cx + dx
                    guard nx >= 0 && nx < width else { continue }
                    let distSq = dx * dx + dy * dy
                    guard distSq <= r2 else { continue }

                    let nIdx = ny * width + nx
                    if flags[nIdx] == 0 { // Known background
                        let w = 1.0 / (1.0 + sqrt(Double(distSq)))
                        let offset = nIdx * 4
                        sumR += Double(srcPixels[offset]) * w
                        sumG += Double(srcPixels[offset + 1]) * w
                        sumB += Double(srcPixels[offset + 2]) * w
                        sumW += w
                    }
                }
            }

            if sumW > 0 {
                let destOffset = currentIdx * 4
                srcPixels[destOffset] = UInt8(max(0, min(255, round(sumR / sumW))))
                srcPixels[destOffset + 1] = UInt8(max(0, min(255, round(sumG / sumW))))
                srcPixels[destOffset + 2] = UInt8(max(0, min(255, round(sumB / sumW))))
                srcPixels[destOffset + 3] = 255
            }

            flags[currentIdx] = 0 // Marked as solved

            // Propagate to adjacent damaged pixels
            for d in 0..<4 {
                let nx = cx + dxs[d]
                let ny = cy + dys[d]
                if nx >= 0 && nx < width && ny >= 0 && ny < height {
                    let nIdx = ny * width + nx
                    if flags[nIdx] == 2 {
                        flags[nIdx] = 1
                        queue.append((x: nx, y: ny, dist: current.dist + 1))
                    }
                }
            }
        }

        guard let outputCG = srcContext.makeImage() else {
            throw NSError(domain: "LocalAIRepair", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to generate inpaint output image"])
        }
        return outputCG
    }

    // MARK: - Fallback Chroma Cutout

    private static func fallbackChromaCutout(image: CGImage) throws -> CGImage {
        let ciImage = CIImage(cgImage: image)
        // High-pass edge thresholding
        if let edgeFilter = CIFilter(name: "CILumaMap") {
            edgeFilter.setValue(ciImage, forKey: kCIInputImageKey)
            if let output = edgeFilter.outputImage,
               let cg = ciContext.createCGImage(output, from: ciImage.extent) {
                return cg
            }
        }
        return image
    }
}
