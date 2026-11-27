"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { DemoPlanCards } from "@/components/demo-plan-cards";
import { DishPhoto } from "@/components/dish-photo";
import { cabinetCopy } from "@/lib/cabinet-copy";
import { SUB_DESCRIPTION_MAX, type Dish, type Venue } from "@/lib/menu";
import { menuThemeChoices, menuThemeClass, type MenuTheme } from "@/lib/menu-theme";
import { formatPhone } from "@/lib/order";
import { menuPhotoUrl } from "@/lib/photos";
import { usePersonalDemoMenu } from "@/lib/use-personal-demo-menu";
import { cashierPhoneError, type OwnerSettings } from "@/lib/use-owner-menu";

const fieldClass =
  "h-12 w-full rounded-2xl border border-line bg-background px-4 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60";
const actionButton =
  "inline-flex h-12 items-center justify-center rounded-full border border-line bg-card px-4 text-sm font-medium text-foreground";

type Draft = {
  id: string | null;
  name: string;
  description: string;
  price: string;
  image: string;
  categoryId: string;
  visible: boolean;
};

function settingsFromVenue(venue: Venue): OwnerSettings {
  const orderEnabled = venue.orderEnabled !== false;
  return {
    name: venue.name,
    description: venue.description,
    subDescription: venue.subDescription.slice(0, SUB_DESCRIPTION_MAX),
    address: venue.address,
    phone: venue.phone,
    hours: venue.hours,
    orderPhone: venue.orderPhone,
    telegram: orderEnabled && venue.channels.telegram,
    max: orderEnabled && venue.channels.max,
    orderEnabled,
    callButtonEnabled: venue.callButtonEnabled,
  };
}

const emptyDraft = (categoryId: string): Draft => ({
  id: null,
  name: "",
  description: "",
  price: "",
  image: "",
  categoryId,
  visible: true,
});

export function DemoEditor({
  userId,
  accountEmail,
  onSignOut,
}: {
  userId: string;
  accountEmail?: string;
  onSignOut?: () => void;
}) {
  const demo = usePersonalDemoMenu(userId);
  const copy = cabinetCopy("food");
  const [settings, setSettings] = useState<OwnerSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryName, setCategoryName] = useState("");
  const [categoryComposer, setCategoryComposer] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [dishMenuId, setDishMenuId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [orderPhoneError, setOrderPhoneError] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeSelected, setThemeSelected] = useState<MenuTheme>("warm");
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeNotice, setThemeNotice] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (!demo.menu) return;
    setSettings(settingsFromVenue(demo.menu.venue));
    setThemeSelected(demo.theme);
  }, [demo.menu, demo.theme]);

  const activeDraft = useMemo(() => {
    if (!draft || !demo.menu) return emptyDraft(demo.menu?.categories[0]?.id ?? "");
    return draft;
  }, [draft, demo.menu]);

  if (!demo.ready) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
        <div className="h-12 w-56 animate-pulse rounded-2xl bg-card" />
        <div className="mt-6 h-40 animate-pulse rounded-3xl bg-card" />
      </div>
    );
  }

  if (!demo.menu || !settings) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
        <section className="rounded-3xl border border-line bg-card p-6">
          <p className="text-sm text-accent" role="alert">
            {demo.error || "Не удалось загрузить персональное демо."}
          </p>
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="mt-4 inline-flex h-10 items-center rounded-full border border-line px-4 text-sm"
            >
              Выйти
            </button>
          ) : null}
        </section>
      </div>
    );
  }

  const menu = demo.menu;
  const selectedCategory = menu.categories.some((category) => category.id === categoryFilter)
    ? categoryFilter
    : "all";
  const listedDishes =
    selectedCategory === "all"
      ? menu.dishes
      : menu.dishes.filter((dish) => dish.categoryId === selectedCategory);

  const openPreview = () => {
    window.open(`${window.location.origin}/try/preview`, "_blank", "noopener,noreferrer");
  };

  const startCreate = () => {
    setError("");
    setMessage("");
    setDraft(emptyDraft(menu.categories[0]?.id ?? ""));
    setCategoryComposer(false);
  };

  const startEdit = (dish: Dish) => {
    setError("");
    setMessage("");
    setDishMenuId(null);
    setDraft({
      id: dish.id,
      name: dish.name,
      description: dish.description,
      price: String(dish.price),
      image: dish.image,
      categoryId: dish.categoryId,
      visible: dish.visible,
    });
  };

  const addCategory = async () => {
    const result = await demo.addCategory(categoryName);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCategoryName("");
    setCategoryComposer(false);
    setMessage("Категория добавлена");
    setError("");
  };

  const saveCategory = async (id: string) => {
    const result = await demo.renameCategory(id, categoryDrafts[id] ?? "");
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditingCategoryId(null);
    setMessage("Категория сохранена");
  };

  const removeCategory = async (id: string) => {
    const result = await demo.deleteCategory(id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("Категория удалена");
  };

  const saveDish = async () => {
    const price = Number(activeDraft.price);
    const result = await demo.saveProduct({
      id: activeDraft.id,
      name: activeDraft.name,
      description: activeDraft.description,
      price: Number.isFinite(price) ? Math.round(price) : Number.NaN,
      categoryId: activeDraft.categoryId,
      visible: activeDraft.visible,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft(null);
    setMessage(activeDraft.id ? copy.dishSaved : copy.dishAdded);
    setError("");
  };

  const toggleVisible = async (dish: Dish) => {
    setDishMenuId(null);
    const result = await demo.setProductVisible(dish.id, !dish.visible);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(dish.visible ? copy.dishHidden : copy.dishShown);
  };

  const removeDish = async (dish: Dish) => {
    if (!window.confirm(copy.deleteConfirm.replace("{name}", dish.name))) return;
    setDishMenuId(null);
    const result = await demo.deleteProduct(dish.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(copy.dishDeleted);
  };

  const onDishPhoto = async (file: File | undefined) => {
    if (!file || !activeDraft.id) {
      setError("Сначала сохраните блюдо, затем добавьте фото.");
      return;
    }
    const result = await demo.setProductPhoto(activeDraft.id, file);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft((current) => (current ? { ...current, image: result.path } : current));
    setMessage("Фотография сохранена в демо");
  };

  const removeDishPhoto = async () => {
    if (!activeDraft.id) return;
    const result = await demo.deleteProductPhoto(activeDraft.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft((current) => (current ? { ...current, image: "" } : current));
    setMessage("Фотография удалена");
  };

  const onBanner = async (file: File | undefined) => {
    if (!file) return;
    setBannerBusy(true);
    const result = await demo.setBannerPhoto(file);
    setBannerBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("Баннер сохранён в демо");
  };

  const removeBanner = async () => {
    setBannerBusy(true);
    const result = await demo.deleteBannerPhoto();
    setBannerBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("Баннер удалён");
  };

  const saveVenueSettings = async () => {
    setSettingsMessage("");
    setSettingsError("");
    const phoneError = cashierPhoneError(settings.orderPhone, copy.cashierPhoneRequired);
    if (phoneError) {
      setOrderPhoneError(phoneError);
      return;
    }
    setOrderPhoneError("");
    setSavingSettings(true);
    const result = await demo.saveSettings(settings);
    setSavingSettings(false);
    if (!result.ok) {
      if ("field" in result && result.field === "orderPhone") setOrderPhoneError(result.message);
      else setSettingsError(result.message);
      return;
    }
    setSettingsMessage("Настройки сохранены в демоверсии");
  };

  const saveTheme = async () => {
    setThemeBusy(true);
    setThemeNotice("");
    const result = await demo.saveTheme(themeSelected);
    setThemeBusy(false);
    if (!result.ok) {
      setThemeNotice(result.message);
      return;
    }
    setThemeNotice("Оформление сохранено в демоверсии");
  };

  const resetDemo = async () => {
    if (
      !window.confirm(
        "Сбросить демоверсию к исходному шаблону? Ваши правки в этом браузере будут удалены.",
      )
    ) {
      return;
    }
    setResetBusy(true);
    const result = await demo.resetDemo();
    setResetBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft(null);
    setMessage("Демоверсия сброшена к исходному шаблону");
    setError("");
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] overflow-x-hidden px-4 py-5 sm:px-6 sm:py-8">
      {dishMenuId ? (
        <button
          type="button"
          aria-label={copy.closeActions}
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setDishMenuId(null)}
        />
      ) : null}

      <header className="flex items-center justify-between gap-2">
        <span className="truncate text-[15px] font-extrabold tracking-[0.04em] text-accent uppercase">
          NFCMENU
        </span>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="rounded-full border border-accent/50 px-2.5 py-1 text-[11px] leading-none text-accent sm:px-3 sm:text-xs">
            Демоверсия
          </span>
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex h-8 items-center rounded-full border border-line px-2.5 text-xs text-muted sm:px-3"
            >
              Выйти
            </button>
          ) : null}
        </div>
      </header>

      <h1 className="mt-7 text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em]">
        Персональная демоверсия
      </h1>
      <p className="mt-2 text-[15px] leading-6 text-muted">
        Вы вошли как {accountEmail || "пользователь"}. Это ваш черновик в браузере — настоящее заведение не
        создаётся, изменения пока не опубликованы.
      </p>
      <p className="mt-2 text-[15px] leading-6 text-muted">
        Демоверсия бесплатная и без ограничения по времени. Публичный сайт для гостей подключается по тарифу.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href="#demo-tariffs"
          className="inline-flex h-11 items-center rounded-full bg-accent px-4 text-sm font-medium text-[#062117]"
        >
          Подключить NFCMENU
        </a>
        <button
          type="button"
          onClick={openPreview}
          className="inline-flex h-11 items-center rounded-full border border-accent/50 px-4 text-sm text-accent"
        >
          Предпросмотр сайта
        </button>
        <button
          type="button"
          onClick={() => void resetDemo()}
          disabled={resetBusy}
          className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm text-foreground disabled:opacity-60"
        >
          {resetBusy ? "Сбрасываем…" : "Сбросить демоверсию"}
        </button>
      </div>

      <div className="mt-8">
        <DemoPlanCards userId={userId} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-card px-4 py-4">
          <p className="text-3xl font-semibold text-accent">{menu.dishes.length}</p>
          <p className="mt-1 text-sm text-muted">{copy.dishCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-card px-4 py-4">
          <p className="text-3xl font-semibold">{menu.categories.length}</p>
          <p className="mt-1 text-sm text-muted">{copy.categoryCount}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={startCreate} className={actionButton}>
          {copy.addDish}
        </button>
        <button
          type="button"
          onClick={() => {
            setCategoryComposer(true);
            setDraft(null);
          }}
          className={actionButton}
        >
          {copy.addCategory}
        </button>
      </div>

      {categoryComposer ? (
        <div className="mt-3 grid gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              className={fieldClass}
              placeholder={copy.newCategoryPlaceholder}
              autoFocus
            />
            <button
              type="button"
              onClick={() => void addCategory()}
              className="h-12 shrink-0 rounded-full bg-accent px-5 text-sm font-medium text-[#062117]"
            >
              Добавить
            </button>
            <button
              type="button"
              onClick={() => setCategoryComposer(false)}
              className="h-12 shrink-0 rounded-full border border-line px-5 text-sm"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}

      {!draft && !categoryComposer && (error || message) ? (
        <p className={`mt-3 text-sm ${error ? "text-[#e2b2a2]" : "text-accent"}`} role={error ? "alert" : "status"}>
          {error || message}
        </p>
      ) : null}

      {draft ? (
        <section className="mt-4 rounded-2xl border border-line bg-card p-4">
          <h2 className="text-lg font-semibold">{draft.id ? copy.editDish : copy.newDish}</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Название">
              <input
                value={activeDraft.name}
                onChange={(event) => setDraft({ ...activeDraft, name: event.target.value })}
                className={fieldClass}
                placeholder={copy.namePlaceholder}
              />
            </Field>
            <Field label="Описание">
              <textarea
                value={activeDraft.description}
                onChange={(event) => setDraft({ ...activeDraft, description: event.target.value })}
                className="min-h-24 w-full resize-y rounded-2xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={copy.price}>
                <input
                  inputMode="numeric"
                  value={activeDraft.price}
                  onChange={(event) => setDraft({ ...activeDraft, price: event.target.value })}
                  className={fieldClass}
                  placeholder="290"
                />
              </Field>
              <Field label={copy.categoryField}>
                <select
                  value={activeDraft.categoryId}
                  onChange={(event) => setDraft({ ...activeDraft, categoryId: event.target.value })}
                  className={fieldClass}
                >
                  {menu.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={activeDraft.visible}
                onChange={(event) => setDraft({ ...activeDraft, visible: event.target.checked })}
                className="size-4 accent-[#3dbe7a]"
              />
              {copy.showToGuests}
            </label>
            {activeDraft.id ? (
              <div className="grid gap-3">
                {activeDraft.image ? (
                  <DishPhoto
                    src={menuPhotoUrl(activeDraft.image)}
                    alt="Предпросмотр"
                    className="aspect-[16/9] rounded-2xl"
                    sizes="(max-width: 640px) 100vw, 560px"
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex h-12 cursor-pointer items-center rounded-full border border-line px-5 text-sm">
                    Загрузить фото
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void onDishPhoto(event.target.files?.[0])}
                    />
                  </label>
                  {activeDraft.image ? (
                    <button
                      type="button"
                      onClick={() => void removeDishPhoto()}
                      className="h-12 rounded-full border border-line px-5 text-sm"
                    >
                      Удалить фото
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Сначала сохраните блюдо, затем можно добавить фотографию.</p>
            )}
            {error ? <p className="text-sm text-[#e2b2a2]">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveDish()}
                className="h-12 rounded-full bg-accent px-5 text-sm font-medium text-[#062117]"
              >
                {copy.saveDish}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="h-12 rounded-full border border-line px-5 text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={selectedCategory === "all"} onClick={() => setCategoryFilter("all")}>
            {copy.allDishes}
          </FilterChip>
          {menu.categories.map((category) => (
            <FilterChip
              key={category.id}
              active={selectedCategory === category.id}
              onClick={() => setCategoryFilter(category.id)}
            >
              {category.name}
            </FilterChip>
          ))}
        </div>

        <ul className="mt-4 grid gap-3">
          {listedDishes.length === 0 ? (
            <li className="rounded-2xl border border-line bg-card px-4 py-8 text-center text-sm text-muted">
              {selectedCategory === "all" ? copy.noDishes : copy.noDishesInCategory}
            </li>
          ) : (
            listedDishes.map((dish) => (
              <li
                key={dish.id}
                className="relative flex items-center gap-3 rounded-2xl border border-line bg-card p-3 sm:p-4"
              >
                <DishPhoto
                  src={menuPhotoUrl(dish.image)}
                  alt=""
                  className="size-16 shrink-0 rounded-2xl sm:size-[4.5rem]"
                  sizes="72px"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{dish.name}</p>
                  <p className="mt-1 text-sm text-muted">{dish.price.toLocaleString("ru-RU")} ₽</p>
                  {!dish.visible ? <p className="mt-1 text-xs text-accent">Скрыто от гостей</p> : null}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Действия"
                    onClick={() => setDishMenuId((current) => (current === dish.id ? null : dish.id))}
                    className="grid size-10 place-items-center rounded-full border border-line"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {dishMenuId === dish.id ? (
                    <div className="absolute top-11 right-0 z-20 min-w-40 overflow-hidden rounded-2xl border border-line bg-background shadow-lg">
                      <button
                        type="button"
                        className="block w-full px-4 py-3 text-left text-sm hover:bg-card"
                        onClick={() => startEdit(dish)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="block w-full px-4 py-3 text-left text-sm hover:bg-card"
                        onClick={() => void toggleVisible(dish)}
                      >
                        {dish.visible ? copy.hideItem : copy.showItem}
                      </button>
                      <button
                        type="button"
                        className="block w-full px-4 py-3 text-left text-sm text-[#e2b2a2] hover:bg-card"
                        onClick={() => void removeDish(dish)}
                      >
                        {copy.deleteDish}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.16em] text-accent uppercase">Баннер</p>
        <p className="mt-2 text-sm leading-6 text-muted">{copy.bannerHint}</p>
        <div className="mt-4 grid gap-3">
          {menu.venue.banner ? (
            <DishPhoto
              src={menuPhotoUrl(menu.venue.banner)}
              alt="Баннер"
              className="aspect-[16/7] rounded-2xl"
              sizes="(max-width: 640px) 100vw, 560px"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-12 cursor-pointer items-center rounded-full border border-line px-5 text-sm">
              {bannerBusy ? "Загружаем…" : "Загрузить баннер"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={bannerBusy}
                onChange={(event) => void onBanner(event.target.files?.[0])}
              />
            </label>
            {menu.venue.banner ? (
              <button
                type="button"
                onClick={() => void removeBanner()}
                disabled={bannerBusy}
                className="h-12 rounded-full border border-line px-5 text-sm disabled:opacity-60"
              >
                Удалить фото
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.16em] text-accent uppercase">{copy.categoryCount}</p>
        <ul className="mt-4 grid gap-3">
          {menu.categories.length === 0 ? (
            <li className="text-sm text-muted">{copy.noCategories}</li>
          ) : (
            menu.categories.map((category) => (
              <li key={category.id} className="rounded-2xl border border-line bg-background p-3">
                {editingCategoryId === category.id ? (
                  <div className="grid gap-2 sm:flex">
                    <input
                      value={categoryDrafts[category.id] ?? category.name}
                      onChange={(event) =>
                        setCategoryDrafts((current) => ({ ...current, [category.id]: event.target.value }))
                      }
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      onClick={() => void saveCategory(category.id)}
                      className="h-12 rounded-full bg-accent px-4 text-sm font-medium text-[#062117]"
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCategoryId(null)}
                      className="h-12 rounded-full border border-line px-4 text-sm"
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{category.name}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategoryId(category.id);
                          setCategoryDrafts((current) => ({ ...current, [category.id]: category.name }));
                        }}
                        className="h-9 rounded-full border border-line px-3 text-xs"
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeCategory(category.id)}
                        className="h-9 rounded-full border border-line px-3 text-xs text-[#e2b2a2]"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <p className="text-xs font-medium tracking-[0.16em] text-accent uppercase">Настройки</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Данные хранятся только в вашем браузере и не публикуются на сайте заведения.
        </p>
        <div className="mt-4 grid gap-4">
          <Field label="Название">
            <input
              value={settings.name}
              onChange={(event) => setSettings({ ...settings, name: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="Описание">
            <textarea
              value={settings.description}
              onChange={(event) => setSettings({ ...settings, description: event.target.value })}
              className="min-h-28 w-full resize-y rounded-2xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60"
            />
          </Field>
          <Field label="Подописание">
            <textarea
              value={settings.subDescription}
              maxLength={SUB_DESCRIPTION_MAX}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  subDescription: event.target.value.slice(0, SUB_DESCRIPTION_MAX),
                })
              }
              className="min-h-28 w-full resize-y rounded-2xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60"
              placeholder="Короткий текст под основным описанием"
            />
            <p className="text-xs text-muted">
              {settings.subDescription.length} / {SUB_DESCRIPTION_MAX}
            </p>
          </Field>
          <Field label="Адрес">
            <input
              value={settings.address}
              onChange={(event) => setSettings({ ...settings, address: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="Телефон заведения">
            <input
              inputMode="tel"
              value={settings.phone}
              onChange={(event) => setSettings({ ...settings, phone: formatPhone(event.target.value) })}
              className={fieldClass}
              placeholder="+7 900 000-00-00"
            />
          </Field>
          <Field label="Часы работы">
            <input
              value={settings.hours}
              onChange={(event) => setSettings({ ...settings, hours: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label={copy.cashierPhone}>
            <input
              inputMode="tel"
              value={settings.orderPhone}
              onChange={(event) => {
                const orderPhone = formatPhone(event.target.value);
                setSettings({ ...settings, orderPhone });
                setOrderPhoneError((current) =>
                  current ? cashierPhoneError(orderPhone, copy.cashierPhoneRequired) : "",
                );
              }}
              className={fieldClass}
              aria-invalid={orderPhoneError ? true : undefined}
            />
            {orderPhoneError ? (
              <p className="text-sm text-[#ff5a5a]" role="alert">
                {orderPhoneError}
              </p>
            ) : null}
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.orderEnabled}
              onChange={(event) => {
                const orderEnabled = event.target.checked;
                setSettings({
                  ...settings,
                  orderEnabled,
                  ...(orderEnabled ? {} : { telegram: false, max: false }),
                });
              }}
              className="size-4 accent-[#3dbe7a]"
            />
            {copy.acceptMessengerOrders}
          </label>
          <label className={`flex items-center gap-3 text-sm ${settings.orderEnabled ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              checked={settings.telegram}
              disabled={!settings.orderEnabled}
              onChange={(event) => setSettings({ ...settings, telegram: event.target.checked })}
              className="size-4 accent-[#3dbe7a]"
            />
            {copy.telegramOrders}
          </label>
          <label className={`flex items-center gap-3 text-sm ${settings.orderEnabled ? "" : "opacity-60"}`}>
            <input
              type="checkbox"
              checked={settings.max}
              disabled={!settings.orderEnabled}
              onChange={(event) => setSettings({ ...settings, max: event.target.checked })}
              className="size-4 accent-[#3dbe7a]"
            />
            {copy.maxOrders}
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.callButtonEnabled}
              onChange={(event) => setSettings({ ...settings, callButtonEnabled: event.target.checked })}
              className="size-4 accent-[#3dbe7a]"
            />
            {copy.showCallButton}
          </label>
          {settingsError ? <p className="text-sm text-[#e2b2a2]">{settingsError}</p> : null}
          {settingsMessage ? <p className="text-sm text-accent">{settingsMessage}</p> : null}
          <button
            type="button"
            onClick={() => void saveVenueSettings()}
            disabled={savingSettings}
            className="h-12 rounded-full bg-accent px-5 text-sm font-medium text-[#062117] disabled:opacity-60"
          >
            {savingSettings ? "Сохраняем…" : "Сохранить настройки"}
          </button>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
        <button
          type="button"
          aria-expanded={themeOpen}
          onClick={() => setThemeOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
        >
          <span className="font-medium">Оформление сайта</span>
          <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${themeOpen ? "rotate-180" : ""}`} />
        </button>
        {themeOpen ? (
          <div className="border-t border-line px-4 py-5">
            <p className="text-sm leading-6 text-muted">
              Тема применяется в предпросмотре демо. Публичная страница `/m/...` не создаётся.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {menuThemeChoices.map((choice) => {
                const active = choice.id === themeSelected;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setThemeSelected(choice.id);
                      setThemeNotice("");
                    }}
                    className={`rounded-2xl border p-3 text-left ${active ? "border-accent" : "border-line"}`}
                  >
                    <span className={`guest ${menuThemeClass(choice.id)} flex h-14 overflow-hidden rounded-xl`}>
                      <span className="w-1/2 bg-background" />
                      <span className="w-1/4 bg-card" />
                      <span className="w-1/4 bg-accent" />
                    </span>
                    <span className="mt-2 block text-sm">{choice.title}</span>
                  </button>
                );
              })}
            </div>
            {themeNotice ? <p className="mt-3 text-sm text-accent">{themeNotice}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveTheme()}
                disabled={themeBusy}
                className="h-12 rounded-full bg-accent px-5 text-sm font-medium text-[#062117] disabled:opacity-60"
              >
                {themeBusy ? "Сохраняем…" : "Сохранить оформление"}
              </button>
              <button
                type="button"
                onClick={openPreview}
                className="h-12 rounded-full border border-line px-5 text-sm"
              >
                Открыть предпросмотр
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-6 mb-10 rounded-2xl border border-dashed border-line bg-card/60 p-4 sm:p-5">
        <p className="text-sm leading-6 text-muted">
          Демоверсия локальная и бесплатная без ограничения по времени: данные не попадают в базу NFCMENU и не
          видны другим пользователям. Настоящий публичный сайт для гостей подключается по тарифу — после оплаты
          появится перенос черновика в настоящее заведение.
        </p>
        <a
          href="#demo-tariffs"
          className="mt-4 inline-flex h-11 items-center rounded-full border border-accent/50 px-4 text-sm text-accent"
        >
          Выбрать тариф
        </a>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
        active ? "bg-accent text-[#062117]" : "border border-line bg-card text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
