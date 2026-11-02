import { useEffect, useState } from "react";

const NARROW_VIEWPORT_QUERY = "(max-width: 768px)";

export function subscribeToNarrowViewport(onChange, media = window.matchMedia(NARROW_VIEWPORT_QUERY)) {
  const update = (event) => onChange(event.matches);
  onChange(media.matches);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}

export default function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(NARROW_VIEWPORT_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(NARROW_VIEWPORT_QUERY);
    return subscribeToNarrowViewport(setIsNarrow, media);
  }, []);

  return isNarrow;
}
