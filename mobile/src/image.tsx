import type { ImgHTMLAttributes } from "react";

// The native bundle uses local assets and does not have Next's image server.
export default function Image({ unoptimized: _unoptimized, priority, alt, ...props }:
  ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; priority?: boolean }) {
  void _unoptimized;
  // eslint-disable-next-line @next/next/no-img-element -- Local native assets have no Next image server.
  return <img {...props} alt={alt || ""} loading={priority ? "eager" : props.loading} />;
}
