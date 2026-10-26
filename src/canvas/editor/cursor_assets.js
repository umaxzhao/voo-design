/**
 * Editor cursor artwork.
 *
 * These three glyphs are the supplied cursor set: horizontal resize, vertical
 * resize, and rotate. They are inline data URLs so the cursors never depend on
 * a public PNG that may be missing in a packaged build.
 */

const encodeSvg = (svg) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const horizontalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="10 10 20 20"><path d="M10 19.4975V19.505L17.4962 27L17.4975 22H22.5212V27L29.9963 19.5L22.5212 12L22.5225 17.025L19.9963 17.0275H17.4962L17.4975 12L10 19.4975ZM11.7638 19.5025L16.2475 15.0175L16.2462 18.2513H23.7725V15.02L28.2288 19.5025L23.7737 23.9838L23.7725 20.7525H20.6213L16.2475 20.7513L16.2462 23.9838L11.7638 19.5025Z" fill="#fff"/><path d="M20.6212 20.7512H23.7724V23.9837L28.2287 19.5012L23.7724 15.02V18.2762H16.2462V15.0175L11.7637 19.5012L16.2462 23.9837V20.75L20.6212 20.7512Z" fill="#000"/></svg>`;

const verticalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="75 9 18 22"><path d="M83.5025 10L83.495 10L76 17.4962L81 17.4975L81 22.5212L76 22.5212L83.5 29.9962L91 22.5212L85.975 22.5225L85.9725 19.9962L85.9725 17.4962L91 17.4975L83.5025 10ZM83.4975 11.7637L87.9825 16.2475L84.7487 16.2462L84.7487 23.7725L87.98 23.7725L83.4975 28.2287L79.0162 23.7737L82.2475 23.7725L82.2475 20.6212L82.2487 16.2475L79.0162 16.2462L83.4975 11.7637Z" fill="#fff"/><path d="M82.2487 20.6213L82.2487 23.7725L79.0162 23.7725L83.4987 28.2288L87.9799 23.7725L84.7237 23.7725L84.7237 16.2463L87.9824 16.2463L83.4987 11.7638L79.0162 16.2463L82.2499 16.2463L82.2487 20.6213Z" fill="#000"/></svg>`;

const rotateSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="138 11 20 20"><mask id="m" maskUnits="userSpaceOnUse" x="137" y="9" width="23" height="23"><rect x="137" y="9" width="23" height="23" fill="#fff"/><path d="M152 29L148 25H150.5V22C150.5 20.067 148.933 18.5 147 18.5H144V21L140 17L144 13V15.5H147C150.59 15.5 153.5 18.4101 153.5 22V25H156L152 29Z"/></mask><path d="M152 29L148 25H150.5V22C150.5 20.067 148.933 18.5 147 18.5H144V21L140 17L144 13V15.5H147C150.59 15.5 153.5 18.4101 153.5 22V25H156L152 29Z" fill="#000"/><path d="M152 29L148 25H150.5V22C150.5 20.067 148.933 18.5 147 18.5H144V21L140 17L144 13V15.5H147C150.59 15.5 153.5 18.4101 153.5 22V25H156L152 29Z" stroke="#fff" stroke-width="3" mask="url(#m)"/></svg>`;

export const HORIZONTAL_SCALE_CURSOR = `${encodeSvg(horizontalSvg)} 12 12, ew-resize`;
export const VERTICAL_SCALE_CURSOR = `${encodeSvg(verticalSvg)} 12 12, ns-resize`;
export const ROTATE_CURSOR = `${encodeSvg(rotateSvg)} 12 12, crosshair`;
