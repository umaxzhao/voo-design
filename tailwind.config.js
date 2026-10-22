import tokens from "./design/tokens.cjs";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,html}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Intel One Mono"',
          "ui-monospace",
          '"SFMono-Regular"',
          "Menlo",
          "monospace",
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"微软雅黑"',
          "sans-serif",
        ],
        mono: [
          '"Intel One Mono"',
          "ui-monospace",
          '"SFMono-Regular"',
          "Menlo",
          "monospace",
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"微软雅黑"',
          "sans-serif",
        ],
      },
      colors: {
        surface: {
          canvas: tokens.SURFACE.stage,
          card: tokens.SURFACE.card,
          panel: tokens.SURFACE.panel,
          raised: tokens.SURFACE.raised,
          hover: tokens.SURFACE.hover,
        },
        line: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          strong: "rgba(255, 255, 255, 0.14)",
        },
        accent: {
          purple: "#E5B2FF",
          purpleText: "#eed0ff",
          mint: "#a7ffd4",
        },
      },
      boxShadow: {
        pop: tokens.SHADOW.pop,
        menu: tokens.SHADOW.menu,
        panel: tokens.SHADOW.panel,
      },
      borderRadius: {
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
        "3xl": "24px",
      },
    },
  },
  plugins: [],
};
