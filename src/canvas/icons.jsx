import PropTypes from "prop-types";
export const ICON_STROKE_WIDTH = 1.5;
/**
 * The icon set.
 *
 * Icons come from Lucide (ISC, 24x24, stroke-based) — the stroke drawing is
 * what makes them sit quietly behind the content at the 13-17px sizes this UI
 * uses. Each glyph is its own module and the package declares
 * `sideEffects: false`, so the bundle only carries the ones named here.
 *
 * Aliases are re-exported rather than wrapped: a wrapper would break the
 * `size`/`strokeWidth` props callers already pass through.
 */
export { Pin as IconPin } from "lucide-react";
export { Hand as IconHand } from "lucide-react";
export { Spline as IconBend } from "lucide-react";
export { Scissors as IconCut } from "lucide-react";
export { PanelLeft as IconPanelLeft } from "lucide-react";
export { Smartphone as IconSmartphone } from "lucide-react";
export { PanelRightClose as IconPanelRightClose } from "lucide-react";
export { Plus as IconAdd } from "lucide-react";
export { Diamond as IconDiamond } from "lucide-react";
export { Minus as IconMinus } from "lucide-react";
export { Search as IconSearch } from "lucide-react";
export { AtSign as IconAt } from "lucide-react";
export { Map as IconMap } from "lucide-react";
export { LayoutGrid as IconLayoutGrid } from "lucide-react";
export { Grid3x3 as IconGrid3x3 } from "lucide-react";
/* "Group Chrome tabs" (web_sidebar): Lucide's Group is the one glyph that draws
   several objects inside a single enclosure — the closest reading of "a set of
   tabs collected into one", where Shapes/Boxes/SquareStack all read as separate
   objects and LayoutGrid reads as a layout. */
export { Group as IconGroup } from "lucide-react";
export { GitBranch as IconBranch } from "lucide-react";
export { ZoomIn as IconZoomIn } from "lucide-react";
export { ZoomOut as IconZoomOut } from "lucide-react";
export { X as IconClose } from "lucide-react";
export { Heart as IconHeart } from "lucide-react";
export { ChevronDown as IconChevronDown } from "lucide-react";
export { ChevronLeft as IconChevronLeft } from "lucide-react";
export { ChevronRight as IconChevronRight } from "lucide-react";
export { ChevronUp as IconChevronUp } from "lucide-react";
export { ArrowUp as IconArrowUp } from "lucide-react";
export { MoreHorizontal as IconMore } from "lucide-react";
export { Check as IconCheck } from "lucide-react";
export { SlidersHorizontal as IconSliders } from "lucide-react";
export { Galaxy as IconGalaxy } from "lucide-react";
export { GripVertical as IconDraggable } from "lucide-react";
export { MousePointer2 as IconCursor } from "lucide-react";
export { Maximize2 as IconExpand } from "lucide-react";
export { Maximize as IconMaximize } from "lucide-react";
export { Minimize2 as IconCollapse } from "lucide-react";
export { CirclePlay as IconPlayCircle } from "lucide-react";
export { Play as IconPlay } from "lucide-react";
export { Pause as IconPause } from "lucide-react";
export { SkipBack as IconSkipBack } from "lucide-react";
export { SkipForward as IconSkipForward } from "lucide-react";
export { Repeat as IconRepeat } from "lucide-react";
export { HelpCircle as IconHelpCircle } from "lucide-react";
export { Info as IconInfo } from "lucide-react";
export { ExternalLink as IconExternalLink } from "lucide-react";
export { Frame as IconFrame } from "lucide-react";
export { Component as IconComponent } from "lucide-react";
export { Square as IconStop } from "lucide-react";
export { RotateCcw as IconRestart } from "lucide-react";
export { RefreshCw as IconRefresh } from "lucide-react";
export { Undo2 as IconUndo } from "lucide-react";
export { Redo2 as IconRedo } from "lucide-react";
export { Download as IconDownload } from "lucide-react";
export { Upload as IconUpload } from "lucide-react";
export { Settings as IconSettings } from "lucide-react";
export { Bolt as IconBolt } from "lucide-react";
export { Users as IconUsers } from "lucide-react";
export { Images as IconGallery } from "lucide-react";
export { Image as IconImage } from "lucide-react";
export { Music as IconMusic } from "lucide-react";
export { ImagePlay as IconImageAi } from "lucide-react";
export { Clapperboard as IconClapper } from "lucide-react";
export { Video as IconVideo } from "lucide-react";
export { Film as IconFilm } from "lucide-react";
export { Volume2 as IconVolume2 } from "lucide-react";
export { VolumeX as IconVolumeX } from "lucide-react";
export { Clock3 as IconTime } from "lucide-react";
export { MessageSquarePlus as IconMessagePlus } from "lucide-react";
export { Eye as IconEye } from "lucide-react";
export { EyeOff as IconEyeOff } from "lucide-react";
export { Trash2 as IconTrash } from "lucide-react";
export { Scissors as IconScissors } from "lucide-react";
export { ArrowLeftToLine as IconRippleDelete } from "lucide-react";
export { Copy as IconCopy } from "lucide-react";
export { FilePlus as IconFileAdd } from "lucide-react";
export { FileText as IconFileText } from "lucide-react";
export { Folder as IconFolder } from "lucide-react";
export { FolderOpen as IconFolderOpen } from "lucide-react";
export { FolderPlus as IconFolderPlus } from "lucide-react";
export { FolderMinus as IconFolderMinus } from "lucide-react";
export { Save as IconSave } from "lucide-react";
export { Brush as IconBrush } from "lucide-react";
export { Paintbrush as IconPaint } from "lucide-react";
export { Sun as IconSun } from "lucide-react";
export { SunMedium as IconSunMedium } from "lucide-react";
export { Camera as IconCamera } from "lucide-react";
export { Droplets as IconDroplets } from "lucide-react";
/* Brush-mode glyphs. Opposite modes get opposite silhouettes, not the same
   shape at two settings — `Sun` vs `SunMedium` was indistinguishable at 15px
   and blur/sharpen shared one glyph outright. Pointer/Droplet/Cone/Moon follow
   Photoshop's own physical metaphors: finger, water, cone tip, no light. */
export { Pointer as IconPointer } from "lucide-react";
export { Droplet as IconDroplet } from "lucide-react";
export { Cone as IconCone } from "lucide-react";
export { Moon as IconMoon } from "lucide-react";
export { Magnet as IconMagnet } from "lucide-react";
export { PictureInPicture2 as IconPictureInPicture } from "lucide-react";
export { SmilePlus as IconSticker } from "lucide-react";
export { Captions as IconSubtitles } from "lucide-react";
export { Zap as IconZap } from "lucide-react";
export { Server as IconServer } from "lucide-react";
export { Shuffle as IconShuffle } from "lucide-react";
export { Bookmark as IconBookmark } from "lucide-react";
export { MapPin as IconMarker } from "lucide-react";
export {
  ArrowDownToDot as IconArrowDownToDot,
  ArrowDownToDot as IconAnnotate,
} from "lucide-react";
export { Puzzle as IconPuzzle } from "lucide-react";

/**
 * Raw Lucide glyph data for the two icons `mention_textarea.jsx` has to write
 * as an HTML string.
 *
 * The mention chip is assembled with `innerHTML`, so it cannot render a React
 * component. Running these two through `react-dom/server`'s
 * `renderToStaticMarkup` would drag the whole legacy server renderer (~35 KB)
 * into the L0 `vendor-react` chunk for two 12px glyphs, so instead each glyph
 * module exposes Lucide's own `iconNode` here and the caller serializes that.
 * Importing the glyph modules directly (rather than through the barrel) keeps
 * the data set to the two named here, and this file stays the only place that
 * reaches into lucide-react.
 */
export { __iconData as IconImageNode } from "lucide-react/dist/esm/icons/image.mjs";
export { __iconData as IconCloseNode } from "lucide-react/dist/esm/icons/x.mjs";

/** Question mark icon without circle wrapper. */
export function IconHelp({
  size = 15,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/** Swap panels / toggle axis icon. */
export function IconSwap({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M3 8.75H21L17.6 4.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 14.75H3L6.4 18.75"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Photoshop-style layer mask icon: rounded rectangle with a filled circle inside. */
export function IconMask({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4" width="18" height="16" rx="3" ry="3" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export { IconMotion } from "./icons_motion.jsx";

/** Layer prompt / AI reference icon. */
export function IconLayerPrompt({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 11V5C21 4.46957 20.7893 3.96086 20.4142 3.58579C20.0391 3.21071 19.5304 3 19 3H5C4.46957 3 3.96086 3.21071 3.58579 3.58579C3.21071 3.96086 3 4.46957 3 5V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H11" />
      <path d="M18.2555 21.9077C18.3273 21.8481 18.376 21.7653 18.3931 21.6735C18.531 20.8536 18.9211 20.097 19.509 19.509C20.097 18.9211 20.8536 18.531 21.6735 18.3931C21.7653 18.376 21.8481 18.3273 21.9077 18.2555C21.9674 18.1837 22 18.0933 22 18C22 17.9067 21.9674 17.8163 21.9077 17.7445C21.8481 17.6727 21.7653 17.624 21.6735 17.6069C20.8536 17.469 20.097 17.0789 19.509 16.491C18.9211 15.903 18.531 15.1464 18.3931 14.3265C18.376 14.2347 18.3273 14.1519 18.2555 14.0923C18.1837 14.0326 18.0933 14 18 14C17.9067 14 17.8163 14.0326 17.7445 14.0923C17.6727 14.1519 17.624 14.2347 17.6069 14.3265C17.469 15.1464 17.0789 15.903 16.491 16.491C15.903 17.0789 15.1464 17.469 14.3265 17.6069C14.2347 17.624 14.1519 17.6727 14.0923 17.7445C14.0326 17.8163 14 17.9067 14 18C14 18.0933 14.0326 18.1837 14.0923 18.2555C14.1519 18.3273 14.2347 18.376 14.3265 18.3931C15.1464 18.531 15.903 18.9211 16.491 19.509C17.0789 20.097 17.469 20.8536 17.6069 21.6735C17.624 21.7653 17.6727 21.8481 17.7445 21.9077C17.8163 21.9674 17.9067 22 18 22C18.0933 22 18.1837 21.9674 18.2555 21.9077Z" />
    </svg>
  );
}

/** Corner radius icon. */
export function IconCornerRadius({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M4 20V16C4 9.37258 9.37258 4 16 4H20"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Opacity / transparency icon: circle with half solid, half transparent. */
export function IconOpacity({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path
        d="M12 4A8 8 0 0 0 12 20Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Healing family glyphs (spot / AI repair / patch / clone stamp).
 *
 * Spot and Clone are lucide's Bandage and Stamp: lucide already draws exactly
 * those objects, and its versions survive 16px better than the hand-drawn ones
 * did — the old plaster read as a chain link and the old stamp's base and
 * handle ran together. The two lucide has no glyph for are drawn here on the
 * same 24x24 box with the same 2px round stroke.
 */

/**
 * AI Repair: the plaster again, made room for the sparkle every AI tool
 * carries in the bottom-right corner — the same construction IconAiRemove and
 * IconAiObjectSelection use, so this reads as the AI version of Spot rather
 * than as an unrelated tool. The old glyph drew a sparkle of its own, which
 * matched neither the AI family nor this one.
 */
export function IconHealAi({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <g transform="scale(0.7)">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path d="M6 6v12M18 6v12" />
        <path d="M10 10.01h.01M10 14.01h.01M14 10.01h.01M14 14.01h.01" />
      </g>
      <g transform="translate(3.6 3.4) scale(0.8)">
        <path d="M18.3194 21.8847C18.4091 21.8101 18.47 21.7066 18.4914 21.5919C18.6638 20.5669 19.1513 19.6212 19.8863 18.8863C20.6212 18.1513 21.5669 17.6638 22.5919 17.4914C22.7066 17.47 22.8101 17.4091 22.8847 17.3194C22.9592 17.2296 23 17.1167 23 17C23 16.8833 22.9592 16.7704 22.8847 16.6806C22.8101 16.5909 22.7066 16.53 22.5919 16.5086C21.5669 16.3362 20.6212 15.8487 19.8863 15.1137C19.1513 14.3788 18.6638 13.4331 18.4914 12.4081C18.47 12.2934 18.4091 12.1899 18.3194 12.1153C18.2296 12.0408 18.1167 12 18 12C17.8833 12 17.7704 12.0408 17.6806 12.1153C17.5909 12.1899 17.53 12.2934 17.5086 12.4081C17.3362 13.4331 16.8487 14.3788 16.1137 15.1137C15.3788 15.8487 14.4331 16.3362 13.4081 16.5086C13.2934 16.53 13.1899 16.5909 13.1153 16.6806C13.0408 16.7704 13 16.8833 13 17C13 17.1167 13.0408 17.2296 13.1153 17.3194C13.1899 17.4091 13.2934 17.47 13.4081 17.4914C14.4331 17.6638 15.3788 18.1513 16.1137 18.8863C16.8487 19.6212 17.3362 20.5669 17.5086 21.5919C17.53 21.7066 17.5909 21.8101 17.6806 21.8847C17.7704 21.9592 17.8833 22 18 22C18.1167 22 18.2296 21.9592 18.3194 21.8847Z" />
      </g>
    </svg>
  );
}

/**
 * Patch Tool: the marked-out region laid over the area it replaces.
 *
 * The previous glyph put two small squares in opposite corners with a line
 * between them, which is the copy/duplicate idiom. Overlapping them says
 * "this patches that" instead, and the dashed edge marks which one is the
 * selection — the same overlap lucide uses for Blend, which is the operation
 * this tool actually performs.
 */
export function IconHealPatch({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect
        x="2"
        y="2"
        width="11"
        height="11"
        rx="2.5"
        strokeDasharray="3 2.5"
      />
      <rect x="11" y="11" width="11" height="11" rx="2.5" />
    </svg>
  );
}

export { Bandage as IconHealSpot } from "lucide-react";
export { Stamp as IconHealClone } from "lucide-react";
export { Eraser as IconEraser } from "lucide-react";
export { Bandage as IconHealing } from "lucide-react";
export { Stamp as IconStamp } from "lucide-react";
export { Lasso as IconLasso } from "lucide-react";
export { Crop as IconCrop } from "lucide-react";
export { Square as IconSquare } from "lucide-react";
export { Circle as IconCircle } from "lucide-react";
export { ArrowUpRight as IconArrowUpRight } from "lucide-react";
export { Slash as IconSlash } from "lucide-react";
export { Triangle as IconTriangle } from "lucide-react";
export { Star as IconStar } from "lucide-react";
export { Pipette as IconPipette } from "lucide-react";
export { Palette as IconPalette } from "lucide-react";
export { PaintBucket as IconBucket } from "lucide-react";
export { Blend as IconGradient } from "lucide-react";
/** Selection Tool: 矩形选择 (Rectangular Marquee) */
export function IconSelectionRect({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 25"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 4C4.46957 4 3.96086 4.21071 3.58579 4.58579C3.21071 4.96086 3 5.46957 3 6" />
      <path d="M19 22C19.5304 22 20.0391 21.7893 20.4142 21.4142C20.7893 21.0391 21 20.5304 21 20" />
      <path d="M19 4C19.5304 4 20.0391 4.21071 20.4142 4.58579C20.7893 4.96086 21 5.46957 21 6" />
      <path d="M5 22C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20" />
      <path d="M9 4H10" />
      <path d="M15 22H14" />
      <path d="M14 4H15" />
      <path d="M10 22H9" />
      <path d="M3 10V11" />
      <path d="M21 16V15" />
      <path d="M3 15V16" />
      <path d="M21 11V10" />
    </svg>
  );
}

/** Selection Tool: 圆形选择 (Elliptical Marquee) */
export function IconSelectionEllipse({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 25"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12.5" r="9.5" strokeDasharray="3 4" />
    </svg>
  );
}

/** Selection Tool: 自由选择 (Freehand Lasso Selection) */
export function IconSelectionFree({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 25"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path
        d="M3.704 15.4671C2.3274 13.8314 1.7544 11.8467 2.095 9.89375C2.4355 7.94082 3.6656 6.1573 5.5492 4.88549C7.4328 3.61367 9.8371 2.94317 12.3008 3.00267C14.7645 3.06217 17.1139 3.84747 18.8981 5.20786C20.6824 6.56825 21.7758 8.40788 21.9685 10.3737C22.1611 12.3395 21.4395 14.293 19.9421 15.8592C18.4447 17.4254 16.2769 18.4941 13.855 18.86C11.433 19.226 8.9274 18.8635 6.819 17.8421"
        strokeDasharray="3 4"
      />
      <path d="M7 23.0001C6.3798 22.535 5.8763 21.932 5.5292 21.2389C5.1821 20.5457 5.0009 19.7813 5 19.0061" />
      <path d="M5 19C6.1046 19 7 18.1046 7 17C7 15.8954 6.1046 15 5 15C3.8954 15 3 15.8954 3 17C3 18.1046 3.8954 19 5 19Z" />
    </svg>
  );
}

/** Patch Tool: 修补工具 (Patch Tool) */
export function IconPatch({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path
        d="M4 14a8 8 0 0 1 16 0c0 4.418-3.582 7-8 7s-8-2.582-8-7z"
        strokeDasharray="3 3"
      />
      <path d="M9 12l6 6M15 12l-6 6" />
    </svg>
  );
}

/** Selection Tool: 多边形套索 (Polygonal Lasso Selection) */
export function IconSelectionPolygon({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 25"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3.5L21 9.5V18.5L12 24.5L3 18.5V9.5Z" strokeDasharray="3 4" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** AI Tool 1: 自动抠图 (Auto Mask with Sparkle) */
export function IconAiAutoMask({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 11V5C21 4.46957 20.7893 3.96086 20.4142 3.58579C20.0391 3.21071 19.5304 3 19 3H5C4.46957 3 3.96086 3.21071 3.58579 3.58579C3.21071 3.96086 3 4.46957 3 5V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H11" />
      <path d="M18.3194 21.8847C18.4091 21.8101 18.47 21.7066 18.4914 21.5919C18.6638 20.5669 19.1513 19.6212 19.8863 18.8863C20.6212 18.1513 21.5669 17.6638 22.5919 17.4914C22.7066 17.47 22.8101 17.4091 22.8847 17.3194C22.9592 17.2296 23 17.1167 23 17C23 16.8833 22.9592 16.7704 22.8847 16.6806C22.8101 16.5909 22.7066 16.53 22.5919 16.5086C21.5669 16.3362 20.6212 15.8487 19.8863 15.1137C19.1513 14.3788 18.6638 13.4331 18.4914 12.4081C18.47 12.2934 18.4091 12.1899 18.3194 12.1153C18.2296 12.0408 18.1167 12 18 12C17.8833 12 17.7704 12.0408 17.6806 12.1153C17.5909 12.1899 17.53 12.2934 17.5086 12.4081C17.3362 13.4331 16.8487 14.3788 16.1137 15.1137C15.3788 15.8487 14.4331 16.3362 13.4081 16.5086C13.2934 16.53 13.1899 16.5909 13.1153 16.6806C13.0408 16.7704 13 16.8833 13 17C13 17.1167 13.0408 17.2296 13.1153 17.3194C13.1899 17.4091 13.2934 17.47 13.4081 17.4914C14.4331 17.6638 15.3788 18.1513 16.1137 18.8863C16.8487 19.6212 17.3362 20.5669 17.5086 21.5919C17.53 21.7066 17.5909 21.8101 17.6806 21.8847C17.7704 21.9592 17.8833 22 18 22C18.1167 22 18.2296 21.9592 18.3194 21.8847Z" />
      <path d="M16.5 9.81794C15.6896 8.14985 13.9791 7 12 7C9.23858 7 7 9.23858 7 12C7 13.8507 8.0055 15.4666 9.5 16.3311" />
    </svg>
  );
}

/** AI Tool 2: 选择对象 (Object Selection with Sparkle) */
export function IconAiObjectSelection({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 22C6.37902 21.5343 5.875 20.9303 5.52786 20.2361C5.18073 19.5418 5 18.7762 5 18" />
      <path d="M7 16.9299C7.96 17.3599 8.96 17.6699 9.99 17.8399" />
      <path
        d="M3.34 14C2.48059 12.8424 2.01134 11.4417 2 10C2 5.58 6.48 2 12 2C17.52 2 22 5.58 22 10"
        strokeDasharray="3 4"
      />
      <path d="M5 18C5.53043 18 6.03914 17.7893 6.41421 17.4142C6.78929 17.0391 7 16.5304 7 16C7 15.4696 6.78929 14.9609 6.41421 14.5858C6.03914 14.2107 5.53043 14 5 14C4.46957 14 3.96086 14.2107 3.58579 14.5858C3.21071 14.9609 3 15.4696 3 16C3 16.5304 3.21071 17.0391 3.58579 17.4142C3.96086 17.7893 4.46957 18 5 18Z" />
      <path d="M18.3194 21.8847C18.4091 21.8101 18.47 21.7066 18.4914 21.5919C18.6638 20.5669 19.1513 19.6212 19.8863 18.8863C20.6212 18.1513 21.5669 17.6638 22.5919 17.4914C22.7066 17.47 22.8101 17.4091 22.8847 17.3194C22.9592 17.2296 23 17.1167 23 17C23 16.8833 22.9592 16.7704 22.8847 16.6806C22.8101 16.5909 22.7066 16.53 22.5919 16.5086C21.5669 16.3362 20.6212 15.8487 19.8863 15.1137C19.1513 14.3788 18.6638 13.4331 18.4914 12.4081C18.47 12.2934 18.4091 12.1899 18.3194 12.1153C18.2296 12.0408 18.1167 12 18 12C17.8833 12 17.7704 12.0408 17.6806 12.1153C17.5909 12.1899 17.53 12.2934 17.5086 12.4081C17.3362 13.4331 16.8487 14.3788 16.1137 15.1137C15.3788 15.8487 14.4331 16.3362 13.4081 16.5086C13.2934 16.53 13.1899 16.5909 13.1153 16.6806C13.0408 16.7704 13 16.8833 13 17C13 17.1167 13.0408 17.2296 13.1153 17.3194C13.1899 17.4091 13.2934 17.47 13.4081 17.4914C14.4331 17.6638 15.3788 18.1513 16.1137 18.8863C16.8487 19.6212 17.3362 20.5669 17.5086 21.5919C17.53 21.7066 17.5909 21.8101 17.6806 21.8847C17.7704 21.9592 17.8833 22 18 22C18.1167 22 18.2296 21.9592 18.3194 21.8847Z" />
    </svg>
  );
}

/** AI Tool 3: 移除对象 (Remove Tool / Eraser with Sparkle) */
export function IconAiRemove({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18.3194 21.8847C18.4091 21.8101 18.47 21.7066 18.4914 21.5919C18.6638 20.5669 19.1513 19.6212 19.8863 18.8863C20.6212 18.1513 21.5669 17.6638 22.5919 17.4914C22.7066 17.47 22.8101 17.4091 22.8847 17.3194C22.9592 17.2296 23 17.1167 23 17C23 16.8833 22.9592 16.7704 22.8847 16.6806C22.8101 16.5909 22.7066 16.53 22.5919 16.5086C21.5669 16.3362 20.6212 15.8487 19.8863 15.1137C19.1513 14.3788 18.6638 13.4331 18.4914 12.4081C18.47 12.2934 18.4091 12.1899 18.3194 12.1153C18.2296 12.0408 18.1167 12 18 12C17.8833 12 17.7704 12.0408 17.6806 12.1153C17.5909 12.1899 17.53 12.2934 17.5086 12.4081C17.3362 13.4331 16.8487 14.3788 16.1137 15.1137C15.3788 15.8487 14.4331 16.3362 13.4081 16.5086C13.2934 16.53 13.1899 16.5909 13.1153 16.6806C13.0408 16.7704 13 16.8833 13 17C13 17.1167 13.0408 17.2296 13.1153 17.3194C13.1899 17.4091 13.2934 17.47 13.4081 17.4914C14.4331 17.6638 15.3788 18.1513 16.1137 18.8863C16.8487 19.6212 17.3362 20.5669 17.5086 21.5919C17.53 21.7066 17.5909 21.8101 17.6806 21.8847C17.7704 21.9592 17.8833 22 18 22C18.1167 22 18.2296 21.9592 18.3194 21.8847Z" />
      <path d="M12.0973 20.9995C11.8336 21.0001 6.4747 20.9491 6.231 20.8484C5.9873 20.7476 5.7659 20.5997 5.5796 20.4131L1.5856 16.4141C1.2106 16.039 1 15.5304 1 15.0001C1 14.4697 1.2106 13.9611 1.5856 13.5861L11.5856 3.58607C11.7713 3.40027 11.9918 3.25288 12.2345 3.15232C12.4772 3.05176 12.7374 3 13.0001 3C13.2628 3 13.5229 3.05176 13.7656 3.15232C14.0083 3.25288 14.2288 3.40027 14.4146 3.58607L20.4136 9.58607C20.7885 9.96113 20.9991 10.4697 20.9991 11.0001" />
      <path d="M4.0815 11.0901L9.5 16.5085" />
    </svg>
  );
}

export const IconObjectSelection = IconAiObjectSelection;
export const IconQuickSelection = IconSelectionFree;
export const IconRemove = IconAiRemove;
export const IconMagic = IconAiAutoMask;

/** AI Region Rect Selection Icon (Alias). */
export const IconRegionRect = IconAiObjectSelection;
export const IconRegionFree = IconSelectionFree;

export const IconRegion = IconSelectionRect;
export { Type as IconText } from "lucide-react";
export { Bold as IconBold } from "lucide-react";
export { Italic as IconItalic } from "lucide-react";
export { Underline as IconUnderline } from "lucide-react";
export { List as IconListUnordered } from "lucide-react";
export { ListOrdered as IconListOrdered } from "lucide-react";
export { Sparkles as IconSparkles } from "lucide-react";
export { Wand2 as IconWand } from "lucide-react";
export { PencilSparkles as IconReversePrompt } from "lucide-react";
export { Sparkles as IconSparkle } from "lucide-react";
export {
  LayoutTemplate as IconLayout,
  LayoutTemplate as IconLayoutTemplate,
} from "lucide-react";
export { Box as IconStore } from "lucide-react";
export { Workflow as IconAlign } from "lucide-react";
export { Share2 as IconShare } from "lucide-react";
export { Pencil as IconEdit } from "lucide-react";
export { PenTool as IconPen } from "lucide-react";
export { Box as IconBox3 } from "lucide-react";
export { Cylinder as IconCylinder } from "lucide-react";
export { Pyramid as IconPyramid } from "lucide-react";
export { Torus as IconTorus, Torus as IconDonut } from "lucide-react";
export { Pentagon as IconPolygon, Pentagon as IconPentagon } from "lucide-react";
export { Plug as IconApi } from "lucide-react";
export { Braces as IconCode } from "lucide-react";
export { SquareTerminal as IconTerminal } from "lucide-react";
export { PanelRight as IconLayoutRight } from "lucide-react";
export { History as IconHistory } from "lucide-react";
export { Layers as IconLayers } from "lucide-react";
export { Layers2 as IconLayers2 } from "lucide-react";
export { CornerDownRight as IconClipMask } from "lucide-react";
export { Lock as IconLock } from "lucide-react";
export { Unlock as IconUnlock } from "lucide-react";
export { Grid3x3 as IconTransparency } from "lucide-react";
export { Move as IconMove } from "lucide-react";
export { Link2 as IconLink } from "lucide-react";
export { Unlink2 as IconUnlink } from "lucide-react";
export {
  Gamepad2 as IconGamepad,
  Palmtree as IconPalmtree,
} from "lucide-react";
export { Globe as IconGlobe } from "lucide-react";
export { Presentation as IconPresentation } from "lucide-react";
export { Asterisk as IconAsterisk } from "lucide-react";
export { Astroid as IconAstroid } from "lucide-react";
export { CircleDot as IconPoint } from "lucide-react";
export { Scissors as IconCutout } from "lucide-react";
export { RotateCcw as IconRotateCcw } from "lucide-react";
export { RotateCw as IconRotateCw } from "lucide-react";
export { BringToFront as IconBringToFront } from "lucide-react";
export { SendToBack as IconSendToBack } from "lucide-react";
export { FlipHorizontal2 as IconFlipH } from "lucide-react";
export { FlipVertical2 as IconFlipV } from "lucide-react";
export { AlignLeft as IconAlignLeft } from "lucide-react";
export { AlignCenter as IconAlignCenter } from "lucide-react";
export { AlignRight as IconAlignRight } from "lucide-react";

/* Adjustment / filter / layer-style glyphs.
 *
 * These carry the `Glyph` suffix because Lucide names are generic and several
 * collide with icons already exported above (`Sun`, `Moon`, `Palette`,
 * `Square`, `Brush`, `Camera`). The suffix keeps the vocabulary of this file
 * from silently meaning two things; the consumer is `kind_icons.jsx`.
 *
 * `Sparkle` and `Sparkles` are both deliberate: `effect.glow` and
 * `tone.vibrance` must not share a glyph, and Lucide draws them differently.
 */
export { Sun as IconGlyphSun } from "lucide-react";
export { Contrast as IconGlyphContrast } from "lucide-react";
export { Aperture as IconGlyphAperture } from "lucide-react";
export { SunMedium as IconGlyphSunMedium } from "lucide-react";
export { Moon as IconGlyphMoon } from "lucide-react";
export { Thermometer as IconGlyphThermometer } from "lucide-react";
export { Droplet as IconGlyphTint } from "lucide-react";
export { Palette as IconGlyphHue } from "lucide-react";
export { Droplets as IconGlyphSaturation } from "lucide-react";
export { Sparkle as IconGlyphSparkle } from "lucide-react";
export { Spline as IconGlyphCurves } from "lucide-react";
export { ChartNoAxesColumnIncreasing as IconGlyphLevels } from "lucide-react";
export { GitCompareArrows as IconGlyphColorBalance } from "lucide-react";
export { Blend as IconGlyphPhotoFilter } from "lucide-react";
export { ChartNoAxesColumn as IconGlyphChannelMixer } from "lucide-react";
export { Pipette as IconGlyphSelectiveColor } from "lucide-react";
export { SlidersVertical as IconGlyphGradientMap } from "lucide-react";
export { CircleDashed as IconGlyphBlur } from "lucide-react";
export { Wand as IconGlyphSharpen } from "lucide-react";
export { Grip as IconGlyphNoise } from "lucide-react";
export { Cloud as IconGlyphClouds } from "lucide-react";
export { Grid3x3 as IconGlyphPixelate } from "lucide-react";
export { Equal as IconGlyphPosterize } from "lucide-react";
export { Eclipse as IconGlyphSolarize } from "lucide-react";
export { CircleDot as IconGlyphHalftone } from "lucide-react";
export { Highlighter as IconGlyphEmboss } from "lucide-react";
export { Camera as IconGlyphSepia } from "lucide-react";
export { Focus as IconGlyphVignette } from "lucide-react";
export { SquareStack as IconGlyphShadow } from "lucide-react";
export { Sparkles as IconGlyphGlow } from "lucide-react";
export { Scan as IconGlyphInnerShadow } from "lucide-react";
export { ScanLine as IconGlyphInnerGlow } from "lucide-react";
export { Waves as IconGlyphSatin } from "lucide-react";
export { Cone as IconGlyphBevel } from "lucide-react";
export { PaintBucket as IconGlyphFill } from "lucide-react";
/* `Rainbow`, not `Blend`: Photo Filter also reads as "two tones mixed", and both
   kinds appear in the same add-kind popover. A rainbow is the spectrum a
   gradient overlay lays down, and it shares no silhouette with anything else in
   the effects group. */
export { Rainbow as IconGlyphGradientOverlay } from "lucide-react";
export { SquareDashed as IconGlyphStroke } from "lucide-react";

/* Boolean selection modes: replace / union / subtract / intersect.
 *
 * Lucide's `squares-*` family draws one boolean operation per glyph, so the
 * four modes are four different silhouettes rather than one shape at four
 * settings. The hand-drawn set had that same property; this keeps it at the
 * icon set's uniform stroke weight and 24px grid.
 */
export { Square as IconSelectionReplace } from "lucide-react";
export { SquaresUnite as IconSelectionUnion } from "lucide-react";
export { SquaresSubtract as IconSelectionSubtract } from "lucide-react";
export { SquaresIntersect as IconSelectionIntersect } from "lucide-react";

/* Editor tool-option glyphs (arrow size, brush width / hardness / opacity). */
export { MoveHorizontal as IconArrowSize } from "lucide-react";
export { Brush as IconBrushWidth } from "lucide-react";
export { CircleDashed as IconBrushHardness } from "lucide-react";
export { CircleDot as IconBrushOpacity } from "lucide-react";

IconRemove.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconObjectSelection.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconHelp.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconQuickSelection.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconSwap.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconMask.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconPatch.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconLayerPrompt.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconRegionRect.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconRegionFree.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconSelectionPolygon.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconCornerRadius.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconOpacity.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconSelectionRect.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconSelectionEllipse.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconSelectionFree.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconAiAutoMask.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconAiObjectSelection.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconAiRemove.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

/** Perspective transform tool icon (4-corner trapezoid grid). */
export function IconPerspective({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 19L8 5h8l3 14H5z" />
      <path d="M7 12h10" />
      <path d="M12 5v14" />
      <path d="M6 15.5h12" />
      <path d="M7.5 8.5h9" />
    </svg>
  );
}

/** Mesh warp tool icon (wavy curved grid). */
export function IconMeshWarp({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 6c4-2 12 2 16 0" />
      <path d="M4 12c4-2 12 2 16 0" />
      <path d="M4 18c4-2 12 2 16 0" />
      <path d="M6 4c-2 4 2 12 0 16" />
      <path d="M12 4c-2 4 2 12 0 16" />
      <path d="M18 4c-2 4 2 12 0 16" />
    </svg>
  );
}

/** Freeform warp / Liquify / Puppet tool icon. */
export function IconDistort({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4 21l3.39-.97C8.93 20.66 10.42 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9z" />
      <path d="M8 12c1.5-2 4.5-2 6 0s4.5 2 2 4-5 1-8-4z" />
    </svg>
  );
}

/** Vector square transform icon (bounding box with 4 corner anchor points). */
export function IconVectorSquare({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        stroke="currentColor"
        fill="none"
      />
      <rect
        x="2"
        y="2"
        width="5"
        height="5"
        fill="currentColor"
        stroke="none"
        rx="0.5"
      />
      <rect
        x="17"
        y="2"
        width="5"
        height="5"
        fill="currentColor"
        stroke="none"
        rx="0.5"
      />
      <rect
        x="2"
        y="17"
        width="5"
        height="5"
        fill="currentColor"
        stroke="none"
        rx="0.5"
      />
      <rect
        x="17"
        y="17"
        width="5"
        height="5"
        fill="currentColor"
        stroke="none"
        rx="0.5"
      />
    </svg>
  );
}

IconPerspective.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconMeshWarp.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconDistort.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconVectorSquare.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconHealAi.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

IconHealPatch.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

export function IconHd({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="4" width="20" height="16" rx="4" />
      <path d="M6 8v8" />
      <path d="M10 8v8" />
      <path d="M6 12h4" />
      <path d="M14 8v8h2.5a3.5 3.5 0 0 0 0-7H14z" />
    </svg>
  );
}

IconHd.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

export function IconGoogle({
  size = 14,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20.5 12.2A8.5 8.5 0 1 1 18.2 6.3L15 9.5a4.5 4.5 0 1 0 1.9 2.7H12" />
    </svg>
  );
}

IconGoogle.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

export function IconGithub({
  size = 14,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

IconGithub.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

export function IconChrome({ size = 14, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <title>Google Chrome</title>
      <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />
    </svg>
  );
}

IconChrome.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};

/**
 * The user-provided OpenCode SVG: exact 24x24 bounds with its two authored
 * paths — the bounds path stays `fill="none"`, the mark paints
 * `fill="currentColor"`.
 *
 * Filled, not stroked — like `IconChrome` above it, colour comes from the
 * surrounding text, so it reads on every surface without a `BRAND_COLORS`
 * entry. `width`/`height` are pinned to `1em` unconditionally; a caller's
 * `size` is honoured through `fontSize` instead, so 1em resolves to the
 * requested box while the attributes stay `1em`. The card's `size-*` class
 * overrides the box exactly as it does for the Lucide glyphs beside it. No
 * wrapper tile — the design contract bans an icon inside one.
 */
export function IconOpenCode({ size, className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={size == null ? undefined : { fontSize: size }}
    >
      <path d="M0 0h24v24H0z" fill="none" />
      <path d="M22 24H2V0h20zM17 4.8H7v14.4h10z" fill="currentColor" />
    </svg>
  );
}

IconOpenCode.propTypes = {
  /** honoured through `fontSize` — the svg width/height stay `1em` */
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
};

/**
 * 8-ray asterisk icon representing points / credits (米字 Icon).
 */
export function IconCredits({
  size = 14,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M5.64 18.36l12.72-12.72" />
    </svg>
  );
}

IconCredits.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

export {
  IconCredits as IconCredit,
  IconCredits as IconCreditAsterisk,
  IconCredits as IconPoints,
};

/** Wireframe sphere icon with equator line. */
export function IconSphere({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" />
    </svg>
  );
}

IconSphere.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

/** Spiral coil / helix icon. */
export function IconHelix({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 4.5c5-2 10 0 10 2.5s-5 3.5-10 2 10-.5 10 2.5-5 3.5-10 2 10-.5 10 2.5-5 3.5-10 2 10-.5 10 2" />
    </svg>
  );
}

IconHelix.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

/** Icosahedron facet wireframe icon. */
export function IconIcosahedron({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="12 2 20.5 7 20.5 17 12 22 3.5 17 3.5 7" />
      <line x1="12" y1="2" x2="12" y2="22" />
      <polyline points="3.5 7 12 12 20.5 7" />
      <polyline points="3.5 17 12 12 20.5 17" />
    </svg>
  );
}

IconIcosahedron.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

/** Dodecahedron facet wireframe icon. */
export function IconDodecahedron({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="12 2 21 8.5 17.5 19 6.5 19 3 8.5" />
      <polygon points="12 15 15.5 12.5 14 8.5 10 8.5 8.5 12.5" />
      <line x1="12" y1="2" x2="12" y2="8.5" />
      <line x1="21" y1="8.5" x2="15.5" y2="12.5" />
      <line x1="17.5" y1="19" x2="12" y2="15" />
      <line x1="6.5" y1="19" x2="8.5" y2="12.5" />
      <line x1="3" y1="8.5" x2="10" y2="8.5" />
    </svg>
  );
}

IconDodecahedron.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};

/** Torus knot / trefoil wireframe icon. */
export function IconTorusKnot({
  size = 16,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 7 4M12 20a8 8 0 0 1-7-4" />
      <ellipse cx="12" cy="12" rx="4" ry="8" transform="rotate(30 12 12)" />
      <ellipse cx="12" cy="12" rx="4" ry="8" transform="rotate(-30 12 12)" />
    </svg>
  );
}

IconTorusKnot.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};
