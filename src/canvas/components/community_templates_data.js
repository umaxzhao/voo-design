/**
 * Curated Figma Community Style Templates.
 * Provides rich, real design documents with actual nodes, hierarchy, typography and color palettes.
 */

import { createDocument } from "../editor/scene_doc_factory.js";
import { createRectNode, createEllipseNode } from "../editor/scene_model_node_builders.js";
import { createTextNode } from "../editor/scene_model_text_effects.js";

export const COMMUNITY_CATEGORIES = [
  { id: "all", label: "welcome.community.all", count: 6 },
  { id: "dashboard", label: "welcome.community.dashboard", count: 1 },
  { id: "mobile", label: "welcome.community.mobile", count: 1 },
  { id: "landing", label: "welcome.community.landing", count: 1 },
  { id: "design-systems", label: "welcome.community.designSystems", count: 1 },
  { id: "slides", label: "welcome.community.slides", count: 1 },
  { id: "web", label: "welcome.community.web", count: 1 },
];

/**
 * 1. SaaS Analytics & Cloud Metric Dashboard
 */
function createSaasDashboardDoc() {
  const width = 1440;
  const height = 900;
  const doc = createDocument(width, height, "#0D0F12");

  const nodes = [
    // Top Bar / Header
    createRectNode({ x: 240, y: 0, width: 1200, height: 64, fill: "#13161C", stroke: "#222630", strokeWidth: 1 }),
    createTextNode({ x: 270, y: 22, text: "Platform Analytics & Overview", fill: "#FFFFFF", fontSize: 16 }),
    createRectNode({ x: 1180, y: 16, width: 100, height: 32, fill: "#1E222B", stroke: "#2E3442", strokeWidth: 1 }),
    createTextNode({ x: 1202, y: 24, text: "Last 30 Days", fill: "#9BA3AF", fontSize: 12 }),
    createRectNode({ x: 1300, y: 16, width: 110, height: 32, fill: "#6366F1", stroke: "#4F46E5", strokeWidth: 1 }),
    createTextNode({ x: 1320, y: 24, text: "+ New Report", fill: "#FFFFFF", fontSize: 12 }),

    // Sidebar
    createRectNode({ x: 0, y: 0, width: 240, height: 900, fill: "#11141A", stroke: "#1E222A", strokeWidth: 1 }),
    createRectNode({ x: 24, y: 24, width: 32, height: 32, fill: "#6366F1", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 68, y: 28, text: "VOO Cloud", fill: "#FFFFFF", fontSize: 16 }),

    // Nav items
    createRectNode({ x: 16, y: 88, width: 208, height: 36, fill: "#1E222D", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 36, y: 98, text: "📊  Overview", fill: "#818CF8", fontSize: 13 }),
    createTextNode({ x: 36, y: 140, text: "⚡  Real-time Metrics", fill: "#8F96A3", fontSize: 13 }),
    createTextNode({ x: 36, y: 180, text: "👥  Customers", fill: "#8F96A3", fontSize: 13 }),
    createTextNode({ x: 36, y: 220, text: "💳  Billing & Plans", fill: "#8F96A3", fontSize: 13 }),
    createTextNode({ x: 36, y: 260, text: "⚙️  Project Settings", fill: "#8F96A3", fontSize: 13 }),

    // User Avatar in sidebar footer
    createEllipseNode({ x: 24, y: 836, width: 36, height: 36, fill: "#374151", stroke: "#4B5563", strokeWidth: 1 }),
    createTextNode({ x: 68, y: 838, text: "Alex Rivera", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 68, y: 856, text: "Lead Architect", fill: "#6B7280", fontSize: 11 }),

    // 4 KPI Metric Cards
    // Card 1
    createRectNode({ x: 270, y: 94, width: 260, height: 120, fill: "#141720", stroke: "#222633", strokeWidth: 1 }),
    createTextNode({ x: 290, y: 114, text: "Total Revenue", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 290, y: 142, text: "$142,850.00", fill: "#FFFFFF", fontSize: 24 }),
    createRectNode({ x: 440, y: 114, width: 66, height: 22, fill: "#064E3B", stroke: "#059669", strokeWidth: 1 }),
    createTextNode({ x: 450, y: 118, text: "+14.2%", fill: "#34D399", fontSize: 11 }),

    // Card 2
    createRectNode({ x: 554, y: 94, width: 260, height: 120, fill: "#141720", stroke: "#222633", strokeWidth: 1 }),
    createTextNode({ x: 574, y: 114, text: "Active Subscriptions", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 574, y: 142, text: "18,420", fill: "#FFFFFF", fontSize: 24 }),
    createRectNode({ x: 724, y: 114, width: 66, height: 22, fill: "#064E3B", stroke: "#059669", strokeWidth: 1 }),
    createTextNode({ x: 734, y: 118, text: "+8.6%", fill: "#34D399", fontSize: 11 }),

    // Card 3
    createRectNode({ x: 838, y: 94, width: 260, height: 120, fill: "#141720", stroke: "#222633", strokeWidth: 1 }),
    createTextNode({ x: 858, y: 114, text: "Avg. Latency (p99)", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 858, y: 142, text: "14.2 ms", fill: "#FFFFFF", fontSize: 24 }),
    createRectNode({ x: 1008, y: 114, width: 66, height: 22, fill: "#064E3B", stroke: "#059669", strokeWidth: 1 }),
    createTextNode({ x: 1020, y: 118, text: "-2.4ms", fill: "#34D399", fontSize: 11 }),

    // Card 4
    createRectNode({ x: 1122, y: 94, width: 288, height: 120, fill: "#141720", stroke: "#222633", strokeWidth: 1 }),
    createTextNode({ x: 1142, y: 114, text: "Server Health", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 1142, y: 142, text: "99.99%", fill: "#10B981", fontSize: 24 }),
    createTextNode({ x: 1142, y: 180, text: "All 16 nodes operational", fill: "#6B7280", fontSize: 12 }),

    // Main Chart Box
    createRectNode({ x: 270, y: 238, width: 730, height: 340, fill: "#141720", stroke: "#222633", strokeWidth: 1 }),
    createTextNode({ x: 294, y: 260, text: "Revenue Growth Breakdown", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 294, y: 284, text: "Monthly recurring revenue compared to baseline", fill: "#6B7280", fontSize: 12 }),

    // Chart Bars (Jan - Jun)
    createRectNode({ x: 320, y: 440, width: 48, height: 90, fill: "#3730A3", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 332, y: 540, text: "Jan", fill: "#6B7280", fontSize: 12 }),
    createRectNode({ x: 420, y: 410, width: 48, height: 120, fill: "#4338CA", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 432, y: 540, text: "Feb", fill: "#6B7280", fontSize: 12 }),
    createRectNode({ x: 520, y: 370, width: 48, height: 160, fill: "#4F46E5", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 532, y: 540, text: "Mar", fill: "#6B7280", fontSize: 12 }),
    createRectNode({ x: 620, y: 350, width: 48, height: 180, fill: "#6366F1", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 632, y: 540, text: "Apr", fill: "#6B7280", fontSize: 12 }),
    createRectNode({ x: 720, y: 320, width: 48, height: 210, fill: "#818CF8", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 732, y: 540, text: "May", fill: "#6B7280", fontSize: 12 }),
    createRectNode({ x: 820, y: 300, width: 48, height: 230, fill: "#A5B4FC", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 832, y: 540, text: "Jun", fill: "#6B7280", fontSize: 12 }),

    // Side Quick Actions Box
    createRectNode({ x: 1024, y: 238, width: 386, height: 340, fill: "#141720", stroke: "#222633", strokeWidth: 1 }),
    createTextNode({ x: 1048, y: 260, text: "Traffic Distribution", fill: "#FFFFFF", fontSize: 16 }),
    createEllipseNode({ x: 1140, y: 310, width: 150, height: 150, fill: "#312E81", stroke: "#4338CA", strokeWidth: 8 }),
    createTextNode({ x: 1195, y: 375, text: "68%", fill: "#FFFFFF", fontSize: 22 }),
    createTextNode({ x: 1060, y: 500, text: "Direct: 68%  •  Organic: 24%  •  Referral: 8%", fill: "#9CA3AF", fontSize: 12 }),

    // Recent Orders Table
    createRectNode({ x: 270, y: 602, width: 1140, height: 260, fill: "#141720", stroke: "#222633", strokeWidth: 1 }),
    createTextNode({ x: 294, y: 624, text: "Recent Invoices & Transactions", fill: "#FFFFFF", fontSize: 16 }),
    createRectNode({ x: 294, y: 658, width: 1092, height: 1, fill: "#222633", stroke: "transparent", strokeWidth: 0 }),

    // Row 1
    createTextNode({ x: 300, y: 676, text: "INV-2026-001", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 440, y: 676, text: "Stripe Billing Pro", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 680, y: 676, text: "$2,400.00", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 840, y: 676, text: "2026-10-21 14:20", fill: "#6B7280", fontSize: 13 }),
    createRectNode({ x: 1040, y: 672, width: 72, height: 20, fill: "#064E3B", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 1052, y: 676, text: "Paid", fill: "#34D399", fontSize: 11 }),

    // Row 2
    createTextNode({ x: 300, y: 712, text: "INV-2026-002", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 440, y: 712, text: "Vercel Enterprise Seat", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 680, y: 712, text: "$1,850.00", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 840, y: 712, text: "2026-10-21 11:05", fill: "#6B7280", fontSize: 13 }),
    createRectNode({ x: 1040, y: 708, width: 72, height: 20, fill: "#064E3B", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 1052, y: 712, text: "Paid", fill: "#34D399", fontSize: 11 }),

    // Row 3
    createTextNode({ x: 300, y: 748, text: "INV-2026-003", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 440, y: 748, text: "Supabase Cloud DB", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 680, y: 748, text: "$420.00", fill: "#FFFFFF", fontSize: 13 }),
    createTextNode({ x: 840, y: 748, text: "2026-10-20 18:33", fill: "#6B7280", fontSize: 13 }),
    createRectNode({ x: 1040, y: 744, width: 72, height: 20, fill: "#451A03", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 1048, y: 748, text: "Pending", fill: "#FBBF24", fontSize: 11 }),
  ];

  doc.nodes = nodes;
  return doc;
}

/**
 * 2. iOS 18 Mobile Banking & Wallet App
 */
function createIosBankingDoc() {
  const width = 393;
  const height = 852;
  const doc = createDocument(width, height, "#090A0F");

  const nodes = [
    // Dynamic Island
    createRectNode({ x: 134, y: 11, width: 125, height: 35, fill: "#000000", stroke: "#222222", strokeWidth: 1 }),
    createTextNode({ x: 28, y: 16, text: "9:41", fill: "#FFFFFF", fontSize: 14 }),
    createTextNode({ x: 334, y: 16, text: "5G", fill: "#FFFFFF", fontSize: 12 }),

    // Greeting Header
    createEllipseNode({ x: 24, y: 64, width: 44, height: 44, fill: "#312E81", stroke: "#6366F1", strokeWidth: 2 }),
    createTextNode({ x: 80, y: 68, text: "Welcome back,", fill: "#9CA3AF", fontSize: 12 }),
    createTextNode({ x: 80, y: 86, text: "Alex Rivera 👋", fill: "#FFFFFF", fontSize: 16 }),
    createRectNode({ x: 333, y: 68, width: 36, height: 36, fill: "#181A22", stroke: "#262936", strokeWidth: 1 }),
    createTextNode({ x: 343, y: 76, text: "🔔", fill: "#FFFFFF", fontSize: 14 }),

    // Platinum Bank Card
    createRectNode({ x: 24, y: 130, width: 345, height: 200, fill: "#4F46E5", stroke: "#818CF8", strokeWidth: 1 }),
    createTextNode({ x: 48, y: 154, text: "VOO Platinum Business", fill: "#E0E7FF", fontSize: 14 }),
    createTextNode({ x: 48, y: 194, text: "$38,492.50", fill: "#FFFFFF", fontSize: 28 }),
    createTextNode({ x: 48, y: 278, text: "•••• 8924", fill: "#C7D2FE", fontSize: 15 }),
    createTextNode({ x: 280, y: 278, text: "10/28", fill: "#C7D2FE", fontSize: 14 }),
    createTextNode({ x: 280, y: 154, text: "VISA", fill: "#FFFFFF", fontSize: 18 }),

    // Quick Action 4 Buttons
    createEllipseNode({ x: 36, y: 360, width: 56, height: 56, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 50, y: 376, text: "↗", fill: "#818CF8", fontSize: 20 }),
    createTextNode({ x: 44, y: 426, text: "Send", fill: "#9CA3AF", fontSize: 12 }),

    createEllipseNode({ x: 126, y: 360, width: 56, height: 56, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 140, y: 376, text: "↙", fill: "#10B981", fontSize: 20 }),
    createTextNode({ x: 130, y: 426, text: "Receive", fill: "#9CA3AF", fontSize: 12 }),

    createEllipseNode({ x: 216, y: 360, width: 56, height: 56, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 232, y: 376, text: "⚡", fill: "#F59E0B", fontSize: 18 }),
    createTextNode({ x: 226, y: 426, text: "Swap", fill: "#9CA3AF", fontSize: 12 }),

    createEllipseNode({ x: 306, y: 360, width: 56, height: 56, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 322, y: 376, text: "⚙", fill: "#A78BFA", fontSize: 18 }),
    createTextNode({ x: 320, y: 426, text: "More", fill: "#9CA3AF", fontSize: 12 }),

    // Recent Transactions List
    createRectNode({ x: 24, y: 470, width: 345, height: 340, fill: "#12141A", stroke: "#1E222C", strokeWidth: 1 }),
    createTextNode({ x: 44, y: 494, text: "Recent Activity", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 290, y: 496, text: "See all", fill: "#6366F1", fontSize: 12 }),

    // Item 1
    createEllipseNode({ x: 44, y: 530, width: 40, height: 40, fill: "#1E222E", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 56, y: 540, text: "🍎", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 96, y: 534, text: "Apple Store", fill: "#FFFFFF", fontSize: 14 }),
    createTextNode({ x: 96, y: 554, text: "Electronics • 2h ago", fill: "#6B7280", fontSize: 11 }),
    createTextNode({ x: 270, y: 542, text: "-$1,299.00", fill: "#FFFFFF", fontSize: 14 }),

    // Item 2
    createEllipseNode({ x: 44, y: 590, width: 40, height: 40, fill: "#1E222E", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 56, y: 600, text: "💼", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 96, y: 594, text: "Salary Payment", fill: "#FFFFFF", fontSize: 14 }),
    createTextNode({ x: 96, y: 614, text: "VOO Labs Inc • Yesterday", fill: "#6B7280", fontSize: 11 }),
    createTextNode({ x: 270, y: 602, text: "+$8,400.00", fill: "#10B981", fontSize: 14 }),

    // Item 3
    createEllipseNode({ x: 44, y: 650, width: 40, height: 40, fill: "#1E222E", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 56, y: 660, text: "☕", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 96, y: 654, text: "Blue Bottle Coffee", fill: "#FFFFFF", fontSize: 14 }),
    createTextNode({ x: 96, y: 674, text: "Food & Drinks • Oct 20", fill: "#6B7280", fontSize: 11 }),
    createTextNode({ x: 295, y: 662, text: "-$6.50", fill: "#FFFFFF", fontSize: 14 }),

    // Item 4
    createEllipseNode({ x: 44, y: 710, width: 40, height: 40, fill: "#1E222E", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 56, y: 720, text: "🎵", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 96, y: 714, text: "Spotify Premium", fill: "#FFFFFF", fontSize: 14 }),
    createTextNode({ x: 96, y: 734, text: "Subscription • Oct 18", fill: "#6B7280", fontSize: 11 }),
    createTextNode({ x: 290, y: 722, text: "-$14.99", fill: "#FFFFFF", fontSize: 14 }),
  ];

  doc.nodes = nodes;
  return doc;
}

/**
 * 3. Bento Grid AI Product Landing Page
 */
function createBentoLandingDoc() {
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
    createTextNode({ x: 560, y: 137, text: "✨  Next-Gen Creative Canvas 2.0 is Live", fill: "#C4B5FD", fontSize: 13 }),

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
function createDesignSystemDoc() {
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
function createPitchDeckDoc() {
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
function createEcommerceDoc() {
  const width = 1440;
  const height = 960;
  const doc = createDocument(width, height, "#0F1115");

  const nodes = [
    // Brand Nav
    createRectNode({ x: 0, y: 0, width: 1440, height: 80, fill: "#13161C", stroke: "#222630", strokeWidth: 1 }),
    createTextNode({ x: 60, y: 28, text: "ATELIER NORDIC", fill: "#FFFFFF", fontSize: 18 }),
    createTextNode({ x: 480, y: 32, text: "Collection 2026", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 620, y: 32, text: "Timepieces", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 740, y: 32, text: "Lookbook", fill: "#9CA3AF", fontSize: 13 }),
    createTextNode({ x: 850, y: 32, text: "Journal", fill: "#9CA3AF", fontSize: 13 }),
    createRectNode({ x: 1300, y: 24, width: 80, height: 32, fill: "#1E222B", stroke: "#2E3442", strokeWidth: 1 }),
    createTextNode({ x: 1324, y: 32, text: "Bag (3)", fill: "#FFFFFF", fontSize: 12 }),

    // Hero Showcase Banner
    createRectNode({ x: 60, y: 120, width: 1320, height: 380, fill: "#161922", stroke: "#242836", strokeWidth: 1 }),
    createRectNode({ x: 100, y: 160, width: 140, height: 26, fill: "#2B263F", stroke: "#7C3AED", strokeWidth: 1 }),
    createTextNode({ x: 112, y: 166, text: "NEW RELEASE // NO. 04", fill: "#C4B5FD", fontSize: 11 }),
    createTextNode({ x: 100, y: 210, text: "Minimal Automatic Chronograph", fill: "#FFFFFF", fontSize: 36 }),
    createTextNode({ x: 100, y: 264, text: "Titanium grade 5 case with anti-reflective sapphire crystal.", fill: "#9CA3AF", fontSize: 16 }),
    createTextNode({ x: 100, y: 320, text: "$680.00 USD", fill: "#FFFFFF", fontSize: 24 }),
    createRectNode({ x: 100, y: 370, width: 160, height: 44, fill: "#FFFFFF", stroke: "transparent", strokeWidth: 0 }),
    createTextNode({ x: 138, y: 384, text: "Add to Bag", fill: "#000000", fontSize: 13 }),

    // Product Grid Header
    createTextNode({ x: 60, y: 540, text: "Featured Collection", fill: "#FFFFFF", fontSize: 22 }),

    // Product Card 1
    createRectNode({ x: 60, y: 580, width: 410, height: 320, fill: "#141720", stroke: "#222632", strokeWidth: 1 }),
    createRectNode({ x: 90, y: 610, width: 350, height: 180, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 90, y: 810, text: "Monochrome Ceramic Vessel", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 90, y: 836, text: "Hand-thrown matte finish", fill: "#6B7280", fontSize: 12 }),
    createTextNode({ x: 360, y: 810, text: "$145", fill: "#FFFFFF", fontSize: 16 }),

    // Product Card 2
    createRectNode({ x: 515, y: 580, width: 410, height: 320, fill: "#141720", stroke: "#222632", strokeWidth: 1 }),
    createRectNode({ x: 545, y: 610, width: 350, height: 180, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 545, y: 810, text: "Brushed Aluminum Lamp", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 545, y: 836, text: "Warm dimmable LED 2700K", fill: "#6B7280", fontSize: 12 }),
    createTextNode({ x: 815, y: 810, text: "$290", fill: "#FFFFFF", fontSize: 16 }),

    // Product Card 3
    createRectNode({ x: 970, y: 580, width: 410, height: 320, fill: "#141720", stroke: "#222632", strokeWidth: 1 }),
    createRectNode({ x: 1000, y: 610, width: 350, height: 180, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 1000, y: 810, text: "Architectural Wool Blanket", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 1000, y: 836, text: "100% Merino geometric weave", fill: "#6B7280", fontSize: 12 }),
    createTextNode({ x: 1270, y: 810, text: "$220", fill: "#FFFFFF", fontSize: 16 }),
  ];

  doc.nodes = nodes;
  return doc;
}

/**
 * High-definition community template metadata list
 */
export const COMMUNITY_TEMPLATES = [
  {
    id: "saas-analytics-dashboard",
    title: "SaaS Analytics & Cloud Metric Dashboard",
    category: "dashboard",
    badge: "Staff Pick",
    badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    tags: ["#SaaS", "#Dashboard", "#DarkUI", "#Charts"],
    author: {
      name: "VOO Core Studio",
      handle: "@voocore",
      avatar: "⚡",
      verified: true,
    },
    stats: {
      likes: "14.2k",
      clones: "5.8k",
      views: "38.9k",
    },
    width: 1440,
    height: 900,
    description: "企业级暗黑风格数据看板与 KPI 监控中心，含全套导航、核心指标卡与最近订单表格。",
    previewTheme: "from-indigo-950/80 via-neutral-900 to-black",
    createDoc: createSaasDashboardDoc,
  },
  {
    id: "ios-fintech-wallet",
    title: "iOS 18 Mobile Banking & Digital Wallet",
    category: "mobile",
    badge: "Trending",
    badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    tags: ["#iOS18", "#Mobile", "#Fintech", "#AppleDesign"],
    author: {
      name: "Alex Rivera",
      handle: "@rivera_ux",
      avatar: "💳",
      verified: true,
    },
    stats: {
      likes: "19.5k",
      clones: "7.1k",
      views: "42.0k",
    },
    width: 393,
    height: 852,
    description: "专为 iPhone 16 Pro 打造的现代移动银行界面，含动态灵动岛、发光银行卡卡包、快捷转账与交易记录。",
    previewTheme: "from-violet-950/80 via-neutral-900 to-black",
    createDoc: createIosBankingDoc,
  },
  {
    id: "ai-bento-landing",
    title: "Bento Grid AI Product Landing Page",
    category: "landing",
    badge: "Popular",
    badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    tags: ["#BentoGrid", "#LandingPage", "#AI", "#WebDesign"],
    author: {
      name: "Studio Hyperion",
      handle: "@hyperion",
      avatar: "✨",
      verified: true,
    },
    stats: {
      likes: "26.8k",
      clones: "9.4k",
      views: "65.1k",
    },
    width: 1440,
    height: 960,
    description: "当下流行的 Bento 模块化排版 AI 产品官网，微渐变卡片、醒目 Hero 标题与能力矩阵。",
    previewTheme: "from-purple-950/80 via-neutral-900 to-black",
    createDoc: createBentoLandingDoc,
  },
  {
    id: "universal-design-system",
    title: "Universal Design System & UI Kit",
    category: "design-systems",
    badge: "Essential",
    badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    tags: ["#DesignSystem", "#Tokens", "#Components", "#UIStarter"],
    author: {
      name: "Design Tokens WG",
      handle: "@design_systems",
      avatar: "🎨",
      verified: true,
    },
    stats: {
      likes: "32.4k",
      clones: "13.6k",
      views: "88.2k",
    },
    width: 1920,
    height: 1080,
    description: "工业级设计规范与组件库底座，覆盖色彩语义 Token、排版比例阶梯、多态按钮与表单控件。",
    previewTheme: "from-blue-950/80 via-neutral-900 to-black",
    createDoc: createDesignSystemDoc,
  },
  {
    id: "tech-pitch-deck",
    title: "Dark Mode Tech Pitch Deck (16:9)",
    category: "slides",
    badge: "Curated",
    badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    tags: ["#PitchDeck", "#Presentation", "#Keynote", "#16:9"],
    author: {
      name: "Elena Rostova",
      handle: "@elena_deck",
      avatar: "📊",
      verified: true,
    },
    stats: {
      likes: "11.7k",
      clones: "4.3k",
      views: "29.4k",
    },
    width: 1920,
    height: 1080,
    description: "科技创业项目与产品发布会路演演示幻灯片，大数字指标呈现与三列价值主张布局。",
    previewTheme: "from-amber-950/60 via-neutral-900 to-black",
    createDoc: createPitchDeckDoc,
  },
  {
    id: "minimal-ecommerce-lookbook",
    title: "Minimalist E-Commerce Store & Lookbook",
    category: "web",
    badge: "Editor's Choice",
    badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    tags: ["#ECommerce", "#Minimalist", "#Shop", "#Lookbook"],
    author: {
      name: "Atelier Studio",
      handle: "@atelier_nordic",
      avatar: "🛍️",
      verified: true,
    },
    stats: {
      likes: "15.9k",
      clones: "6.2k",
      views: "34.7k",
    },
    width: 1440,
    height: 960,
    description: "北欧极简美学选物店与时尚画册，大图 Hero、网格商品卡片与商品标签。",
    previewTheme: "from-neutral-800 via-neutral-900 to-black",
    createDoc: createEcommerceDoc,
  },
];
