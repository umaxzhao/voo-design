import { createDocument } from "../editor/scene_doc_factory.js";
import { createRectNode, createEllipseNode } from "../editor/scene_model_node_builders.js";
import { createTextNode } from "../editor/scene_model_text_effects.js";

export function createBentoLandingDoc() {
  const width = 1440;
  const height = 960;
  const doc = createDocument(width, height, "#08090C");

  const nodes = [
    // Navbar
    createRectNode({ x: 0, y: 0, width: 1440, height: 72, fill: "#0C0E14", stroke: "#1C1F28", strokeWidth: 1 }),
    createRectNode({ x: 64, y: 20, width: 32, height: 32, fill: "#8B5CF6", stroke: "#A78BFA", strokeWidth: 1 }),
    createTextNode({ x: 108, y: 26, text: "VOO FLOW", fill: "#FFFFFF", fontSize: 18 }),
    createTextNode({ x: 480, y: 28, text: "Features", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 580, y: 28, text: "Showcase", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 680, y: 28, text: "Developers", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 780, y: 28, text: "Pricing", fill: "#9CA3AF", fontSize: 13 }),
    createRectNode({ x: 1240, y: 18, width: 136, height: 36, fill: "#7C3AED", stroke: "#9333EA", strokeWidth: 1 }),
    createTextNode({ x: 1262, y: 27, text: "Get Started Free", fill: "#FFFFFF", fontSize: 12 }),

    // Hero Badge & Headings
    createRectNode({ x: 540, y: 130, width: 360, height: 32, fill: "#1F1D36", stroke: "#6D28D9", strokeWidth: 1 }),
    createTextNode({ x: 560, y: 137, text: "Next-Gen Creative Canvas 2.0 is Live", fill: "#C4B5FD", fontSize: 13 }),

    createTextNode({ x: 260, y: 190, text: "Design without boundaries.", fill: "#FFFFFF", fontSize: 56 }),
    createTextNode({ x: 380, y: 260, text: "Powered by Skia & WebAssembly.", fill: "#A78BFA", fontSize: 56 }),
    createTextNode({ x: 390, y: 340, text: "Hardware-accelerated vector canvas, real-time spatial culling,", fill: "#9CA3AF", fontSize: 18 }),
    createTextNode({ x: 480, y: 368, text: "and instant Figma-parity performance.", fill: "#9CA3AF", fontSize: 18 }),

    // Hero CTA Buttons
    createRectNode({ x: 520, y: 420, width: 180, height: 48, fill: "#7C3AED", stroke: "#8B5CF6", strokeWidth: 1 }),
    createTextNode({ x: 555, y: 434, text: "Start Creating Now", fill: "#FFFFFF", fontSize: 14 }),
    createRectNode({ x: 720, y: 420, width: 180, height: 48, fill: "#181B24", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 760, y: 434, text: "Explore Demo →", fill: "#9CA3AF", fontSize: 14 }),

    // Bento Grid Section (4 Cards)
    // Bento 1: Large Wide Block
    createRectNode({ x: 140, y: 520, width: 560, height: 380, fill: "#12141C", stroke: "#222736", strokeWidth: 1 }),
    createTextNode({ x: 170, y: 550, text: "01 / ARCHITECTURE", fill: "#8B5CF6", fontSize: 12 }),
    createTextNode({ x: 170, y: 580, text: "Zero-Lag Spatial Viewport", fill: "#FFFFFF", fontSize: 24 }),
    createTextNode({ x: 170, y: 616, text: "R-Tree accelerated viewport culling renders 50,000+ nodes at 60 FPS smoothly.", fill: "#9CA3AF", fontSize: 14 }),
    createRectNode({ x: 170, y: 660, width: 500, height: 200, fill: "#191D28", stroke: "#2A3142", strokeWidth: 1 }),
    createRectNode({ x: 200, y: 700, width: 140, height: 110, fill: "#4338CA", stroke: "#6366F1", strokeWidth: 1 }),
    createRectNode({ x: 360, y: 700, width: 140, height: 110, fill: "#3730A3", stroke: "#4F46E5", strokeWidth: 1 }),
    createRectNode({ x: 520, y: 700, width: 120, height: 110, fill: "#312E81", stroke: "#4338CA", strokeWidth: 1 }),

    // Bento 2: Right Top Block
    createRectNode({ x: 730, y: 520, width: 570, height: 180, fill: "#12141C", stroke: "#222736", strokeWidth: 1 }),
    createTextNode({ x: 760, y: 546, text: "02 / STREAMING", fill: "#10B981", fontSize: 12 }),
    createTextNode({ x: 760, y: 576, text: "Figma File Streaming Worker", fill: "#FFFFFF", fontSize: 20 }),
    createTextNode({ x: 760, y: 610, text: "Non-blocking Web Worker ingestion with zero-copy Transferable ArrayBuffers.", fill: "#9CA3AF", fontSize: 13 }),

    // Bento 3: Right Bottom Block
    createRectNode({ x: 730, y: 720, width: 570, height: 180, fill: "#12141C", stroke: "#222736", strokeWidth: 1 }),
    createTextNode({ x: 760, y: 746, text: "03 / SINGLE SURFACE", fill: "#F59E0B", fontSize: 12 }),
    createTextNode({ x: 760, y: 776, text: "Unified Single Canvas Shell", fill: "#FFFFFF", fontSize: 20 }),
    createTextNode({ x: 760, y: 810, text: "Single global Skia WebGL canvas handles thousands of artboards simultaneously.", fill: "#9CA3AF", fontSize: 13 }),
  ];

  doc.nodes = nodes;
  return doc;
}

/**
 * 4. Universal Design System & Component Starter
 */

export function createDesignSystemDoc() {
  const width = 1920;
  const height = 1080;
  const doc = createDocument(width, height, "#101216");

  const nodes = [
    // Header
    createRectNode({ x: 80, y: 60, width: 1760, height: 100, fill: "#161920", stroke: "#252A36", strokeWidth: 1 }),
    createTextNode({ x: 120, y: 90, text: "VOO Universal Design System v2.0", fill: "#FFFFFF", fontSize: 28 }),
    createTextNode({ x: 120, y: 126, text: "Foundation Tokens, Typography Scale, Color Swatches & Interactive Components", fill: "#9CA3AF", fontSize: 14 }),

    // Section 1: Color Palette Tokens
    createRectNode({ x: 80, y: 200, width: 860, height: 420, fill: "#161920", stroke: "#252A36", strokeWidth: 1 }),
    createTextNode({ x: 110, y: 230, text: "Color Token Foundations", fill: "#FFFFFF", fontSize: 18 }),

    // Primary Swatches
    createRectNode({ x: 110, y: 270, width: 120, height: 80, fill: "#7C3AED", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 110, y: 360, text: "Primary-600", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 110, y: 378, text: "#7C3AED", fill: "#6B7280", fontSize: 11 }),

    createRectNode({ x: 250, y: 270, width: 120, height: 80, fill: "#6366F1", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 250, y: 360, text: "Indigo-500", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 250, y: 378, text: "#6366F1", fill: "#6B7280", fontSize: 11 }),

    createRectNode({ x: 390, y: 270, width: 120, height: 80, fill: "#10B981", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 390, y: 360, text: "Success-500", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 390, y: 378, text: "#10B981", fill: "#6B7280", fontSize: 11 }),

    createRectNode({ x: 530, y: 270, width: 120, height: 80, fill: "#F59E0B", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 530, y: 360, text: "Warning-500", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 530, y: 378, text: "#F59E0B", fill: "#6B7280", fontSize: 11 }),

    createRectNode({ x: 670, y: 270, width: 120, height: 80, fill: "#EF4444", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 670, y: 360, text: "Danger-500", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 670, y: 378, text: "#EF4444", fill: "#6B7280", fontSize: 11 }),

    // Neutral Scale Row
    createRectNode({ x: 110, y: 420, width: 70, height: 60, fill: "#0F172A", stroke: "#334155", strokeWidth: 1 }),
    createRectNode({ x: 190, y: 420, width: 70, height: 60, fill: "#1E293B", stroke: "transparent", strokeWidth: 0 }),
    createRectNode({ x: 270, y: 420, width: 70, height: 60, fill: "#334155", stroke: "transparent", strokeWidth: 0 }),
    createRectNode({ x: 350, y: 420, width: 70, height: 60, fill: "#475569", stroke: "transparent", strokeWidth: 0 }),
    createRectNode({ x: 430, y: 420, width: 70, height: 60, fill: "#64748B", stroke: "transparent", strokeWidth: 0 }),
    createRectNode({ x: 510, y: 420, width: 70, height: 60, fill: "#94A3B8", stroke: "transparent", strokeWidth: 0 }),
    createRectNode({ x: 590, y: 420, width: 70, height: 60, fill: "#CBD5E1", stroke: "transparent", strokeWidth: 0 }),
    createRectNode({ x: 670, y: 420, width: 70, height: 60, fill: "#F1F5F9", stroke: "transparent", strokeWidth: 0 }),

    // Section 2: Typography Scale
    createRectNode({ x: 980, y: 200, width: 860, height: 420, fill: "#161920", stroke: "#252A36", strokeWidth: 1 }),
    createTextNode({ x: 1010, y: 230, text: "Typography Hierarchy Scale", fill: "#FFFFFF", fontSize: 18 }),
    createTextNode({ x: 1010, y: 276, text: "Display Bold — 48px / Line Height 56px", fill: "#FFFFFF", fontSize: 32 }),
    createTextNode({ x: 1010, y: 330, text: "Heading 1 Semibold — 32px / Tracking -0.02em", fill: "#E2E8F0", fontSize: 24 }),
    createTextNode({ x: 1010, y: 376, text: "Heading 2 Medium — 24px", fill: "#CBD5E1", fontSize: 20 }),
    createTextNode({ x: 1010, y: 418, text: "Body Regular — 15px / High legibility on dark and light surfaces", fill: "#94A3B8", fontSize: 15 }),
    createTextNode({ x: 1010, y: 456, text: "Caption / Footnote — 12px Mono uppercase for metadata", fill: "#64748B", fontSize: 12 }),

    // Section 3: Interactive UI Components (Buttons & Inputs)
    createRectNode({ x: 80, y: 660, width: 1760, height: 360, fill: "#161920", stroke: "#252A36", strokeWidth: 1 }),
    createTextNode({ x: 110, y: 690, text: "Interactive Button & Input States", fill: "#FFFFFF", fontSize: 18 }),

    // Buttons Row
    createRectNode({ x: 110, y: 730, width: 140, height: 44, fill: "#7C3AED", stroke: "#8B5CF6", strokeWidth: 1 }),
    createTextNode({ x: 144, y: 744, text: "Primary Solid", fill: "#FFFFFF", fontSize: 13 }),

    createRectNode({ x: 270, y: 730, width: 140, height: 44, fill: "#1E222D", stroke: "#333A4D", strokeWidth: 1 }),
    createTextNode({ x: 304, y: 744, text: "Secondary", fill: "#E2E8F0", fontSize: 13 }),

    createRectNode({ x: 430, y: 730, width: 140, height: 44, fill: "transparent", stroke: "#4B5563", strokeWidth: 1 }),
    createTextNode({ x: 470, y: 744, text: "Outline", fill: "#E2E8F0", fontSize: 13 }),

    createRectNode({ x: 590, y: 730, width: 140, height: 44, fill: "#DC2626", stroke: "#EF4444", strokeWidth: 1 }),
    createTextNode({ x: 624, y: 744, text: "Destructive", fill: "#FFFFFF", fontSize: 13 }),

    // Form Inputs
    createRectNode({ x: 110, y: 810, width: 320, height: 44, fill: "#111318", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 126, y: 824, text: "Enter your email address...", fill: "#6B7280", fontSize: 13 }),

    createRectNode({ x: 460, y: 810, width: 320, height: 44, fill: "#111318", stroke: "#7C3AED", strokeWidth: 2 }),
    createTextNode({ x: 476, y: 824, text: "Active input focus state |", fill: "#FFFFFF", fontSize: 13 }),
  ];

  doc.nodes = nodes;
  return doc;
}

/**
 * 5. Dark Mode Tech Pitch Deck (16:9)
 */

export function createPitchDeckDoc() {
  const width = 1920;
  const height = 1080;
  const doc = createDocument(width, height, "#07080A");

  const nodes = [
    // Top deck header indicator
    createRectNode({ x: 120, y: 80, width: 220, height: 28, fill: "#1A1A24", stroke: "#3B3A54", strokeWidth: 1 }),
    createTextNode({ x: 136, y: 87, text: "// SERIES A PITCH DECK", fill: "#A5B4FC", fontSize: 12 }),

    createTextNode({ x: 120, y: 160, text: "The Future of Vector Graphics", fill: "#FFFFFF", fontSize: 64 }),
    createTextNode({ x: 120, y: 248, text: "Built for Browser and Local-first Workflows", fill: "#818CF8", fontSize: 48 }),
    createTextNode({ x: 120, y: 340, text: "Solving the fundamental bottleneck of modern design tools: real-time performance on complex documents.", fill: "#9CA3AF", fontSize: 20 }),

    // 3 Value Proposition Columns
    createRectNode({ x: 120, y: 440, width: 520, height: 380, fill: "#12141C", stroke: "#222736", strokeWidth: 1 }),
    createTextNode({ x: 160, y: 480, text: "01", fill: "#6366F1", fontSize: 32 }),
    createTextNode({ x: 160, y: 530, text: "100x Faster Rendering", fill: "#FFFFFF", fontSize: 24 }),
    createTextNode({ x: 160, y: 574, text: "Direct WebGL Skia surface binding with hierarchical matrix transforms. Zero DOM tree overhead.", fill: "#9CA3AF", fontSize: 15 }),

    createRectNode({ x: 680, y: 440, width: 520, height: 380, fill: "#12141C", stroke: "#222736", strokeWidth: 1 }),
    createTextNode({ x: 720, y: 480, text: "02", fill: "#10B981", fontSize: 32 }),
    createTextNode({ x: 720, y: 530, text: "Lossless Figma Parity", fill: "#FFFFFF", fontSize: 24 }),
    createTextNode({ x: 720, y: 574, text: "Native Kiwi streaming decoder with zero-copy buffer transfer and instant file ingestion.", fill: "#9CA3AF", fontSize: 15 }),

    createRectNode({ x: 1240, y: 440, width: 520, height: 380, fill: "#12141C", stroke: "#222736", strokeWidth: 1 }),
    createTextNode({ x: 1280, y: 480, text: "03", fill: "#F59E0B", fontSize: 32 }),
    createTextNode({ x: 1280, y: 530, text: "Autonomous Workspace", fill: "#FFFFFF", fontSize: 24 }),
    createTextNode({ x: 1280, y: 574, text: "Unified project directory management with real-time filesystem synchronization and local offline storage.", fill: "#9CA3AF", fontSize: 15 }),

    // Bottom Stats
    createRectNode({ x: 120, y: 880, width: 1640, height: 100, fill: "#12141C", stroke: "#222736", strokeWidth: 1 }),
    createTextNode({ x: 160, y: 920, text: "$2.4M ARR Target", fill: "#FFFFFF", fontSize: 24 }),
    createTextNode({ x: 620, y: 920, text: "84% Gross Margin", fill: "#FFFFFF", fontSize: 24 }),
    createTextNode({ x: 1100, y: 920, text: "45,000+ Active Designers", fill: "#FFFFFF", fontSize: 24 }),
  ];

  doc.nodes = nodes;
  return doc;
}

/**
 * 6. Minimalist E-Commerce Store & Lookbook
 */
