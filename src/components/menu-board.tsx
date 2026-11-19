"use client";

import { useEffect, useMemo, useState } from "react";
import { DishPhoto } from "@/components/dish-photo";
import { AddDishButton, OrderCart } from "@/components/order-cart";
import { formatPrice, type MenuState } from "@/lib/menu";
import { menuPhotoUrl } from "@/lib/photos";
import { useCart } from "@/lib/use-cart";

export function MenuBoard({
  menu,
  ready,
  cartScope,
}: {
  menu: MenuState | null;
  ready: boolean;
  cartScope: string;
}) {
  const cart = useCart(cartScope);
  const [categoryId, setCategoryId] = useState("");

  const visibleDishes = useMemo(
    () => menu?.dishes.filter((dish) => dish.visible) ?? [],
    [menu],
  );

  const categories = useMemo(() => {
    if (!menu) return [];
    return menu.categories.filter((category) =>
      visibleDishes.some((dish) => dish.categoryId === category.id),
    );
  }, [menu, visibleDishes]);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((category) => category.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const dishes = visibleDishes.filter((dish) => dish.categoryId === categoryId);

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pt-5 pb-28">
      {ready && menu ? (
        <>
          <header className="flex items-start justify-between gap-4">
            <p className="text-[15px] leading-5 font-extrabold tracking-[0.04em] uppercase">
              {menu.venue.name}
            </p>
            <a
              href={`tel:${menu.venue.phone.replace(/[^\d+]/g, "")}`}
              className="shrink-0 pt-0.5 text-[13px] text-foreground/90"
            >
              {menu.venue.phone}
            </a>
          </header>

          {menu.venue.banner ? (
            <DishPhoto
              src={menuPhotoUrl(menu.venue.banner)}
              alt={`Баннер ${menu.venue.name}`}
              className="mt-5 aspect-[16/7] rounded-[22px]"
            />
          ) : (
            <div className="menu-banner menu-banner-line mt-5 rounded-[22px] border border-dashed px-5 py-9 text-center">
              <p className="text-[28px] leading-none font-extrabold tracking-[0.04em] uppercase">
                Ваш баннер
              </p>
              <p className="mt-3 text-[13px] text-muted">(если у вас его нет, мы изготовим сами)</p>
            </div>
          )}

          {menu.venue.description.trim() ? (
            <h1 className="mt-7 text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em]">
              {menu.venue.description.trim()}
            </h1>
          ) : null}
          <p className="mt-4 text-[15px] leading-6 text-muted">
            Собери заказ здесь — кассир получит его в Telegram или MAX.
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <div className="h-6 w-40 animate-pulse rounded-full bg-card" />
          <div className="h-36 animate-pulse rounded-[22px] bg-card" />
        </div>
      )}

      <section id="menu" className="scroll-mt-4 mt-10">
        <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">Меню</h2>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
                category.id === categoryId
                  ? "bg-accent menu-on-accent"
                  : "menu-chip text-foreground"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {!ready ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-56 animate-pulse rounded-[22px] bg-card" />
            ))}
          </div>
        ) : dishes.length === 0 ? (
          <div className="mt-4 rounded-[22px] bg-card px-5 py-10 text-center">
            <p className="text-lg font-semibold">Меню пока пустое</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              В этой категории нет блюд для гостей. Их можно включить в кабинете.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3">
            {dishes.map((dish) => (
              <li key={dish.id} className="flex flex-col rounded-[22px] bg-card p-2">
                <DishPhoto src={menuPhotoUrl(dish.image)} alt={dish.name} className="aspect-[1.05/1] rounded-[16px]" />
                <div className="flex flex-1 flex-col px-1.5 pt-3 pb-1.5">
                  <h3 className="text-[13px] leading-[1.15] font-extrabold tracking-[0.01em] uppercase">
                    {dish.name}
                  </h3>
                  {dish.description ? (
                    <p className="mt-1.5 line-clamp-3 text-[12px] leading-4 text-muted">{dish.description}</p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <p className="text-[15px] font-semibold">{formatPrice(dish.price)}</p>
                    <AddDishButton
                      quantity={cart.quantities[dish.id] ?? 0}
                      onAdd={() => cart.add(dish.id)}
                      onChange={(quantity) => cart.setQuantity(dish.id, quantity)}
                      appearance="plus"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ready && menu ? (
        <OrderCart
          dishes={menu.dishes}
          venue={menu.venue}
          quantities={cart.quantities}
          onQuantity={cart.setQuantity}
          onClear={cart.clear}
        />
      ) : null}
    </div>
  );
}
