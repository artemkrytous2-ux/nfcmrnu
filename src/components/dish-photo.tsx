"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { isSupabasePublicStorageUrl } from "@/lib/supabase-url";

export function DishPhoto({
  src,
  alt,
  className = "",
  priority = false,
  sizes = "50vw",
}: {
  src: string;
  alt: string;
  className?: string;
  /** LCP / above-the-fold image: eager + high fetch priority. */
  priority?: boolean;
  /** Used with Next.js image optimization for remote Storage URLs. */
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImage = Boolean(src) && !failed;
  const optimize = showImage && canOptimizeRemote(src);

  return (
    <div className={`menu-photo relative overflow-hidden ${className}`}>
      {showImage ? (
        optimize ? (
          <Image
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            decoding="async"
            className="object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          // data:/blob:/external URLs and failed-optimizer fallbacks stay as plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <div className="menu-photo-fallback h-full w-full" />
      )}
    </div>
  );
}

function canOptimizeRemote(src: string) {
  return isSupabasePublicStorageUrl(src);
}
