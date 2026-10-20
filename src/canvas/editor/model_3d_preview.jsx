import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { loadModel3d } from "./model3d-loader.js";
import { frameModelForPreview } from "./model3d-preview-framing.js";
import { IconBox3 } from "../icons.jsx";
import { useI18n } from "../use_i18n.js";

/** Release model geometry and textures when the preview leaves the canvas. */
function disposeSceneObjects(root) {
  root?.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** Read-only GLB/OBJ preview loaded only when a 3D result node is shown. */
export default function Model3dPreview({ url, filename = "" }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [previewError, setPreviewError] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    setPreviewReady(false);

    let disposed = false;
    let renderer = null;
    let modelRoot = null;
    let modelFrame = null;
    let animId = null;
    let visible = !globalThis.IntersectionObserver;
    let observer = null;
    let resizeObserver = null;
    let scene = null;

    try {
      const width = container.clientWidth || 245;
      const height = container.clientHeight || 140;
      scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const light = new THREE.DirectionalLight(0xffffff, 2);
      light.position.set(2, 4, 3);
      scene.add(light);

      const animate = () => {
        animId = null;
        if (disposed || !visible || !modelFrame) return;
        modelFrame.group.rotation.y += 0.008;
        renderer.render(scene, camera);
        animId = requestAnimationFrame(animate);
      };

      if (globalThis.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          if (disposed) return;
          const nextWidth = Math.max(1, container.clientWidth);
          const nextHeight = Math.max(1, container.clientHeight);
          renderer.setSize(nextWidth, nextHeight, false);
          modelFrame?.fit(nextWidth, nextHeight);
          if (modelFrame) renderer.render(scene, camera);
        });
        resizeObserver.observe(container);
      }

      if (globalThis.IntersectionObserver) {
        observer = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          if (visible && modelFrame && animId === null) animate();
          if (!visible && animId !== null) {
            cancelAnimationFrame(animId);
            animId = null;
          }
        });
        observer.observe(container);
      }

      void loadModel3d(url, filename)
        .then((gltf) => {
          if (disposed) {
            disposeSceneObjects(gltf.scene);
            return;
          }
          modelRoot = gltf.scene;
          modelFrame = frameModelForPreview(
            modelRoot,
            camera,
            container.clientWidth || width,
            container.clientHeight || height,
          );
          scene.add(modelFrame.group);
          setPreviewError(false);
          setPreviewReady(true);
          if (visible) animate();
        })
        .catch((error) => {
          if (disposed) return;
          console.error("3D model preview failed", error);
          setPreviewError(true);
          setPreviewReady(false);
        });
    } catch (error) {
      console.error("3D model preview failed", error);
      setPreviewError(true);
      setPreviewReady(false);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      resizeObserver?.disconnect();
      if (animId !== null) cancelAnimationFrame(animId);
      if (modelFrame) scene?.remove(modelFrame.group);
      if (modelRoot) {
        disposeSceneObjects(modelRoot);
      }
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
  }, [url, filename]);

  return (
    <div ref={containerRef} className="relative h-full min-h-[140px] w-full">
      <canvas
        ref={canvasRef}
        data-testid="model3d-preview-canvas"
        data-ready={previewReady}
        className={`pointer-events-none h-full w-full ${previewError ? "hidden" : ""}`}
      />
      {previewError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <IconBox3 size={32} className="text-neutral-400" />
          <span className="max-w-full truncate px-3 text-[10px] text-neutral-400">
            {filename}
          </span>
          <span className="text-[9px] text-neutral-500">
            {t("node.model3d.previewFailed")}
          </span>
        </div>
      ) : (
        <span className="pointer-events-none absolute bottom-1.5 left-2 right-2 truncate text-[9px] text-neutral-400">
          {filename}
        </span>
      )}
    </div>
  );
}

Model3dPreview.propTypes = {
  url: PropTypes.string.isRequired,
  filename: PropTypes.string,
};
