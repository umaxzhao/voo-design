import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { FileImage } from "lucide-react";
import { useI18n } from "../../use_i18n.js";

/** Missing legacy previews are recovered without rewriting the user's project. */
export default function WelcomeFileCover({ item }) {
  const { t } = useI18n();
  const host = useRef(null);
  const [visible, setVisible] = useState(false);
  const [revision, setRevision] = useState(0);
  const [failedImage, setFailedImage] = useState(false);
  const [cover, setCover] = useState(item.preview || null);
  const [loading, setLoading] = useState(!item.preview);
  useEffect(() => {
    if (!globalThis.IntersectionObserver) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const refresh = (event) => {
      if (
        event.detail?.name === item.name ||
        event.type === "voo:workspace-changed"
      )
        setRevision((value) => value + 1);
    };
    window.addEventListener("voo:draft-updated", refresh);
    window.addEventListener("voo:workspace-changed", refresh);
    return () => {
      window.removeEventListener("voo:draft-updated", refresh);
      window.removeEventListener("voo:workspace-changed", refresh);
    };
  }, [item.name]);
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setLoading(true);
    import("../../previews/load_project_cover.js")
      .then(({ loadProjectCover }) =>
        loadProjectCover(item, { ignoreEmbedded: failedImage }),
      )
      .then((result) => {
        if (!cancelled) setCover(result);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[VOO] Project cover unavailable:", item.name, error);
          setCover(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, item, revision, failedImage]);
  return (
    <div
      ref={host}
      data-testid="welcome-file-cover"
      className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-t-2xl"
      aria-busy={loading}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          data-testid="welcome-file-cover-image"
          className="size-full object-cover"
          onError={() => {
            setCover(null);
            setFailedImage(true);
          }}
        />
      ) : (
        <FileImage
          size={28}
          strokeWidth={1.5}
          className="text-neutral-400"
          aria-label={t(
            loading ? "welcome.cover.loading" : "welcome.cover.unavailable",
          )}
        />
      )}
    </div>
  );
}
WelcomeFileCover.propTypes = { item: PropTypes.object.isRequired };
