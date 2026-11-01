import CoreGraphics
import Foundation

extension VOONode {
    enum CodingKeys: String, CodingKey, CaseIterable {
        case id, parentId, kind, name, x, y, width, height, rotation, shear, isFrame,
            nativePathCoordinates
        case style, cornerRadii, cornerRadius, lockRatio, points
        case text, fontSize, fontFamily, fontWeight, textAlign, lineHeight, letterSpacing
        case italic, underline, boxWidth, booleanOperation, clipTo, maskId
        case fillVariableId, strokeVariableId, adjustments, effects, src, imageId, paint, childIds,
            constraints
        // Web flat style keys:
        case fill, stroke, strokeWidth, opacity, blendMode, visible, locked
        case strokeCap, strokeJoin, strokeMiterLimit, strokeDash, strokeAlign, fillOpacity,
            strokeOpacity
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let raw = try [String: PortableJSONValue](from: decoder)
        let known = Set(CodingKeys.allCases.map { $0.rawValue })
        portableProperties = raw.filter { !known.contains($0.key) }

        self.id = (try? container.decode(String.self, forKey: .id)) ?? UUID().uuidString
        self.parentId = try? container.decodeIfPresent(String.self, forKey: .parentId)

        // Kind
        if let directKind = try? container.decode(NodeKind.self, forKey: .kind) {
            self.kind = directKind
        } else if let kindStr = try? container.decode(String.self, forKey: .kind),
            let parsed = NodeKind(rawValue: kindStr.lowercased())
        {
            self.kind = parsed
        } else {
            throw DecodingError.dataCorruptedError(
                forKey: .kind, in: container, debugDescription: "Unsupported node kind")
        }

        if try container.decodeIfPresent(Bool.self, forKey: .isFrame) == true { self.kind = .frame }
        self.name = (try? container.decode(String.self, forKey: .name)) ?? "Layer"

        self.x = try container.decodeIfPresent(FlexibleNumber.self, forKey: .x)?.cgFloatValue ?? 0
        self.y = try container.decodeIfPresent(FlexibleNumber.self, forKey: .y)?.cgFloatValue ?? 0
        self.width = max(
            (try container.decodeIfPresent(FlexibleNumber.self, forKey: .width)?.cgFloatValue ?? 100),
            0.001)
        self.height = max(
            (try container.decodeIfPresent(FlexibleNumber.self, forKey: .height)?.cgFloatValue
                ?? 100),
            0.001)

        self.rotation =
            (try? container.decode(FlexibleNumber.self, forKey: .rotation))?.cgFloatValue ?? 0
        self.shear = (try? container.decode(FlexibleNumber.self, forKey: .shear))?.cgFloatValue ?? 0

        // Style: nested or flat
        if let directStyle = try? container.decode(LayerStyle.self, forKey: .style) {
            self.style = directStyle
        } else {
            let fill = (try? container.decode(String.self, forKey: .fill)) ?? "#262626"
            let stroke = (try? container.decode(String.self, forKey: .stroke)) ?? "none"
            let strokeWidth =
                (try? container.decode(FlexibleNumber.self, forKey: .strokeWidth))?.cgFloatValue
                ?? 0
            let opacity =
                (try? container.decode(FlexibleNumber.self, forKey: .opacity))?.cgFloatValue ?? 1.0
            let blendMode =
                (try? container.decode(String.self, forKey: .blendMode)) ?? "source-over"
            let visible =
                (try? container.decode(FlexibleBool.self, forKey: .visible))?.boolValue ?? true
            let locked =
                (try? container.decode(FlexibleBool.self, forKey: .locked))?.boolValue ?? false

            var st = LayerStyle(
                fill: fill,
                stroke: stroke,
                strokeWidth: strokeWidth,
                opacity: opacity,
                blendMode: blendMode,
                visible: visible,
                locked: locked
            )
            st.strokeCap = try? container.decodeIfPresent(String.self, forKey: .strokeCap)
            st.strokeJoin = try? container.decodeIfPresent(String.self, forKey: .strokeJoin)
            st.strokeMiterLimit =
                (try? container.decode(FlexibleNumber.self, forKey: .strokeMiterLimit))?
                .cgFloatValue
            if let dash = raw["strokeDash"]?.string {
                switch dash {
                case "dashed": st.strokeDash = [8, 4]
                case "dotted": st.strokeDash = [1, 3]
                default: st.strokeDash = nil
                }
                portableProperties["strokeDash"] = .string(dash)
            } else {
                st.strokeDash = try container.decodeIfPresent([CGFloat].self, forKey: .strokeDash)
            }
            st.strokeAlign = try? container.decodeIfPresent(String.self, forKey: .strokeAlign)
            st.fillOpacity =
                (try? container.decode(FlexibleNumber.self, forKey: .fillOpacity))?.cgFloatValue
            st.strokeOpacity =
                (try? container.decode(FlexibleNumber.self, forKey: .strokeOpacity))?.cgFloatValue
            self.style = st
        }

        // Corner radius
        if let directRadii = try? container.decodeIfPresent(CornerRadii.self, forKey: .cornerRadii)
        {
            self.cornerRadii = directRadii
        } else if let cr = (try? container.decode(FlexibleNumber.self, forKey: .cornerRadius))?
            .cgFloatValue
        {
            self.cornerRadii = CornerRadii(uniform: cr)
        } else {
            self.cornerRadii = nil
        }

        self.lockRatio = (try? container.decode(FlexibleBool.self, forKey: .lockRatio))?.boolValue
        self.points = try container.decodeIfPresent([PenAnchor].self, forKey: .points)
        let pathSpace = try container.decodeIfPresent(String.self, forKey: .nativePathCoordinates)
        let localPath = !container.contains(.style) || pathSpace == "local"
        if kind == .path, localPath, let points {
            self.points = points.map { [x, y] in $0.translatedBy(dx: x, dy: y) }
        }

        // Text
        self.text = try? container.decodeIfPresent(FlexibleString.self, forKey: .text)?.stringValue
        self.fontSize =
            (try? container.decode(FlexibleNumber.self, forKey: .fontSize))?.cgFloatValue
        self.fontFamily = try? container.decodeIfPresent(String.self, forKey: .fontFamily)
        self.fontWeight = try? container.decodeIfPresent(FlexibleString.self, forKey: .fontWeight)?
            .stringValue
        self.textAlign = try? container.decodeIfPresent(String.self, forKey: .textAlign)
        self.lineHeight =
            (try? container.decode(FlexibleNumber.self, forKey: .lineHeight))?.cgFloatValue
        self.letterSpacing =
            (try? container.decode(FlexibleNumber.self, forKey: .letterSpacing))?.cgFloatValue
        self.italic = (try? container.decode(FlexibleBool.self, forKey: .italic))?.boolValue
        self.underline = (try? container.decode(FlexibleBool.self, forKey: .underline))?.boolValue
        self.boxWidth =
            (try? container.decode(FlexibleNumber.self, forKey: .boxWidth))?.cgFloatValue
        self.booleanOperation = try? container.decodeIfPresent(
            String.self, forKey: .booleanOperation)
        self.clipTo = try? container.decodeIfPresent(String.self, forKey: .clipTo)
        self.maskId = try? container.decodeIfPresent(String.self, forKey: .maskId)
        self.fillVariableId = try? container.decodeIfPresent(String.self, forKey: .fillVariableId)
        self.strokeVariableId = try? container.decodeIfPresent(
            String.self, forKey: .strokeVariableId)
        self.adjustments = try? container.decodeIfPresent(
            LayerAdjustments.self, forKey: .adjustments)
        self.effects = try? container.decodeIfPresent(LayerEffects.self, forKey: .effects)
        // Preserve unsupported web effect/adjustment representations verbatim.
        if let value = raw["effects"],
            try effects.map({ try PortableJSONValue.encoded($0) }) != value
        {
            portableProperties["effects"] = value
        }
        if adjustments == nil, let value = raw["adjustments"] {
            portableProperties["adjustments"] = value
        }
        self.src = try? container.decodeIfPresent(String.self, forKey: .src)
        self.imageId = try? container.decodeIfPresent(String.self, forKey: .imageId)
        self.paint = (try? container.decode(FlexibleBool.self, forKey: .paint))?.boolValue
        self.childIds = try? container.decodeIfPresent([String].self, forKey: .childIds)
        self.constraints = try? container.decodeIfPresent(
            NodeConstraints.self, forKey: .constraints)
        if let fills = raw["fills"]?.array {
            if fills.isEmpty {
                self.style.fill = "transparent"
            } else if let primary = fills.first?.object {
                self.style.fill = primary["fill"]?.string ?? self.style.fill
                self.style.fillOpacity = CGFloat(primary["opacity"]?.nativeNumber ?? 1)
            }
        }
    }

    public func encode(to encoder: Encoder) throws {
        var portable = encoder.container(keyedBy: PortableCodingKey.self)
        for (key, value) in portableProperties {
            try portable.encode(value, forKey: PortableCodingKey(key))
        }
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(parentId, forKey: .parentId)
        try container.encode(kind == .frame ? NodeKind.group : kind, forKey: .kind)
        if kind == .frame { try container.encode(true, forKey: .isFrame) }
        try container.encode(name, forKey: .name)
        try container.encode(x, forKey: .x)
        try container.encode(y, forKey: .y)
        try container.encode(width, forKey: .width)
        try container.encode(height, forKey: .height)
        try container.encode(rotation, forKey: .rotation)
        try container.encode(shear, forKey: .shear)
        try container.encode(style, forKey: .style)
        try container.encode(style.fill, forKey: .fill)
        try container.encode(style.stroke, forKey: .stroke)
        try container.encode(style.strokeWidth, forKey: .strokeWidth)
        try container.encode(style.opacity, forKey: .opacity)
        try container.encode(style.blendMode, forKey: .blendMode)
        try container.encode(style.visible, forKey: .visible)
        try container.encode(style.locked, forKey: .locked)
        try container.encodeIfPresent(style.fillOpacity, forKey: .fillOpacity)
        try container.encodeIfPresent(style.strokeOpacity, forKey: .strokeOpacity)
        try container.encodeIfPresent(style.strokeCap, forKey: .strokeCap)
        try container.encodeIfPresent(style.strokeJoin, forKey: .strokeJoin)
        try container.encodeIfPresent(style.strokeMiterLimit, forKey: .strokeMiterLimit)
        if portableProperties["strokeDash"]?.string != nil {
            if let dash = style.strokeDash {
                try container.encode(dash, forKey: .strokeDash)
            } else {
                try container.encode("solid", forKey: .strokeDash)
            }
        } else {
            try container.encodeIfPresent(style.strokeDash, forKey: .strokeDash)
        }
        try container.encodeIfPresent(style.strokeAlign, forKey: .strokeAlign)
        try container.encodeIfPresent(cornerRadii, forKey: .cornerRadii)
        try container.encodeIfPresent(lockRatio, forKey: .lockRatio)
        if let points {
            let local = kind == .path ? points.map { $0.translatedBy(dx: -x, dy: -y) } : points
            try container.encode(local, forKey: .points)
            try container.encode("local", forKey: .nativePathCoordinates)
        }
        try container.encodeIfPresent(text, forKey: .text)
        try container.encodeIfPresent(fontSize, forKey: .fontSize)
        try container.encodeIfPresent(fontFamily, forKey: .fontFamily)
        try container.encodeIfPresent(fontWeight, forKey: .fontWeight)
        try container.encodeIfPresent(textAlign, forKey: .textAlign)
        try container.encodeIfPresent(lineHeight, forKey: .lineHeight)
        try container.encodeIfPresent(letterSpacing, forKey: .letterSpacing)
        try container.encodeIfPresent(italic, forKey: .italic)
        try container.encodeIfPresent(underline, forKey: .underline)
        try container.encodeIfPresent(boxWidth, forKey: .boxWidth)
        try container.encodeIfPresent(booleanOperation, forKey: .booleanOperation)
        try container.encodeIfPresent(clipTo, forKey: .clipTo)
        try container.encodeIfPresent(maskId, forKey: .maskId)
        try container.encodeIfPresent(fillVariableId, forKey: .fillVariableId)
        try container.encodeIfPresent(strokeVariableId, forKey: .strokeVariableId)
        try container.encodeIfPresent(adjustments, forKey: .adjustments)
        try container.encodeIfPresent(portableEffects(), forKey: .effects)
        try container.encodeIfPresent(src, forKey: .src)
        try container.encodeIfPresent(imageId, forKey: .imageId)
        try container.encodeIfPresent(paint, forKey: .paint)
        try container.encodeIfPresent(childIds, forKey: .childIds)
        try container.encodeIfPresent(constraints, forKey: .constraints)
    }
}
