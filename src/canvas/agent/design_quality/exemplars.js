/**
 * Text descriptions (no copied assets) of exemplary high-quality layouts,
 * written as recipes the model can follow. Field contract:
 * { id, kind, kit, description, structure }.
 */

const P = (s) => s.trim().replace(/\s+/g, " ");

export const EXEMPLARS = [
  {
    id: "saas-dashboard",
    kind: "dashboard",
    kit: "enterprise-admin",
    description: P(`
      Light admin analytics page in the Enterprise Admin kit. Canvas #F7F8FA.
      Sidebar 248px fixed (logo row 40px, nav rows 36px: Overview, Reports,
      Customers, Billing; user card bottom). Header 64px: page title left,
      search + actions right. KPI strip directly below the header: 4 stats
      cards on a 12-col grid with 24px gutters and 8px radius — MRR $48,230
      (+12.4%), Active users 18,041, Churn 2.1%, NPS 62. The FIRST card is
      emphasized: accent-blue left border 3px and a sparkline; the others are
      plain. Below: main chart card spanning 2/3 (revenue line chart, 320px
      tall, week labels, legend) and a 1/3 activity card listing 6 rows with
      avatar initials (e.g. "AK", "JW"), full names, timestamps like
      "14 Mar, 9:41" and status pills (Paid, Pending, Refunded).`),
    structure: P(`
      sidebar 248 + header 64 + KPI 4 cards (one emphasized) + content
      2/3 chart + 1/3 activity list; 24px gutters; 16px card padding;
      semantic status colors only.`),
  },
  {
    id: "analytics-dark-shot",
    kind: "dashboard",
    kit: "dribbble-saas",
    description: P(`
      Dark showcase analytics in the Dribbble Product Shot kit on #0C0C0A.
      Bento grid 12-col, 24px gutters: ONE focal module spans two columns in
      the top-left — "Monthly recurring revenue" with a huge lime tabular
      number $48,230, a lime sparkline and a +12.4% pill. Neighbors are
      clearly smaller (half area): "Retention" donut 68%, "New sign-ups"
      bar rows by weekday, a users table card with 4 rows ("Amara Kessie",
      "Jonas Whitfield") avatar initials and green status dots, and a card
      of icon+label rows (API key, Webhooks, Team seats) with real counts.
      Only the focal number, sparkline and one CTA are lime; everything else
      is neutral. Focal module >= 2x area of any other module.`),
    structure: P(`
      bento 12-col; focal 2x metric card top-left; 4 smaller supporting
      cards; lime accent <10% coverage; sparklines + status dots; shadows
      soft, hairlines rgba(255,255,255,.1).`),
  },
  {
    id: "login-split-glass",
    kind: "login",
    kit: "glass",
    description: P(`
      Split-screen sign-in in the Frosted Glass kit. Left half: a single
      translucent panel 400px wide, 16-20px radius, 72% white, holding
      heading "Welcome back" (28px), email + password fields 48px tall with
      8px inset spacing, a solid primary button, and a "Forgot password?"
      text link. Right half: one soft photographic backdrop (mountain/sea,
      blurred) filling the half, with a small logo row on the glass. One
      glass layer only, dark ink text, generous 32-40px inner padding.`),
    structure: P(`
      split 50/50; glass form panel 400w left; blurred photo right;
      fields 48h; single primary CTA; panel 72% white, blur, 1px white
      border, soft shadow.`),
  },
  {
    id: "login-split-light",
    kind: "login",
    kit: "enterprise-admin",
    description: P(`
      Split-screen sign-in in the Enterprise Admin kit. Left 60%: white
      form column 400px centered-left with logo row 32px, heading 24px,
      labeled inputs 40px tall, primary blue button, link row. Right 40%:
      flat #F2F4F7 brand pane with a subtle grid pattern of thin 1px lines,
      a short quote and product bullet list; no gradients.`),
    structure: P(`
      split 60/40; form 400w; inputs 40h; flat brand pane with thin rules;
      exact left-edge alignment between all form elements.`),
  },
  {
    id: "pricing-tiers",
    kind: "pricing",
    kit: "dribbble-saas",
    description: P(`
      Pricing section in the Dribbble Product Shot kit on warm neutral or
      dark surface. Three tiers on one 12-col row: Starter, Pro, Team.
      The MIDDLE tier "Pro" is emphasized: 1.2x larger, accent-colored
      1px border, "Most popular" pill, and a stronger shadow; side tiers
      are plain. Real prices ($12 / $29 / $79 per seat/month), dates no;
      feature rows of 6 with icons and check counts; billing toggle pill
      at top; primary CTA on the emphasized card uses the accent.`),
    structure: P(`
      3 tiers; middle emphasized with accent border + ribbon; varied card
      heights; icon check rows; one accent only; asymmetric footnote row.`),
  },
  {
    id: "landing-hero-shot",
    kind: "landing",
    kit: "linear",
    description: P(`
      Dark hero in the Linear Dark kit. Left-aligned asymmetric headline
      56-64px ("Ship at the speed of thought") at x=96, max-width 520,
      followed by a 16px 2-line sub-headline and two buttons (primary
      accent, ghost). Right side: tilted product screenshot mock (message
      list, sidebar) 640px wide with hairline border and soft shadow,
      overlapping the fold. Top nav 56px: wordmark left, 5 nav items,
      "Sign in" ghost + "Get started" accent right. Footer strip of 6
      small grey logos below the fold.`),
    structure: P(`
      nav 56; hero headline left 520w vs screenshot right 640w overlap;
      left-aligned; primary+ghost CTAs; hairlines; one accent; dense
      spacing rhythm.`),
  },
  {
    id: "landing-editorial",
    kind: "landing",
    kit: "editorial",
    description: P(`
      Editorial landing in the Editorial Print kit on #F6F4EF. Header with
      thin 1px rule: wordmark serif left, 4 nav items right, 16px. Hero:
      left-aligned serif display 72px two lines ("Design is a form of
      thinking, made visible") at 12% margin, kicker line above ("N°04 —
      Spring 2026", 12px letterspaced), byline row below with hairline
      rules. Below: asymmetric two-column band — 1/3 image, 2/3 intro
      paragraphs 16/24 — plus a quote pulled left with a 4px ink rule and
      large 30px serif. No cards, no radius, no shadows.`),
    structure: P(`
      header 1px rules; hero 72/16 type contrast at x=12% margin; kicker +
      byline; asymmetric 1/3 image vs 2/3 text; pull quote with rule;
      zero cards.`),
  },
  {
    id: "mobile-app-glass",
    kind: "mobile",
    kit: "glass",
    description: P(`
      Mobile 390x844 screen in the Frosted Glass kit. Status bar 47px;
      full-bleed blurred photo backdrop; floating glass card at 24px inset
      with today summary: big 36px number, 12px label, mini bar row.
      Bottom 2/5: translucent sheet with rounded top corners 24px, a drag
      handle pill, horizontal chips (All, Plants, Lights, Security) and an
      icon+label list of 4 devices with status dots and toggle switches.
      One accent color reserved for the active chip.`),
    structure: P(`
      390x844; status bar 47; glass summary card; bottom sheet radius 24
      with chips + device rows; backdrop photo blurred; single accent.`),
  },
  {
    id: "mobile-stats-dark",
    kind: "mobile",
    kit: "linear",
    description: P(`
      Mobile 390x844 dark screen in the Linear Dark kit. Top bar 52px with
      back chevron and title 16px semibold. Metric hero: 48px tabular
      number with -1.24% muted delta and 96px sparkline card 8px radius.
      Section rows 44px (hairline separated): icon, label, value, chevron.
      Bottom tab bar 56px with 4 icons, active one accent-colored. Dense
      8/12/16 spacing rhythm; one accent only.`),
    structure: P(`
      390x844; nav bar 52; 48px metric + sparkline; 44px list rows;
      tab bar 56 with active accent; hairlines; dense grid.`),
  },
  {
    id: "settings-forms",
    kind: "settings",
    kit: "enterprise-admin",
    description: P(`
      Settings page in the Enterprise Admin kit. Left nav 220px grouped
      (Account, Workspace, Notifications, Billing) with active row accent
      text + left 2px rule. Content column 560px: grouped form sections on
      white panels — Profile (avatar block, name/email inputs 40px),
      Preferences (rows of label + select, toggle rows), Danger zone (red
      text + ghost button). Sections separated by 24px with 16px inner
      padding; every row label-left, control-right, exact left edges
      aligned; save bar footer right-aligned primary + ghost.`),
    structure: P(`
      settings nav 220 left; form sections 560w white panels; label left /
      control right rows; 24px section gaps; red danger zone; aligned
      column edges.`),
  },
  {
    id: "editorial-article",
    kind: "editorial",
    kit: "editorial",
    description: P(`
      Long-form article in the Editorial Print kit on #F6F4EF. Header:
      masthead serif 40px + date rule. Article column 660px centered-left
      at 96px margins: kicker 12px letterspaced, headline serif 48px
      2 lines, dek 20px sans muted, byline with hairline rules. Body 16px/
      28px sans; inline serif subheads 30px; one full-column figure with
      caption 12px; pull quote 30px serif with 1px rules above/below and
      generous whitespace before/after; footer with thin rule. No cards,
      no color except ink.`),
    structure: P(`
      masthead; article col 660; 72/16 contrast hierarchy; kicker+dek;
      byline rules; figure + caption; pull quote; thin rules only.`),
  },
];

/**
 * Chooses up to `n` exemplars given either an exemplar kind id or free-form
 * user text. Deterministic: stable ordering, no mutation.
 */
export function pickExemplars(kindOrUserText, n = 3) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  if (count === 0 || !EXEMPLARS.length) return [];
  const text = String(kindOrUserText ?? "").toLowerCase().replace(/[\n\r]+/g, " ");
  if (!text.trim()) return defaultSpread(count);

  const scored = EXEMPLARS.map((exemplar, index) => {
    let score = 0;
    if (text === exemplar.kind) score += 12;
    else if (new RegExp(`\\b${exemplar.kind}\\b`).test(text)) score += 8;
    // kit affinity (weighted hints per exemplar kit)
    for (const [word, weight] of KIT_HINTS[exemplar.kit] ?? []) {
      if (new RegExp(`\\b${word}\\b`).test(text)) score += weight;
    }
    // content overlap
    for (const token of contentTokens(exemplar)) {
      if (new RegExp(`\\b${token}\\b`).test(text)) score += 1;
    }
    return { exemplar, score, index };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (matched.length >= count) return matched.slice(0, count).map((s) => s.exemplar);
  if (matched.length > 0) {
    const rest = defaultSpread(EXEMPLARS.length).filter(
      (e) => !matched.some((s) => s.exemplar.id === e.id),
    );
    return [...matched.map((s) => s.exemplar), ...rest].slice(0, count);
  }
  return defaultSpread(count);
}

const KIT_HINTS = {
  linear: [
    ["dark", 2],
    ["tool", 2],
    ["developer", 3],
    ["code", 3],
    ["app", 1],
  ],
  glass: [
    ["glass", 3],
    ["blur", 2],
    ["frosted", 3],
    ["mobile", 2],
    ["photo", 2],
  ],
  editorial: [
    ["editorial", 3],
    ["serif", 3],
    ["magazine", 3],
    ["article", 3],
    ["blog", 2],
    ["paper", 2],
    ["print", 2],
  ],
  "enterprise-admin": [
    ["admin", 3],
    ["dashboard", 3],
    ["table", 2],
    ["settings", 2],
    ["report", 3],
    ["crm", 3],
    ["light", 2],
  ],
  "dribbble-saas": [
    ["dribbble", 5],
    ["shot", 4],
    ["showcase", 4],
    ["bento", 4],
    ["hero", 2],
    ["landing", 2],
    ["pricing", 3],
    ["poster", 2],
    ["dark", 1],
  ],
};

const DEFAULT_ORDER = ["saas-dashboard", "landing-hero-shot", "mobile-stats-dark", "pricing-tiers", "editorial-article", "settings-forms"];

function contentTokens(exemplar) {
  const seen = new Set();
  const tokens = [];
  for (const word of `${exemplar.kind} ${exemplar.description}`.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (!seen.has(word)) {
      seen.add(word);
      tokens.push(word);
    }
  }
  return tokens;
}

function defaultSpread(count) {
  const out = [];
  for (const id of DEFAULT_ORDER) {
    if (out.length >= count) break;
    const exemplar = EXEMPLARS.find((e) => e.id === id);
    if (exemplar) out.push(exemplar);
  }
  // Fallback in case the curated ids drift.
  for (const exemplar of EXEMPLARS) {
    if (out.length >= count) break;
    if (!out.includes(exemplar)) out.push(exemplar);
  }
  return out.slice(0, count);
}
