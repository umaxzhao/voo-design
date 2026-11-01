#if INTEGRATED
    import AppKit
    import Foundation

    public enum PortableParityTests {
        public static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 2, feature: "Native-Portability",
                name: "test_FormTextImportPreservesWebAlignmentAndTypographyPrecision"
            ) {
                let root = URL(fileURLWithPath: #filePath)
                    .deletingLastPathComponent().deletingLastPathComponent()
                    .deletingLastPathComponent()
                let document = try DocumentIO.shared.loadDocument(
                    from: root.appendingPathComponent("docs/examples/form-poster.voo"))
                guard let number = document.nodes.first(where: { $0.name == "Number" }),
                    let edition = document.nodes.first(where: { $0.name == "Edition" })
                else {
                    throw TestFailure(
                        message: "FORM text fixtures missing", file: #file, line: #line)
                }
                try TestAssertions.assertEqual(number.textAlign, "right")
                try TestAssertions.assertEqual(edition.textAlign, "right")
                try TestAssertions.assertEqual(number.fontWeight, "600")
                try TestAssertions.assertApproxEqual(number.lineHeight ?? 0, 1.25)
                try TestAssertions.assertEqual(
                    TextStyleResolver.paragraphStyle(for: number).alignment, .right)
            }
            registry.register(
                tier: 2, feature: "Native-Portability",
                name: "test_WebAlignmentWinsLegacyAliasAndEditsKeepBothSerializedFieldsInSync"
            ) {
                let payload = ##"""
                    {"nodes":[{"kind":"text","align":"right","textAlign":"left",
                      "fontWeight":600,"lineHeight":1.25,"letterSpacing":0.25,
                      "paragraphSpacing":17,"baselineShift":3}]}
                    """##
                var document = try VOODocument.deserialize(from: Data(payload.utf8))
                try TestAssertions.assertEqual(document.nodes[0].textAlign, "right")
                try TestAssertions.assertNil(document.nodes[0].portableProperties["align"])
                document.nodes[0].textAlign = "center"
                let serialized = try document.serializeToJSON()
                let output = try JSONDecoder().decode(PortableJSONValue.self, from: serialized)
                let node = output.object!["nodes"]!.array![0].object!
                try TestAssertions.assertEqual(node["align"], .string("center"))
                try TestAssertions.assertEqual(node["textAlign"], .string("center"))
                try TestAssertions.assertEqual(node["lineHeight"], .number(1.25))
                try TestAssertions.assertEqual(node["paragraphSpacing"], .number(17))
                try TestAssertions.assertEqual(node["baselineShift"], .number(3))
                let restored = try VOODocument.deserialize(from: serialized).nodes[0]
                try TestAssertions.assertEqual(restored.textAlign, "center")
                try TestAssertions.assertEqual(restored.fontWeight, "600")
                try TestAssertions.assertApproxEqual(restored.letterSpacing ?? 0, 0.25)
            }
            registry.register(
                tier: 2, feature: "Native-Portability",
                name: "test_LegacyNativeTextAlignmentStillLoadsWithoutWebAlias"
            ) {
                let payload = ##"{"nodes":[{"kind":"text","textAlign":"center"}]}"##
                let node = try VOODocument.deserialize(from: Data(payload.utf8)).nodes[0]
                try TestAssertions.assertEqual(node.textAlign, "center")
            }
            registry.register(
                tier: 2, feature: "Native-Portability",
                name: "test_PortableEnvelopePreservesPagesPaintsAndUnknownProperties"
            ) {
                let payload = ##"""
                    {
                      "format": "voo-editor",
                      "version": 2,
                      "kind": "design",
                      "assets": {},
                      "document": {
                        "canvasId": "page-a",
                        "width": 400,
                        "height": 300,
                        "backgroundColor": "transparent",
                        "pages": [
                          {
                            "id": "page-a",
                            "label": "Page A",
                            "sceneDoc": {
                              "nodes": []
                            }
                          }
                        ],
                        "nodes": [
                          {
                            "id": "frame",
                            "kind": "group",
                            "isFrame": true,
                            "name": "Board",
                            "x": 0,
                            "y": 0,
                            "width": 400,
                            "height": 300,
                            "fill": "#FFFFFF",
                            "clipContent": true,
                            "fills": [
                              {
                                "fill": "#FFFFFF",
                                "opacity": 0.5
                              }
                            ],
                            "futureProperty": {
                              "value": 17
                            }
                          }
                        ]
                      }
                    }
                    """##
                var document = try VOODocument.deserialize(from: Data(payload.utf8))
                try TestAssertions.assertEqual(document.title, "Page A")
                try TestAssertions.assertEqual(document.nodes.first?.kind, .frame)
                try TestAssertions.assertEqual(
                    document.nodes.first?.portableProperties["clipContent"], .bool(true))
                document.nodes[0].x = 24
                let data = try document.serializeToJSON()
                let output = try JSONDecoder().decode(PortableJSONValue.self, from: data).object!
                let node = output["nodes"]!.array![0].object!
                try TestAssertions.assertEqual(
                    node["futureProperty"], .object(["value": .number(17)]))
                try TestAssertions.assertNotNil(node["fills"])
                let scene = output["pages"]!.array![0].object!["sceneDoc"]!.object!
                try TestAssertions.assertEqual(scene["nodes"]!.array![0].object!["x"], .number(24))
                try TestAssertions.assertEqual(
                    try VOODocument.deserialize(from: data).nodes.first?.kind, .frame)
            }
            registry.register(
                tier: 2, feature: "Native-Portability",
                name: "test_PrimaryPaintEditsPreserveSecondaryPaintsAndWebEffects"
            ) {
                let payload =
                    ##"{"nodes":[{"kind":"rect","strokeDash":"solid","fill":"#FF0000","fills":[{"id":"primary","fill":"#FF0000","opacity":0.5},{"id":"secondary","fill":"#0000FF"}],"effects":[{"kind":"shadow","x":2,"visible":true}]}]}"##
                var document = try VOODocument.deserialize(from: Data(payload.utf8))
                document.nodes[0].style.fill = "#00FF00"
                let output = try JSONDecoder().decode(
                    PortableJSONValue.self, from: document.serializeToJSON())
                let node = output.object!["nodes"]!.array![0].object!
                let paints = node["fills"]!.array!
                try TestAssertions.assertEqual(paints[0].object!["fill"], .string("#00FF00"))
                try TestAssertions.assertEqual(paints[0].object!["opacity"], .number(0.5))
                try TestAssertions.assertEqual(paints[1].object!["fill"], .string("#0000FF"))
                try TestAssertions.assertEqual(
                    node["effects"]!.array![0].object!["kind"], .string("shadow"))
            }
            registry.register(
                tier: 2, feature: "Native-Portability",
                name: "test_PortableMalformedNodesAndGeometryFailInsteadOfOpeningEmpty"
            ) {
                for payload in [
                    ##"{"width":400,"height":300,"nodes":"bad"}"##,
                    ##"{"nodes":[{"id":"bad","kind":"rect","x":"invalid","y":0,"width":20,"height":20}]}"##,
                ] {
                    do {
                        _ = try VOODocument.deserialize(from: Data(payload.utf8))
                        throw TestFailure(
                            message: "Malformed input unexpectedly loaded", file: #file, line: #line
                        )
                    } catch is DecodingError {}
                }
            }
            registry.register(
                tier: 2, feature: "Native-Portability",
                name: "test_PortableLocalPathCoordinatesRoundTripIntoWorldGeometry"
            ) {
                let payload = ##"""
                    {
                      "nodes": [
                        {
                          "id": "path",
                          "kind": "path",
                          "x": 100,
                          "y": 200,
                          "width": 40,
                          "height": 40,
                          "fill": "#FF0000",
                          "points": [
                            {
                              "x": 0,
                              "y": 0,
                              "out": [
                                10,
                                5
                              ]
                            },
                            {
                              "x": 40,
                              "y": 40,
                              "close": true
                            }
                          ]
                        }
                      ]
                    }
                    """##
                let document = try VOODocument.deserialize(from: Data(payload.utf8))
                let point = document.nodes[0].points![0]
                try TestAssertions.assertEqual(point.x, 100)
                try TestAssertions.assertEqual(point.y, 200)
                try TestAssertions.assertEqual(point.outHandle, CGPoint(x: 110, y: 205))
                let restored = try VOODocument.deserialize(from: document.serializeToJSON())
                try TestAssertions.assertEqual(restored.nodes[0].points, document.nodes[0].points)
            }
            registry.register(
                tier: 3, feature: "Native-Portability",
                name: "test_PortableBinaryAssetsHydrateAndSurviveSaveReopenAndHTML"
            ) {
                let directory = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(
                    UUID().uuidString)
                try FileManager.default.createDirectory(
                    at: directory, withIntermediateDirectories: true)
                defer { try? FileManager.default.removeItem(at: directory) }
                let context = CGContext(
                    data: nil, width: 2, height: 2, bitsPerComponent: 8,
                    bytesPerRow: 8, space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
                context.setFillColor(NSColor.red.cgColor)
                context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
                let bytes = NSBitmapImageRep(cgImage: context.makeImage()!)
                    .representation(using: .png, properties: [:])!
                var node = VOONode(id: "image", kind: .image, x: 0, y: 0, width: 40, height: 40)
                node.imageId = "asset"
                let document = VOODocument(nodes: [node])
                let binaryURL = directory.appendingPathComponent("image.voo")
                try VOOBinaryContainer.encode(
                    document: document, assets: ["asset": (data: bytes, mime: "image/png")]
                ).write(to: binaryURL)
                let loaded = try DocumentIO.shared.loadDocument(from: binaryURL)
                try TestAssertions.assertTrue(
                    loaded.nodes[0].src?.hasPrefix("data:image/png;base64,") == true)
                let savedURL = directory.appendingPathComponent("saved.voo")
                try DocumentIO.shared.saveDocument(loaded, to: savedURL)
                let restored = try DocumentIO.shared.loadDocument(from: savedURL)
                try TestAssertions.assertEqual(restored.nodes[0].src, loaded.nodes[0].src)
                let raster = NSBitmapImageRep(
                    cgImage: try ExportEngine.shared.renderImage(document: restored, scale: 1))
                let pixel = TestBitmapSampling.color(raster, x: 20, y: 20)
                try TestAssertions.assertTrue(
                    pixel.redComponent > 0.95 && pixel.greenComponent < 0.05,
                    "Reopened binary image paints real red pixels")
                try TestAssertions.assertTrue(
                    ExportEngine.shared.exportHTML(document: restored).contains(
                        "src=\"data:image/png;base64,"))
            }
            registry.register(
                tier: 1, feature: "Native-Portability",
                name: "test_NumericFontWeightsResolveToActualWeights"
            ) {
                try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "800"), .heavy)
                try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "700"), .bold)
                try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "400"), .regular)
            }
        }
    }
#endif
