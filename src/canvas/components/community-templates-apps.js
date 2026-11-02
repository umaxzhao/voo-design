import { createDocument } from "../editor/scene_doc_factory.js";
import { createRectNode, createEllipseNode } from "../editor/scene_model_node_builders.js";
import { createTextNode } from "../editor/scene_model_text_effects.js";

export function createSaasDashboardDoc() {
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
    createTextNode({ x: 36, y: 98, text: "Overview", fill: "#818CF8", fontSize: 13 }),
    createTextNode({ x: 36, y: 140, text: "Real-time Metrics", fill: "#8F96A3", fontSize: 13 }),
    createTextNode({ x: 36, y: 180, text: "Customers", fill: "#8F96A3", fontSize: 13 }),
    createTextNode({ x: 36, y: 220, text: "Billing & Plans", fill: "#8F96A3", fontSize: 13 }),
    createTextNode({ x: 36, y: 260, text: "Project Settings", fill: "#8F96A3", fontSize: 13 }),

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

export function createIosBankingDoc() {
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
    createTextNode({ x: 80, y: 86, text: "Alex Rivera", fill: "#FFFFFF", fontSize: 16 }),
    createRectNode({ x: 333, y: 68, width: 36, height: 36, fill: "#181A22", stroke: "#262936", strokeWidth: 1 }),
    createTextNode({ x: 343, y: 76, text: "◉", fill: "#D4D4D4", fontSize: 14 }),

    // Platinum Bank Card
    createRectNode({ x: 24, y: 130, width: 345, height: 200, fill: "#4F46E5", stroke: "#818CF8", strokeWidth: 1 }),
    createTextNode({ x: 48, y: 154, text: "VOO Platinum Business", fill: "#E0E7FF", fontSize: 14 }),
    createTextNode({ x: 48, y: 194, text: "$38,492.50", fill: "#FFFFFF", fontSize: 28 }),
    createTextNode({ x: 48, y: 278, text: "•••• 8924", fill: "#C7D2FE", fontSize: 15 }),
    createTextNode({ x: 280, y: 278, text: "10/28", fill: "#C7D2FE", fontSize: 14 }),
    createTextNode({ x: 280, y: 154, text: "VISA", fill: "#FFFFFF", fontSize: 18 }),

    // Quick Action 4 Buttons
    createEllipseNode({ x: 36, y: 360, width: 56, height: 56, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 50, y: 376, text: "↗", fill: "#D4D4D4", fontSize: 20 }),
    createTextNode({ x: 44, y: 426, text: "Send", fill: "#9CA3AF", fontSize: 12 }),

    createEllipseNode({ x: 126, y: 360, width: 56, height: 56, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 140, y: 376, text: "↙", fill: "#D4D4D4", fontSize: 20 }),
    createTextNode({ x: 130, y: 426, text: "Receive", fill: "#9CA3AF", fontSize: 12 }),

    createEllipseNode({ x: 216, y: 360, width: 56, height: 56, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 230, y: 376, text: "⇄", fill: "#D4D4D4", fontSize: 20 }),
    createTextNode({ x: 226, y: 426, text: "Swap", fill: "#9CA3AF", fontSize: 12 }),

    createEllipseNode({ x: 306, y: 360, width: 56, height: 56, fill: "#1E222D", stroke: "#2E3444", strokeWidth: 1 }),
    createTextNode({ x: 320, y: 376, text: "⋯", fill: "#D4D4D4", fontSize: 20 }),
    createTextNode({ x: 320, y: 426, text: "More", fill: "#9CA3AF", fontSize: 12 }),

    // Recent Transactions List
    createRectNode({ x: 24, y: 470, width: 345, height: 340, fill: "#12141A", stroke: "#1E222C", strokeWidth: 1 }),
    createTextNode({ x: 44, y: 494, text: "Recent Activity", fill: "#FFFFFF", fontSize: 16 }),
    createTextNode({ x: 290, y: 496, text: "See all", fill: "#6366F1", fontSize: 12 }),

    // Item 1
    createTextNode({ x: 96, y: 534, text: "Apple Store", fill: "#FFFFFF", fontSize: 14 }),
    createTextNode({ x: 96, y: 554, text: "Electronics • 2h ago", fill: "#6B7280", fontSize: 11 }),
    createTextNode({ x: 270, y: 542, text: "-$1,299.00", fill: "#FFFFFF", fontSize: 14 }),

    // Item 2
    createTextNode({ x: 96, y: 594, text: "Salary Payment", fill: "#FFFFFF", fontSize: 14 }),
    createTextNode({ x: 96, y: 614, text: "VOO Labs Inc • Yesterday", fill: "#6B7280", fontSize: 11 }),
    createTextNode({ x: 270, y: 602, text: "+$8,400.00", fill: "#10B981", fontSize: 14 }),

    // Item 3
    createTextNode({ x: 96, y: 654, text: "Blue Bottle Coffee", fill: "#FFFFFF", fontSize: 14 }),
    createTextNode({ x: 96, y: 674, text: "Food & Drinks • Oct 20", fill: "#6B7280", fontSize: 11 }),
    createTextNode({ x: 295, y: 662, text: "-$6.50", fill: "#FFFFFF", fontSize: 14 }),

    // Item 4
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

export function createEcommerceDoc() {
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
 * VOO signature design-system starter templates. Each one is generated from the
 * design system's own tokens so the preview and the document can never drift
 * from the picker in Settings → Design systems.
 */
