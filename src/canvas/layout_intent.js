const UI_INTENT =
  /\b(?:ui|app|application|website|webpage|dashboard|interface|screen)\b|界面|应用|网页|网站|首页|小程序/i;
const MOBILE_INTENT =
  /\b(?:mobile|phone|iphone|android|ios|app)\b|移动端|手机|小程序/i;
const WEB_INTENT =
  /\b(?:desktop|website|webpage|dashboard|web)\b|桌面|网页|网站|仪表盘/i;

/** Infer only an obvious UI target; callers keep explicit canvas choices. */
export function inferUiLayout(prompt) {
  if (!UI_INTENT.test(prompt)) return null;
  return {
    skill: "ui",
    media:
      MOBILE_INTENT.test(prompt) && !WEB_INTENT.test(prompt) ? "mobile" : "web",
  };
}
