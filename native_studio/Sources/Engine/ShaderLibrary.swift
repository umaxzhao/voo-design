//
//  ShaderLibrary.swift
//  native_studio
//
//  Embedded Metal Shading Language source and compute kernels for
//  VOO Design Native Studio (Milestone M3).
//

import Foundation

public enum ShaderLibrary {
    /// W3C Level 1 Compositing & Blending compute kernel source.
    public static let blendLayersMSL: String = """
    #include <metal_stdlib>
    using namespace metal;

    // Rec. 601 / Rec. 709 Luma weighting coefficients per W3C specification
    inline float lum(float3 c) {
        return 0.30 * c.r + 0.59 * c.g + 0.11 * c.b;
    }

    // Gamut Clamping: Preserves luminosity while bringing out-of-gamut primaries back to [0, 1]
    inline float3 clipColor(float3 c) {
        float l = lum(c);
        float n = min(min(c.r, c.g), c.b);
        float x = max(max(c.r, c.g), c.b);
        if (n < 0.0) {
            c = l + (((c - l) * l) / max(0.0001, l - n));
        }
        if (x > 1.0) {
            c = l + (((c - l) * (1.0 - l)) / max(0.0001, x - l));
        }
        return c;
    }

    // Replaces luminance while preserving hue and saturation
    inline float3 setLum(float3 c, float l) {
        float d = l - lum(c);
        return clipColor(c + d);
    }

    // Saturation: spread between maximum and minimum RGB primaries
    inline float sat(float3 c) {
        return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    }

    // Replaces saturation
    inline float3 setSat(float3 c, float s) {
        float minVal = min(min(c.r, c.g), c.b);
        float maxVal = max(max(c.r, c.g), c.b);
        if (maxVal > minVal) {
            c = (c - minVal) * s / (maxVal - minVal);
        } else {
            c = float3(0.0);
        }
        return c;
    }

    // Separable blend channel functions
    inline float blendOverlayChannel(float b, float s) {
        return (b < 0.5) ? (2.0 * b * s) : (1.0 - 2.0 * (1.0 - b) * (1.0 - s));
    }

    inline float blendColorDodgeChannel(float b, float s) {
        if (b <= 0.0) return 0.0;
        if (s >= 1.0) return 1.0;
        return min(1.0, b / (1.0 - s));
    }

    inline float blendColorBurnChannel(float b, float s) {
        if (b >= 1.0) return 1.0;
        if (s <= 0.0) return 0.0;
        return 1.0 - min(1.0, (1.0 - b) / s);
    }

    // Soft Light using W3C standard Pegtop piecewise continuous D(Cb) curve at 0.25
    inline float blendSoftLightChannel(float b, float s) {
        if (s <= 0.5) {
            return b - (1.0 - 2.0 * s) * b * (1.0 - b);
        } else {
            float d = (b <= 0.25) ? (((16.0 * b - 12.0) * b + 4.0) * b) : sqrt(b);
            return b + (2.0 * s - 1.0) * (d - b);
        }
    }

    // Full 16-mode 2D compute kernel with Porter-Duff alpha compositing
    kernel void blendLayers(
        texture2d<float, access::read> baseTex [[texture(0)]],
        texture2d<float, access::read> overlayTex [[texture(1)]],
        texture2d<float, access::write> destTex [[texture(2)]],
        constant int &mode [[buffer(0)]],
        constant float &opacity [[buffer(1)]],
        uint2 gid [[thread_position_in_grid]]
    ) {
        if (gid.x >= destTex.get_width() || gid.y >= destTex.get_height()) return;
        
        float4 Cb = baseTex.read(gid);
        float4 Cs = overlayTex.read(gid);
        
        float3 Cr;
        switch (mode) {
            case 0: Cr = Cs.rgb; break; // Normal
            case 1: Cr = Cb.rgb * Cs.rgb; break; // Multiply
            case 2: Cr = Cb.rgb + Cs.rgb - Cb.rgb * Cs.rgb; break; // Screen
            case 3: Cr = float3(blendOverlayChannel(Cb.r, Cs.r), blendOverlayChannel(Cb.g, Cs.g), blendOverlayChannel(Cb.b, Cs.b)); break; // Overlay
            case 4: Cr = min(Cb.rgb, Cs.rgb); break; // Darken
            case 5: Cr = max(Cb.rgb, Cs.rgb); break; // Lighten
            case 6: Cr = float3(blendColorDodgeChannel(Cb.r, Cs.r), blendColorDodgeChannel(Cb.g, Cs.g), blendColorDodgeChannel(Cb.b, Cs.b)); break; // Color Dodge
            case 7: Cr = float3(blendColorBurnChannel(Cb.r, Cs.r), blendColorBurnChannel(Cb.g, Cs.g), blendColorBurnChannel(Cb.b, Cs.b)); break; // Color Burn
            case 8: Cr = float3(blendOverlayChannel(Cs.r, Cb.r), blendOverlayChannel(Cs.g, Cb.g), blendOverlayChannel(Cs.b, Cb.b)); break; // Hard Light
            case 9: Cr = float3(blendSoftLightChannel(Cb.r, Cs.r), blendSoftLightChannel(Cb.g, Cs.g), blendSoftLightChannel(Cb.b, Cs.b)); break; // Soft Light
            case 10: Cr = abs(Cb.rgb - Cs.rgb); break; // Difference
            case 11: Cr = Cb.rgb + Cs.rgb - 2.0 * Cb.rgb * Cs.rgb; break; // Exclusion
            case 12: Cr = setLum(setSat(Cs.rgb, sat(Cb.rgb)), lum(Cb.rgb)); break; // Hue
            case 13: Cr = setLum(setSat(Cb.rgb, sat(Cs.rgb)), lum(Cb.rgb)); break; // Saturation
            case 14: Cr = setLum(Cs.rgb, lum(Cb.rgb)); break; // Color
            case 15: Cr = setLum(Cb.rgb, lum(Cs.rgb)); break; // Luminosity
            default: Cr = Cs.rgb; break;
        }
        
        float alpha = Cs.a * opacity;
        float outAlpha = Cb.a + alpha * (1.0 - Cb.a);
        float3 outRgb;
        if (outAlpha > 0.0001) {
            float3 blended = clamp(Cr, 0.0, 1.0);
            outRgb = ((1.0 - alpha) * Cb.a * Cb.rgb + (1.0 - Cb.a) * alpha * Cs.rgb + Cb.a * alpha * blended) / outAlpha;
        } else {
            outRgb = float3(0.0);
        }
        destTex.write(float4(clamp(outRgb, 0.0, 1.0), clamp(outAlpha, 0.0, 1.0)), gid);
    }
    """

    /// Compute kernel for dynamic nozzle radial falloff and flow accumulation.
    public static let brushKernelSource: String = """
    #include <metal_stdlib>
    using namespace metal;

    kernel void applyBrushDab(
        texture2d<float, access::read_write> canvasTex [[texture(0)]],
        constant float2 &center [[buffer(0)]],
        constant float &radius [[buffer(1)]],
        constant float &hardness [[buffer(2)]],
        constant float &flow [[buffer(3)]],
        constant float &opacity [[buffer(4)]],
        constant float4 &color [[buffer(5)]],
        uint2 gid [[thread_position_in_grid]]
    ) {
        if (gid.x >= canvasTex.get_width() || gid.y >= canvasTex.get_height()) return;
        
        float2 pos = float2(gid) + 0.5;
        float d = distance(pos, center);
        if (d > radius) return;
        
        float norm = d / max(0.5, radius);
        float dabAlpha = 1.0;
        if (hardness < 0.99) {
            if (norm > hardness) {
                float t = (norm - hardness) / max(0.0001, 1.0 - hardness);
                float smooth = t * t * (3.0 - 2.0 * t);
                dabAlpha = max(0.0, 1.0 - smooth);
            }
        }
        
        float4 current = canvasTex.read(gid);
        float deltaAlpha = dabAlpha * flow * (opacity - current.a);
        if (deltaAlpha > 0.0001) {
            float newAlpha = min(opacity, current.a + deltaAlpha);
            canvasTex.write(float4(color.rgb, newAlpha), gid);
        }
    }
    """

    public static var allKernelsSource: String {
        return blendLayersMSL + "\n" + brushKernelSource
    }
}
