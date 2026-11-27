"use client";

import { useEffect, useState } from "react";
import { DishPhoto } from "@/components/dish-photo";
import { formatPrice, type Category, type Dish } from "@/lib/menu";
import { menuPhotoUrl } from "@/lib/photos";

function sectionId(categoryId: string) {
  return `beauty-category-${categoryId}`;
}

export function BeautyServices({
  categories,
  services,
}: {
  categories: Category[];
  services: Dish[];
}) {
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");

  useEffect(() => {
    if (categories.length === 0) return;
    const nodes = categories
      .map((category) => document.getElementById(sectionId(category.id)))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.id.replace("beauty-category-", "");
        if (id) setActiveId(id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0.15, 0.4, 0.7] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [categories]);

  if (categories.length === 0) return null;

  const openCategory = (categoryId: string) => {
    setActiveId(categoryId);
    document.getElementById(sectionId(categoryId))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="mt-6 sm:mt-8">
      <nav aria-label="Категории услуг" className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur-sm sm:-mx-8 sm:px-8">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => {
            const active = category.id === activeId;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => openCategory(category.id)}
                className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
                  active ? "bg-accent menu-on-accent" : "menu-chip text-foreground"
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mt-5 grid gap-7 sm:mt-6 sm:gap-8">
        {categories.map((category) => {
          const items = services.filter((service) => service.visible && service.categoryId === category.id);
          return (
            <section key={category.id} id={sectionId(category.id)} className="scroll-mt-20">
              <h2 className="font-display text-xl leading-none font-medium tracking-[-0.03em] text-foreground sm:text-2xl">
                {category.name}
              </h2>
              {items.length === 0 ? (
                <p className="mt-3 text-sm text-muted">В этой категории пока нет услуг.</p>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((service) => (
                    <li key={service.id} className="min-w-0 overflow-hidden rounded-[16px] border border-line bg-card p-1.5">
                      <DishPhoto
                        src={menuPhotoUrl(service.image)}
                        alt=""
                        className="aspect-square rounded-[12px]"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                      <div className="px-1 pt-2 pb-1">
                        <h3 className="line-clamp-2 text-[13px] leading-tight font-semibold break-words text-foreground">
                          {service.name}
                        </h3>
                        {service.description ? (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 break-words text-muted">{service.description}</p>
                        ) : null}
                        {service.price > 0 ? (
                          <p className="mt-1 text-[13px] font-semibold text-foreground">{formatPrice(service.price)}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
