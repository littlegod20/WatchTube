import { useEffect, useRef } from "react";

/** Muted grid preview: a tiny seek after metadata loads forces the first frame to paint. */
export function VideoThumbnail({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMeta = () => {
      let t = 0.001;
      if (Number.isFinite(el.duration) && el.duration > 0) {
        t = Math.min(0.25, Math.max(0.001, el.duration * 0.02));
      }
      const onSeeked = () => {
        el.pause();
      };
      el.addEventListener("seeked", onSeeked, { once: true });
      try {
        el.currentTime = t;
      } catch {
        el.removeEventListener("seeked", onSeeked);
      }
    };

    el.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [src]);

  return (
    <video
      ref={ref}
      key={src}
      src={src}
      className={className}
      muted
      playsInline
      preload="metadata"
      aria-hidden
    />
  );
}
