/** Fixed prompts shared by before/after runs; no external asset dependencies. */
export const DESIGN_BENCH_TASKS = [
  ['product-card', 'product card', 640, 720, 'Design a premium product card for the Arc wireless headphones, $249, rated 4.8 from 128 reviews. Include a product illustration, color selection and Add to bag action.'],
  ['login-form', 'login form', 1440, 1000, 'Design a sign-in screen for Northstar project management. Include email, password, Google sign-in, recovery link and a branded supporting panel.'],
  ['signup', 'signup', 1440, 1000, 'Design an account creation screen for Forma, a creative collaboration service. Include name, work email, password, terms and a clear primary action.'],
  ['landing-hero', 'landing hero', 1440, 1000, 'Design the landing hero for Orbit, a team planning tool. Include navigation, a distinctive headline, supporting copy, primary CTA and a convincing product preview.'],
  ['saas-dashboard', 'SaaS dashboard', 1440, 1000, 'Design the Northstar workspace dashboard with sidebar navigation, four business KPIs, a revenue chart, recent activity and current projects with realistic owners and dates.'],
  ['analytics-dashboard', 'analytics dashboard', 1440, 1000, 'Design an analytics dashboard for Meridian Commerce with date filters, revenue and conversion metrics, a trend chart, acquisition channels and top products.'],
  ['settings-page', 'settings page', 1440, 1000, 'Design workspace settings for Acme Studio with section navigation, profile and organization fields, notification preferences, billing summary and save action.'],
  ['pricing-table', 'pricing table', 1440, 1000, 'Design pricing for Relay: Starter $12, Pro $29 and Business $79 per seat/month. Include billing toggle, meaningful feature differences and an emphasized recommended plan.'],
  ['mobile-home', 'mobile home', 390, 844, 'Design a mobile home screen for a personal finance app called Pocket. Show balance, weekly spending chart, recent transactions with merchant names and bottom navigation.'],
  ['mobile-onboarding', 'mobile onboarding', 390, 844, 'Design an onboarding screen for Trail, a hiking app. Include a simple original landscape illustration, concise benefits, progress indicator and Get started action.'],
  ['mobile-profile', 'mobile profile', 390, 844, 'Design the mobile profile of Maya Chen in a fitness app. Include avatar initials, weekly progress, activity statistics, achievements and account actions.'],
  ['checkout-form', 'checkout form', 1440, 1000, 'Design checkout for an everyday goods shop: shipping address, payment fields, order summary for two products, shipping costs, total and Place order action.'],
  ['email-newsletter', 'email newsletter', 720, 1200, 'Design Fieldnotes weekly email newsletter with masthead, issue number and date, a featured design story, two shorter articles and a restrained subscription footer.'],
  ['blog-article', 'blog article', 1440, 1200, 'Design an editorial article titled The quiet craft of better software, by Elena Park, October 14 2026. Include publication navigation, deck, reading time, pull quote and readable article excerpts.'],
  ['empty-state', 'empty state', 960, 720, 'Design the first-use empty state for a project library in Assemble. Include app navigation, a purposeful original illustration, helpful explanation, Create project and sample project actions.'],
  ['notification-panel', 'notification panel', 640, 900, 'Design an inbox notification panel with All and Unread tabs, grouped dated notifications, avatar initials, meaningful status indicators and Mark all read action. Use realistic collaborators and events.'],
  ['file-upload-modal', 'file upload modal', 960, 720, 'Design a file upload dialog on a muted app backdrop. Include drag-and-drop area, file restrictions, three files with distinct upload states, progress and cancel/done actions.'],
  ['kanban-board', 'kanban board', 1440, 1000, 'Design a product team kanban board for the October release, with sidebar, filters, four workflow columns, realistic tasks, priorities, due dates and assignee initials.'],
  ['chat-app-screen', 'chat app screen', 1440, 1000, 'Design a team chat screen for Acme Studio with workspace and channel navigation, a Design reviews conversation with realistic messages, a shared link preview and composer.'],
  ['music-player', 'music player', 390, 844, 'Design a mobile music player showing Midnight Drive by Luna Park. Include original abstract album artwork, playback progress, transport controls, device selector and a compact Up next queue.'],
].map(([id, kind, w, h, prompt]) => ({ id, kind, prompt, frame: { w, h } }));
export const TASKS = DESIGN_BENCH_TASKS;
export default DESIGN_BENCH_TASKS;
