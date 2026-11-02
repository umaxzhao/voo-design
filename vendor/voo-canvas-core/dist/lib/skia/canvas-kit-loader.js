const CANVAS_KIT_SCRIPT_ID = "voo-canvaskit-runtime";
let assetUrls = {
    script: "/canvaskit.js",
    wasm: "/canvaskit.wasm",
};
/** Must be called before `loadCanvasKit`; afterwards it has no effect. */
export function setCanvasKitAssetUrls(urls) {
    assetUrls = { ...assetUrls, ...urls };
}
let canvasKitPromise = null;
function getInitializer() {
    const candidate = window
        .CanvasKitInit;
    return typeof candidate === "function"
        ? candidate
        : null;
}
function loadInitializer() {
    const existing = getInitializer();
    if (existing)
        return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
        const priorScript = document.getElementById(CANVAS_KIT_SCRIPT_ID);
        const script = priorScript instanceof HTMLScriptElement
            ? priorScript
            : document.createElement("script");
        const handleLoad = () => {
            const initializer = getInitializer();
            if (initializer)
                resolve(initializer);
            else
                reject(new Error("CanvasKit script loaded without CanvasKitInit"));
        };
        script.addEventListener("load", handleLoad, { once: true });
        script.addEventListener("error", () => reject(new Error("CanvasKit runtime script failed to load")), { once: true });
        if (!priorScript) {
            script.id = CANVAS_KIT_SCRIPT_ID;
            script.src = assetUrls.script;
            script.async = true;
            document.head.appendChild(script);
        }
    });
}
export function loadCanvasKit() {
    if (canvasKitPromise)
        return canvasKitPromise;
    canvasKitPromise = loadInitializer()
        .then((initialize) => initialize({
        locateFile: (fileName) => fileName.endsWith(".wasm") ? assetUrls.wasm : fileName,
    }))
        .catch((error) => {
        canvasKitPromise = null;
        throw error;
    });
    return canvasKitPromise;
}
export function resetCanvasKitForTests() {
    canvasKitPromise = null;
}
//# sourceMappingURL=canvas-kit-loader.js.map