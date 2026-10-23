//
//  ImageImporter.swift
//  native_studio
//
//  Image import pipeline: reads PNG/JPG/WebP/GIF/TIFF files, embeds them as a
//  self-contained base64 data URL inside the document and returns a VOONode
//  ready to be inserted through the undo stack.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// MARK: - Import Errors

public enum ImageImportError: LocalizedError {
    case unreadable
    case unsupportedType
    case tooLarge(Int)
    case decodeFailed

    public var errorDescription: String? {
        switch self {
        case .unreadable: return "无法读取图片文件。"
        case .unsupportedType: return "不支持的图片格式（支持 PNG / JPG / WebP / GIF / TIFF）。"
        case .tooLarge(let bytes): return "图片过大（\(bytes / 1_048_576) MB），请使用小于 12 MB 的文件。"
        case .decodeFailed: return "图片解码失败。"
        }
    }
}

// MARK: - Image Importer

public final class ImageImporter {

    public static let shared = ImageImporter()

    /// Maximum embedded payload (12 MB) to keep `.voo` documents portable.
    public static let maximumEmbeddedBytes = 12 * 1_048_576

    public struct ImportResult {
        public let node: VOONode
        public let naturalSize: CGSize
        public let embeddedBytes: Int
    }

    private init() {}

    // MARK: Public API

    /// Builds an image node for a file on disk, scaled down to fit the canvas.
    public func makeNode(from url: URL, canvas: CanvasFrame, existingImageCount: Int = 0) throws -> ImportResult {
        guard let data = try? Data(contentsOf: url) else { throw ImageImportError.unreadable }
        let baseName = url.deletingPathExtension().lastPathComponent
        return try makeNode(from: data, name: baseName, fileExtension: url.pathExtension,
                            canvas: canvas, existingImageCount: existingImageCount)
    }

    /// Builds an image node from raw image data (file, drag & drop or clipboard).
    public func makeNode(from data: Data, name: String, fileExtension: String? = nil,
                         canvas: CanvasFrame, existingImageCount: Int = 0) throws -> ImportResult {
        guard data.count <= Self.maximumEmbeddedBytes else {
            throw ImageImportError.tooLarge(data.count)
        }
        guard let image = NSImage(data: data), image.size.width > 0, image.size.height > 0 else {
            throw ImageImportError.decodeFailed
        }
        let type = self.mimeType(for: data, fileExtension: fileExtension)
        let dataURL = "data:\(type);base64,\(data.base64EncodedString())"

        let natural = image.size
        let target = Self.fittedRect(naturalSize: natural, canvas: canvas)

        let displayName = name.isEmpty
            ? "Image \(existingImageCount + 1)"
            : "\(name) \(existingImageCount + 1)"

        let node = VOONode(
            id: UUID().uuidString,
            kind: .image,
            name: displayName,
            x: target.origin.x,
            y: target.origin.y,
            width: target.width,
            height: target.height,
            style: LayerStyle(fill: "none", stroke: "none", strokeWidth: 0.0),
            src: dataURL,
            imageId: UUID().uuidString
        )
        return ImportResult(node: node, naturalSize: natural, embeddedBytes: data.count)
    }

    /// NSOpenPanel wrapper used by File ▸ Import Image…
    public func promptImport(window: NSWindow?, completion: @escaping (Result<URL, Error>) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.png, .jpeg, .gif, .tiff, .webP, .heic, .bmp]
        panel.prompt = "导入 (Import)"
        panel.message = "选择要导入到画布中的图片"

        let handle: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .OK, let url = panel.url else {
                completion(.failure(ImageImportError.unreadable))
                return
            }
            completion(.success(url))
        }
        if let window {
            panel.beginSheetModal(for: window, completionHandler: handle)
        } else {
            handle(panel.runModal())
        }
    }

    // MARK: Helpers

    /// Decodes a `data:image/...;base64,...` URL into a CGImage (shared by the
    /// canvas renderer and the export engine).
    public static func cgImage(fromDataURL source: String) -> CGImage? {
        guard let comma = source.firstIndex(of: ",") else { return nil }
        let header = String(source[source.startIndex..<comma])
        guard header.contains(";base64") else { return nil }
        let payload = String(source[source.index(after: comma)...])
        guard let data = Data(base64Encoded: payload, options: [.ignoreUnknownCharacters]) else { return nil }
        return cgImage(from: data)
    }

    public static func cgImage(from data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
        return image
    }

    /// Fits an image inside the canvas (max 60% of canvas width/height), centered.
    public static func fittedRect(naturalSize: CGSize, canvas: CanvasFrame) -> CGRect {
        let maxWidth = max(canvas.width * 0.6, 64)
        let maxHeight = max(canvas.height * 0.6, 64)
        let scale = min(1.0, min(maxWidth / max(naturalSize.width, 1),
                                 maxHeight / max(naturalSize.height, 1)))
        let width = max(naturalSize.width * scale, 1)
        let height = max(naturalSize.height * scale, 1)
        return CGRect(
            x: canvas.x + (canvas.width - width) / 2.0,
            y: canvas.y + (canvas.height - height) / 2.0,
            width: width,
            height: height
        )
    }

    private func mimeType(for data: Data, fileExtension: String?) -> String {
        if let source = CGImageSourceCreateWithData(data as CFData, nil),
           let typeID = CGImageSourceGetType(source) as String?,
           let utType = UTType(typeID) {
            if utType.conforms(to: .jpeg) { return "image/jpeg" }
            if utType.conforms(to: .png) { return "image/png" }
            if utType.conforms(to: .gif) { return "image/gif" }
            if utType.conforms(to: .webP) { return "image/webp" }
            if utType.conforms(to: .tiff) { return "image/tiff" }
            if utType.conforms(to: .heic) { return "image/heic" }
        }
        switch fileExtension?.lowercased() {
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "tif", "tiff": return "image/tiff"
        case "heic": return "image/heic"
        default: return "image/png"
        }
    }
}
