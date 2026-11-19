"use client";

import { useEffect, useState } from "react";

export function DishPhoto({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={`menu-photo relative overflow-hidden ${className}`}>
      {showImage ? (
        // External and local photo URLs are stored as plain strings.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="menu-photo-fallback h-full w-full" />
      )}
    </div>
  );
}
