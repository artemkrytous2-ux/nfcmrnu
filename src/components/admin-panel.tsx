"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { DishPhoto } from "@/components/dish-photo";
import { OwnerMessages } from "@/components/owner-messages";
import { formatPrice, readImageFile, SUB_DESCRIPTION_MAX, type Dish, type Venue } from "@/lib/menu";
import { formatPhone } from "@/lib/order";
import { menuPhotoUrl } from "@/lib/photos";
import { useSuperadminMenu } from "@/lib/use-superadmin-menu";
import { type BusinessKind } from "@/lib/business-kind";
import { cabinetCopy, fillCopy } from "@/lib/cabinet-copy";
import { menuThemeChoices, menuThemeClass, type MenuTheme } from "@/lib/menu-theme";
import { cashierPhoneError, useOwnerMenu, type OwnerSettings, type OwnerSite } from "@/lib/use-owner-menu";

type Draft = {
  id: string | null;
  name: string;
  description: string;
  price: string;
  image: string;
  categoryId: string;
  visible: boolean;
};

const emptySettings: OwnerSettings = {
  name: "",
  description: "",
  subDescription: "",
  address: "",
  phone: "",
  hours: "",
  orderPhone: "",
  telegram: true,
  max: true,
  orderEnabled: true,
  callButtonEnabled: false,
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

export function AdminPanel({
  businessId,
  access = "owner",
  accountEmail,
  onSignOut,
}: {
  businessId: string;
  access?: "owner" | "superadmin";
  accountEmail?: string;
  onSignOut?: () => void;
}) {
  if (access === "superadmin") return <SuperadminEditor businessId={businessId} />;
  return <OwnerEditor businessId={businessId} accountEmail={accountEmail} onSignOut={onSignOut} />;
}

function OwnerEditor({
  businessId,
  accountEmail,
  onSignOut,
}: {
  businessId: string;
  accountEmail?: string;
  onSignOut?: () => void;
}) {
  return (
    <MenuEditor
      {...useOwnerMenu(businessId)}
      presentation="owner"
      accountEmail={accountEmail}
      onSignOut={onSignOut}
    />
  );
}

function SuperadminEditor({ businessId }: { businessId: string }) {
  return <MenuEditor {...useSuperadminMenu(businessId)} presentation="owner" />;
}

function MenuEditor({
  menu,
  ready,
  error: loadError,
  saveSettings,
  addCategory: createCategory,
  renameCategory,
  deleteCategory,
  saveProduct,
  setProductVisible,
  deleteProduct,
  setProductPhoto,
  deleteProductPhoto,
  setBannerPhoto,
  deleteBannerPhoto,
  pwaName,
  pwaIcon,
  pwaStorage,
  savePwaName,
  setPwaIcon,
  deletePwaIcon,
  site = null,
  theme = "default",
  themeStorage = "ready",
  kind = "food",
  saveTheme,
  presentation = "editor",
  accountEmail,
  onSignOut,
}: Omit<ReturnType<typeof useOwnerMenu>, "site" | "theme" | "themeStorage" | "kind" | "saveTheme"> & {
  site?: OwnerSite | null;
  theme?: MenuTheme;
  themeStorage?: "ready" | "missing";
  kind?: BusinessKind;
  saveTheme?: (theme: MenuTheme) => Promise<{ ok: true } | { ok: false; message: string }>;
  presentation?: "owner" | "editor";
  accountEmail?: string;
  onSignOut?: () => void;
}) {
  const copy = cabinetCopy(presentation === "owner" ? kind : "food");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [categoryNotice, setCategoryNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [dishNotice, setDishNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [settings, setSettings] = useState<OwnerSettings>(emptySettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [orderPhoneError, setOrderPhoneError] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [siteNote, setSiteNote] = useState("");
  const [dishMenuId, setDishMenuId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryComposer, setCategoryComposer] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const activeDraft = useMemo(() => {
    if (!menu) return null;
    if (draft) return draft;
    return emptyDraft(menu.categories[0]?.id ?? "");
  }, [draft, menu]);

  useEffect(() => {
    if (!menu) return;
    setSettings(settingsFromVenue(menu.venue));
  }, [menu]);

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
    const result = await saveSettings(settings);
    setSavingSettings(false);
    if (!result.ok) {
      if (result.field === "orderPhone") setOrderPhoneError(result.message);
      else setSettingsError(result.message);
      return;
    }
    setSettingsMessage("Настройки сохранены");
  };

  const onBannerFile = async (file: File | undefined) => {
    if (!file || bannerBusy) return;
    let preview = "";
    try {
      preview = await readImageFile(file);
    } catch {
      setBannerPreview(null);
      setBannerNotice({ tone: "error", text: "Не удалось использовать это фото баннера" });
      return;
    }
    setBannerPreview(preview);
    setBannerNotice(null);
    setBannerBusy(true);
    const result = await setBannerPhoto(file);
    setBannerBusy(false);
    setBannerPreview(null);
    if (!result.ok) {
      setBannerNotice({ tone: "error", text: result.message });
      return;
    }
    setBannerNotice({ tone: "success", text: "Баннер сохранён" });
  };

  const removeBanner = async () => {
    if (bannerBusy) return;
    setBannerNotice(null);
    setBannerBusy(true);
    const result = await deleteBannerPhoto();
    setBannerBusy(false);
    setBannerPreview(null);
    if (!result.ok) {
      setBannerNotice({ tone: "error", text: result.message });
      return;
    }
    setBannerNotice({ tone: "success", text: "Баннер удалён" });
  };

  const saveCategory = async (id: string) => {
    if (!menu) return;
    const current = menu.categories.find((category) => category.id === id)?.name ?? "";
    const name = (categoryDrafts[id] ?? current).trim();
    if (!name) {
      setCategoryNotice({ tone: "error", text: copy.categoryNameRequired });
      return;
    }
    const result = await renameCategory(id, name);
    if (!result.ok) {
      setCategoryNotice({ tone: "error", text: result.message });
      return;
    }
    setCategoryDrafts((currentDrafts) => {
      const next = { ...currentDrafts };
      delete next[id];
      return next;
    });
    setEditingCategoryId((current) => (current === id ? null : current));
    setCategoryNotice({ tone: "success", text: copy.categorySaved });
  };

  const closeDishForm = () => {
    setDraft(null);
    setPendingPhoto(null);
    setError("");
    setMessage("");
  };

  const closeCategoryForms = () => {
    setCategoryName("");
    setCategoryNotice(null);
    setCategoryComposer(false);
    setEditingCategoryId(null);
    setCategoryDrafts({});
  };

  const beginCategoryEdit = (id: string, name: string) => {
    closeDishForm();
    setCategoryComposer(false);
    setCategoryName("");
    setEditingCategoryId(id);
    setCategoryDrafts({ [id]: name });
  };

  const cancelCategoryEdit = (id: string) => {
    setEditingCategoryId((current) => (current === id ? null : current));
    setCategoryDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const openCategoryComposer = () => {
    if (categoryComposer) return;
    closeDishForm();
    setEditingCategoryId(null);
    setCategoryDrafts({});
    setCategoryComposer(true);
  };

  const closeCategoryComposer = () => {
    setCategoryName("");
    setCategoryNotice(null);
    setCategoryComposer(false);
  };

  const addCategory = async () => {
    if (!menu) return;
    const name = categoryName.trim();
    if (!name) {
      setCategoryNotice({ tone: "error", text: copy.newCategoryNameRequired });
      return;
    }
    const result = await createCategory(name);
    if (!result.ok) {
      setCategoryNotice({ tone: "error", text: result.message });
      return;
    }
    setCategoryName("");
    setCategoryComposer(false);
    setCategoryDrafts((current) => ({ ...current, [result.id]: name }));
    setCategoryNotice({ tone: "success", text: copy.categoryAdded });
  };

  const removeCategory = async (id: string) => {
    if (!menu) return;
    if (menu.dishes.some((dish) => dish.categoryId === id)) {
      setCategoryNotice({ tone: "error", text: copy.categoryHasItems });
      return;
    }
    if (menu.categories.length === 1) {
      setCategoryNotice({
        tone: "error",
        text: copy.lastCategory,
      });
      return;
    }
    const result = await deleteCategory(id);
    if (!result.ok) {
      setCategoryNotice({ tone: "error", text: result.message });
      return;
    }
    setCategoryNotice({ tone: "success", text: copy.categoryDeleted });
  };

  const startEdit = (dish: Dish) => {
    if (presentation === "owner") closeCategoryForms();
    setError("");
    setPendingPhoto(null);
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

  const startCreate = () => {
    if (!menu) return;
    if (presentation === "owner") {
      closeCategoryForms();
      if (draft?.id === null) return;
    }
    setError("");
    setPendingPhoto(null);
    setDraft(emptyDraft(menu.categories[0]?.id ?? ""));
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file || !activeDraft || photoBusy) return;
    let preview = "";
    try {
      preview = await readImageFile(file);
    } catch {
      setMessage("");
      setError("Не удалось использовать это фото. Попробуйте другой файл.");
      return;
    }

    if (!activeDraft.id) {
      setDraft({ ...activeDraft, image: preview });
      setPendingPhoto(file);
      setError("");
      setMessage("");
      return;
    }

    const previousImage = activeDraft.image.startsWith("data:")
      ? (menu?.dishes.find((dish) => dish.id === activeDraft.id)?.image ?? "")
      : activeDraft.image;
    setDraft({ ...activeDraft, image: preview });
    setPendingPhoto(null);
    setError("");
    setMessage("");
    setPhotoBusy(true);
    const result = await setProductPhoto(activeDraft.id, file);
    setPhotoBusy(false);
    if (!result.ok) {
      setDraft((current) =>
        current && current.id === activeDraft.id ? { ...current, image: previousImage } : current,
      );
      setMessage("");
      setError(result.message);
      return;
    }
    setDraft((current) => (current && current.id === activeDraft.id ? { ...current, image: result.path } : current));
    setMessage("Фотография сохранена");
  };

  const removePhoto = async () => {
    if (!activeDraft || photoBusy) return;
    const savedImage = activeDraft.id ? (menu?.dishes.find((dish) => dish.id === activeDraft.id)?.image ?? "") : "";
    if (!savedImage) {
      setPendingPhoto(null);
      setDraft({ ...activeDraft, image: "" });
      setError("");
      setMessage("");
      return;
    }
    setPhotoBusy(true);
    const result = await deleteProductPhoto(activeDraft.id ?? "");
    setPhotoBusy(false);
    if (!result.ok) {
      setMessage("");
      setError(result.message);
      return;
    }
    setPendingPhoto(null);
    setDraft((current) => (current && current.id === activeDraft.id ? { ...current, image: "" } : current));
    setError("");
    setMessage("Фотография удалена");
  };

  const saveDish = async () => {
    if (!menu || !activeDraft) return;
    const name = activeDraft.name.trim();
    const priceText = activeDraft.price.trim();
    if (!name) {
      setMessage("");
      setError(copy.nameRequired);
      return;
    }
    if (!priceText) {
      setMessage("");
      setError(copy.priceRequired);
      return;
    }
    if (priceText.includes("-")) {
      setMessage("");
      setError(copy.priceNegative);
      return;
    }
    const price = Number(priceText.replace(/\s/g, ""));
    if (!Number.isInteger(price) || price < 0) {
      setMessage("");
      setError(copy.priceInteger);
      return;
    }
    if (!activeDraft.categoryId) {
      setMessage("");
      setError(copy.chooseCategory);
      return;
    }

    setError("");
    const result = await saveProduct({
      id: activeDraft.id,
      name,
      description: activeDraft.description,
      price,
      categoryId: activeDraft.categoryId,
      visible: activeDraft.visible,
    });
    if (!result.ok) {
      setMessage("");
      setError(result.message);
      return;
    }

    const file = pendingPhoto;
    if (!activeDraft.id && file) {
      setPhotoBusy(true);
      const uploaded = await setProductPhoto(result.dish.id, file);
      setPhotoBusy(false);
      if (!uploaded.ok) {
        setPendingPhoto(file);
        setDraft({
          id: result.dish.id,
          name: result.dish.name,
          description: result.dish.description,
          price: String(result.dish.price),
          image: activeDraft.image,
          categoryId: result.dish.categoryId,
          visible: result.dish.visible,
        });
        setMessage("");
        setError(`${copy.savedPhotoFailed} ${uploaded.message}`);
        return;
      }
      setPendingPhoto(null);
      setDraft(null);
      setMessage(copy.dishAdded);
      return;
    }

    setPendingPhoto(null);
    setMessage(activeDraft.id ? copy.dishSaved : copy.dishAdded);
    if (presentation === "owner" || !activeDraft.id) setDraft(null);
    else setDraft({ ...activeDraft, ...result.dish, price: String(result.dish.price) });
  };

  const toggleDish = async (dish: Dish) => {
    if (!menu) return;
    const result = await setProductVisible(dish.id, !dish.visible);
    if (!result.ok) {
      setDishNotice({ tone: "error", text: result.message });
      return;
    }
    if (draft?.id === dish.id) setDraft({ ...draft, visible: result.visible });
    setDishNotice({
      tone: "success",
      text: result.visible ? copy.dishShown : copy.dishHidden,
    });
  };

  const removeDish = async (dish: Dish) => {
    if (!menu) return;
    if (!window.confirm(fillCopy(copy.deleteConfirm, dish.name))) return;
    const result = await deleteProduct(dish.id);
    if (!result.ok) {
      setDishNotice({ tone: "error", text: result.message });
      return;
    }
    if (draft?.id === dish.id) setDraft(null);
    setDishNotice({ tone: "success", text: copy.dishDeleted });
  };

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="h-12 w-56 animate-pulse rounded-2xl bg-card" />
        <div className="mt-6 h-40 animate-pulse rounded-3xl bg-card" />
      </div>
    );
  }

  const savedDishPhoto = activeDraft?.id
    ? (menu?.dishes.find((dish) => dish.id === activeDraft.id)?.image ?? "")
    : "";
  const bannerSrc = bannerPreview ?? (menu ? menuPhotoUrl(menu.venue.banner) : "");

  if (loadError || !menu || !activeDraft) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
          <p className="text-sm text-accent" role="alert">
            {loadError || copy.loadFailed}
          </p>
        </section>
      </div>
    );
  }

  if (presentation === "owner") {
    const selectedCategory = menu.categories.some((category) => category.id === categoryFilter)
      ? categoryFilter
      : "all";
    const listedDishes =
      selectedCategory === "all"
        ? menu.dishes
        : menu.dishes.filter((dish) => dish.categoryId === selectedCategory);

    const openSite = () => {
      if (!site?.slug || !site.published) {
        setSiteNote(siteMessage(site));
        return;
      }
      setSiteNote("");
      window.open(`${window.location.origin}/m/${site.slug}`, "_blank", "noopener,noreferrer");
    };

    const copySiteLink = async () => {
      if (!site?.slug || !site.published) {
        setSiteNote(siteMessage(site));
        return;
      }
      const url = `${window.location.origin}/m/${site.slug}`;
      try {
        await navigator.clipboard.writeText(url);
        setSiteNote("Ссылка скопирована");
      } catch {
        setSiteNote("Не удалось скопировать ссылку. Скопируйте её вручную.");
      }
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
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="truncate text-[15px] font-extrabold tracking-[0.04em] text-accent uppercase">NFCMENU</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span className="rounded-full border border-accent/50 px-2.5 py-1 text-[11px] leading-none text-accent sm:px-3 sm:text-xs">
              Кабинет владельца
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

        <h1 className="mt-7 text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em]">{copy.pageTitle}</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">{copy.pageSubtitle}</p>
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openSite}
              className="inline-flex h-11 items-center rounded-full border border-accent/50 px-4 text-sm text-accent"
            >
              Посмотреть сайт
            </button>
            <button
              type="button"
              onClick={() => void copySiteLink()}
              className="inline-flex h-11 items-center rounded-full border border-line px-4 text-sm text-foreground"
            >
              Скопировать ссылку
            </button>
          </div>
          {siteNote ? (
            <p className="mt-2 text-sm text-accent" role="status">
              {siteNote}
            </p>
          ) : null}
        </div>

        <OwnerMessages />

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
          <button type="button" onClick={startCreate} className={ownerActionButton}>
            {copy.addDish}
          </button>
          <button
            type="button"
            aria-expanded={categoryComposer}
            onClick={openCategoryComposer}
            className={ownerActionButton}
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
                onClick={closeCategoryComposer}
                className="h-12 shrink-0 rounded-full border border-line px-5 text-sm"
              >
                Закрыть
              </button>
            </div>
            {categoryNotice ? (
              <p
                className={`text-sm ${categoryNotice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`}
                role={categoryNotice.tone === "error" ? "alert" : "status"}
              >
                {categoryNotice.text}
              </p>
            ) : null}
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
                  placeholder={copy.descriptionPlaceholder}
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
              <PhotoPicker
                label={savedDishPhoto ? "Заменить фото" : "Добавить фото"}
                busy={photoBusy}
                tone="accent"
                onFile={(file) => void onPhoto(file)}
              />
              {!activeDraft.id && pendingPhoto ? (
                <p className="text-sm text-muted">{copy.photoAfterSave}</p>
              ) : null}
              {activeDraft.image || savedDishPhoto ? (
                <button
                  type="button"
                  onClick={() => void removePhoto()}
                  disabled={photoBusy}
                  className="h-12 rounded-full border border-line px-5 text-sm disabled:opacity-60"
                >
                  Удалить фото
                </button>
              ) : null}
              {activeDraft.image ? (
                <DishPhoto
                  src={menuPhotoUrl(activeDraft.image)}
                  alt="Предпросмотр"
                  className="aspect-[16/9] rounded-2xl"
                  sizes="(max-width: 640px) 100vw, 560px"
                />
              ) : null}
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={activeDraft.visible}
                  onChange={(event) => setDraft({ ...activeDraft, visible: event.target.checked })}
                  className="size-4 accent-[#3dbe7a]"
                />
                {copy.showToGuests}
              </label>
              {error ? <p className="text-sm text-[#e2b2a2]">{error}</p> : null}
              {message ? <p className="text-sm text-accent">{message}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void saveDish()}
                  disabled={photoBusy}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-[#062117] disabled:opacity-60"
                >
                  {copy.saveDish}
                </button>
                <button
                  type="button"
                  onClick={closeDishForm}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-line px-6 text-sm"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-2xl font-semibold tracking-tight">{copy.allDishes}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <FilterChip active={selectedCategory === "all"} onClick={() => setCategoryFilter("all")}>
              Все
            </FilterChip>
            {menu.categories.map((category) => (
              <FilterChip
                key={category.id}
                active={selectedCategory === category.id}
                onClick={() =>
                  setCategoryFilter((current) => (current === category.id ? "all" : category.id))
                }
              >
                {category.name}
              </FilterChip>
            ))}
          </div>
          <CategoryManager
            categories={menu.categories}
            drafts={categoryDrafts}
            editingId={editingCategoryId}
            notice={categoryComposer ? null : categoryNotice}
            onEdit={beginCategoryEdit}
            onCancel={cancelCategoryEdit}
            onDraft={(id, value) => setCategoryDrafts((current) => ({ ...current, [id]: value }))}
            onSave={(id) => void saveCategory(id)}
            onDelete={(id) => void removeCategory(id)}
            emptyLabel={copy.noCategories}
            nameLabel={copy.categoryNameLabel}
          />
          {dishNotice ? (
            <p
              className={`mt-4 text-sm ${dishNotice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`}
              role={dishNotice.tone === "error" ? "alert" : "status"}
            >
              {dishNotice.text}
            </p>
          ) : null}
          {listedDishes.length === 0 ? (
            <p className="mt-6 text-sm text-muted">{menu.dishes.length === 0 ? copy.noDishes : copy.noDishesInCategory}</p>
          ) : null}
          <ul className="mt-2">
            {listedDishes.map((dish) => {
              const category = menu.categories.find((item) => item.id === dish.categoryId);
              const menuOpen = dishMenuId === dish.id;
              return (
                <li key={dish.id} className="flex items-center gap-3 border-b border-line py-4 sm:gap-4">
                  <DishPhoto
                    src={menuPhotoUrl(dish.image)}
                    alt=""
                    className="size-16 shrink-0 rounded-2xl sm:size-[4.5rem]"
                    sizes="72px"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{dish.name}</p>
                    <p className="mt-1 truncate text-sm text-muted">{category?.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
                      <span className="text-sm">{formatPrice(dish.price)}</span>
                      <VisibilityBadge visible={dish.visible} />
                    </div>
                  </div>
                  <p className="hidden w-28 shrink-0 text-right text-sm sm:block">{formatPrice(dish.price)}</p>
                  <span className="hidden sm:inline-flex">
                    <VisibilityBadge visible={dish.visible} />
                  </span>
                  <div className="relative shrink-0">
                        <button
                          type="button"
                          aria-label={`Действия: ${dish.name}`}
                          aria-expanded={menuOpen}
                          onClick={() => setDishMenuId(menuOpen ? null : dish.id)}
                          className="grid size-8 place-items-center rounded-full text-muted"
                        >
                          <MoreHorizontal className="size-5" />
                        </button>
                        {menuOpen ? (
                          <div className="absolute top-8 right-0 z-20 w-40 rounded-2xl border border-line bg-card p-1 shadow-[0_16px_40px_rgba(0,0,0,0.4)]">
                            <button
                              type="button"
                              onClick={() => {
                                setDishMenuId(null);
                                startEdit(dish);
                              }}
                              className="block w-full rounded-xl px-3 py-2 text-left text-sm"
                            >
                              {copy.editDishAction}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDishMenuId(null);
                                void toggleDish(dish);
                              }}
                              className="block w-full rounded-xl px-3 py-2 text-left text-sm"
                            >
                              {dish.visible ? copy.hideItem : copy.showItem}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDishMenuId(null);
                                void removeDish(dish);
                              }}
                              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[#e2b2a2]"
                            >
                              {copy.deleteDish}
                            </button>
                          </div>
                        ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
          <button
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <span className="font-medium">Расширенные настройки</span>
            <ChevronDown className={`size-5 text-muted transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
          </button>
          {settingsOpen ? (
            <div className="grid gap-6 border-t border-line px-4 py-5">
              {accountEmail ? <p className="text-sm text-muted">{accountEmail}</p> : null}
              <div>
                <p className="text-xs font-medium tracking-[0.16em] text-accent uppercase">Настройки</p>
                <p className="mt-2 text-sm leading-6 text-muted">{copy.settingsNote}</p>
                <div className="mt-4 grid gap-4">
                  <Field label="Название">
                    <input
                      value={settings.name}
                      onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Описание">
                    <textarea
                      value={settings.description}
                      onChange={(event) => setSettings((current) => ({ ...current, description: event.target.value }))}
                      className="min-h-28 w-full resize-y rounded-2xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60"
                    />
                  </Field>
                  <Field label="Подописание">
                    <textarea
                      id="owner-sub-description"
                      value={settings.subDescription}
                      maxLength={SUB_DESCRIPTION_MAX}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          subDescription: event.target.value.slice(0, SUB_DESCRIPTION_MAX),
                        }))
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
                      onChange={(event) => setSettings((current) => ({ ...current, address: event.target.value }))}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Телефон заведения">
                    <input
                      inputMode="tel"
                      value={settings.phone}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, phone: formatPhone(event.target.value) }))
                      }
                      className={fieldClass}
                      placeholder="+7 900 000-00-00"
                    />
                  </Field>
                  <Field label="Часы работы">
                    <input
                      value={settings.hours}
                      onChange={(event) => setSettings((current) => ({ ...current, hours: event.target.value }))}
                      className={fieldClass}
                      placeholder="Ежедневно 10:00–23:00"
                    />
                  </Field>
                  <Field label={copy.cashierPhone}>
                    <input
                      inputMode="tel"
                      value={settings.orderPhone}
                      onChange={(event) => {
                        const orderPhone = formatPhone(event.target.value);
                        setSettings((current) => ({ ...current, orderPhone }));
                        setOrderPhoneError((current) =>
                          current ? cashierPhoneError(orderPhone, copy.cashierPhoneRequired) : "",
                        );
                      }}
                      className={fieldClass}
                      placeholder="+7 981 881-04-30"
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
                        setSettings((current) => ({
                          ...current,
                          orderEnabled,
                          ...(orderEnabled ? {} : { telegram: false, max: false }),
                        }));
                      }}
                      className="size-4 accent-[#3dbe7a]"
                    />
                    {copy.acceptMessengerOrders}
                  </label>
                  <label
                    className={`flex items-center gap-3 text-sm ${settings.orderEnabled ? "" : "opacity-60"}`}
                  >
                    <input
                      type="checkbox"
                      checked={settings.telegram}
                      disabled={!settings.orderEnabled}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, telegram: event.target.checked }))
                      }
                      className="size-4 accent-[#3dbe7a]"
                    />
                    {copy.telegramOrders}
                  </label>
                  <label
                    className={`flex items-center gap-3 text-sm ${settings.orderEnabled ? "" : "opacity-60"}`}
                  >
                    <input
                      type="checkbox"
                      checked={settings.max}
                      disabled={!settings.orderEnabled}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, max: event.target.checked }))
                      }
                      className="size-4 accent-[#3dbe7a]"
                    />
                    {copy.maxOrders}
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.callButtonEnabled}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, callButtonEnabled: event.target.checked }))
                      }
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
              </div>
            </div>
          ) : null}
        </section>

        {saveTheme ? (
          <OwnerThemeSection
            saved={theme}
            storage={themeStorage}
            site={site}
            onSave={saveTheme}
            banner={{
              src: bannerSrc,
              hasBanner: Boolean(menu.venue.banner),
              busy: bannerBusy,
              notice: bannerNotice,
              hint: copy.bannerHint,
              onFile: (file) => void onBannerFile(file),
              onRemove: () => void removeBanner(),
            }}
          />
        ) : null}
        <OwnerAppSection
          savedName={pwaName}
          venueName={menu.venue.name}
          iconPath={pwaIcon}
          storage={pwaStorage}
          onSaveName={savePwaName}
          onSaveIcon={setPwaIcon}
          onDeleteIcon={deletePwaIcon}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
      <div className="lg:col-span-2">
        <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Заведение</p>
        <p className="font-display mt-2 text-4xl leading-none">{menu.venue.name}</p>
      </div>
      <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
        <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Блюдо</p>
        <h1 className="font-display mt-3 text-4xl leading-none sm:text-5xl">
          {activeDraft.id ? "Редактирование" : "Новая позиция"}
        </h1>
        <div className="mt-6 grid gap-4">
          <Field label="Название">
            <input
              value={activeDraft.name}
              onChange={(event) => setDraft({ ...activeDraft, name: event.target.value })}
              className={fieldClass}
              placeholder="Например, Классическая"
            />
          </Field>
          <Field label="Описание">
            <textarea
              value={activeDraft.description}
              onChange={(event) => setDraft({ ...activeDraft, description: event.target.value })}
              className="min-h-28 w-full resize-y rounded-2xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60"
              placeholder="Коротко, что внутри"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Цена, ₽">
              <input
                inputMode="numeric"
                value={activeDraft.price}
                onChange={(event) => setDraft({ ...activeDraft, price: event.target.value })}
                className={fieldClass}
                placeholder="290"
              />
            </Field>
            <Field label="Категория">
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
          <PhotoPicker
            label={savedDishPhoto ? "Заменить фото" : "Добавить фото"}
            busy={photoBusy}
            onFile={(file) => void onPhoto(file)}
          />
          {!activeDraft.id && pendingPhoto ? (
            <p className="text-sm text-muted">Фотография загрузится после сохранения блюда.</p>
          ) : null}
          {activeDraft.image || savedDishPhoto ? (
            <button
              type="button"
              onClick={() => void removePhoto()}
              disabled={photoBusy}
              className="h-12 rounded-full border border-line px-5 text-sm disabled:opacity-60"
            >
              Удалить фото
            </button>
          ) : null}
          {activeDraft.image ? (
            <DishPhoto
              src={menuPhotoUrl(activeDraft.image)}
              alt="Предпросмотр"
              className="aspect-[16/9] rounded-2xl"
              sizes="(max-width: 640px) 100vw, 560px"
            />
          ) : null}
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={activeDraft.visible}
              onChange={(event) => setDraft({ ...activeDraft, visible: event.target.checked })}
              className="size-4 accent-[#3dbe7a]"
            />
            Показывать гостям в меню
          </label>
          {error ? <p className="text-sm text-[#e2b2a2]">{error}</p> : null}
          {message ? <p className="text-sm text-accent">{message}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void saveDish()}
              disabled={photoBusy}
              className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background disabled:opacity-60"
            >
              Сохранить блюдо
            </button>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-12 items-center justify-center rounded-full border border-line px-6 text-sm"
            >
              Новое блюдо
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6">
        <section className="rounded-3xl border border-line bg-card p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Баннер</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Эта картинка стоит вверху публичного меню. Без неё гости видят аккуратную заглушку.
          </p>
          {bannerSrc ? (
            <DishPhoto
              src={bannerSrc}
              alt="Баннер"
              className="mt-4 aspect-[16/7] rounded-2xl"
              sizes="(max-width: 640px) 100vw, 560px"
            />
          ) : null}
          {bannerNotice ? (
            <p
              className={`mt-4 text-sm ${bannerNotice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`}
              role={bannerNotice.tone === "error" ? "alert" : "status"}
            >
              {bannerNotice.text}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <PhotoPicker
              label={menu.venue.banner ? "Заменить фото" : "Добавить фото"}
              busy={bannerBusy}
              tone="accent"
              onFile={(file) => void onBannerFile(file)}
            />
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
        </section>

        <section className="rounded-3xl border border-line bg-card p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Категории</p>
          {categoryNotice ? (
            <p
              className={`mt-4 text-sm ${categoryNotice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`}
              role={categoryNotice.tone === "error" ? "alert" : "status"}
            >
              {categoryNotice.text}
            </p>
          ) : null}
          {menu.categories.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Категорий пока нет.</p>
          ) : null}
          <ul className={`divide-y divide-line ${menu.categories.length === 0 ? "" : "mt-4"}`}>
            {menu.categories.map((category) => (
              <li key={category.id} className="flex flex-col gap-2 py-3 sm:flex-row">
                <input
                  value={categoryDrafts[category.id] ?? category.name}
                  onChange={(event) =>
                    setCategoryDrafts((current) => ({ ...current, [category.id]: event.target.value }))
                  }
                  className={fieldClass}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveCategory(category.id)}
                    className="h-12 rounded-full border border-line px-4 text-sm"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCategory(category.id)}
                    className="h-12 rounded-full border border-line px-4 text-sm text-muted"
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              className={fieldClass}
              placeholder="Новая категория"
            />
            <button
              type="button"
              onClick={addCategory}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background"
            >
              <Plus className="size-4" />
              Добавить
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
          <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Настройки</p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Эти данные относятся только к вашему заведению. Заказ по-прежнему приходит личным сообщением на номер кассира.
          </p>
          <div className="mt-4 grid gap-4">
            <Field label="Название">
              <input
                value={settings.name}
                onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))}
                className={fieldClass}
              />
            </Field>
            <Field label="Описание">
              <textarea
                value={settings.description}
                onChange={(event) => setSettings((current) => ({ ...current, description: event.target.value }))}
                className="min-h-28 w-full resize-y rounded-2xl border border-line bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60"
              />
            </Field>
            <Field label="Адрес">
              <input
                value={settings.address}
                onChange={(event) => setSettings((current) => ({ ...current, address: event.target.value }))}
                className={fieldClass}
              />
            </Field>
            <Field label="Телефон заведения">
              <input
                inputMode="tel"
                value={settings.phone}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, phone: formatPhone(event.target.value) }))
                }
                className={fieldClass}
                placeholder="+7 900 000-00-00"
              />
            </Field>
            <Field label="Часы работы">
              <input
                value={settings.hours}
                onChange={(event) => setSettings((current) => ({ ...current, hours: event.target.value }))}
                className={fieldClass}
                placeholder="Ежедневно 10:00–23:00"
              />
            </Field>
            <Field label="Телефон кассира">
              <input
                inputMode="tel"
                value={settings.orderPhone}
                onChange={(event) => {
                  const orderPhone = formatPhone(event.target.value);
                  setSettings((current) => ({ ...current, orderPhone }));
                  setOrderPhoneError((current) => (current ? cashierPhoneError(orderPhone) : ""));
                }}
                className={fieldClass}
                placeholder="+7 981 881-04-30"
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
                  setSettings((current) => ({
                    ...current,
                    orderEnabled,
                    ...(orderEnabled ? {} : { telegram: false, max: false }),
                  }));
                }}
                className="size-4 accent-[#3dbe7a]"
              />
              {copy.acceptMessengerOrders}
            </label>
            <label
              className={`flex items-center gap-3 text-sm ${settings.orderEnabled ? "" : "opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={settings.telegram}
                disabled={!settings.orderEnabled}
                onChange={(event) => setSettings((current) => ({ ...current, telegram: event.target.checked }))}
                className="size-4 accent-[#3dbe7a]"
              />
              Принимать заказы в Telegram
            </label>
            <label
              className={`flex items-center gap-3 text-sm ${settings.orderEnabled ? "" : "opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={settings.max}
                disabled={!settings.orderEnabled}
                onChange={(event) => setSettings((current) => ({ ...current, max: event.target.checked }))}
                className="size-4 accent-[#3dbe7a]"
              />
              Принимать заказы в MAX
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.callButtonEnabled}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, callButtonEnabled: event.target.checked }))
                }
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
              className="h-12 rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
            >
              {savingSettings ? "Сохраняем…" : "Сохранить настройки"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
          <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Все блюда</p>
          {dishNotice ? (
            <p
              className={`mt-4 text-sm ${dishNotice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`}
              role={dishNotice.tone === "error" ? "alert" : "status"}
            >
              {dishNotice.text}
            </p>
          ) : null}
          {menu.dishes.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Блюд пока нет.</p>
          ) : null}
          <ul className={`divide-y divide-line ${menu.dishes.length === 0 ? "" : "mt-4"}`}>
            {menu.dishes.map((dish) => {
              const category = menu.categories.find((item) => item.id === dish.categoryId);
              return (
                <li key={dish.id} className="flex gap-3 py-3">
                  <DishPhoto
                    src={menuPhotoUrl(dish.image)}
                    alt=""
                    className="size-16 shrink-0 rounded-xl"
                    sizes="64px"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="truncate text-sm font-medium">{dish.name}</p>
                        <p className="mt-1 text-xs text-muted">
                          {category?.name} · {formatPrice(dish.price)}
                          {dish.visible ? "" : " · скрыто"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => startEdit(dish)} className={tinyButton}>
                        Изменить
                      </button>
                      <button type="button" onClick={() => void toggleDish(dish)} className={tinyButton}>
                        {dish.visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        {dish.visible ? "Скрыть" : "Показать"}
                      </button>
                      <button type="button" onClick={() => void removeDish(dish)} className={tinyButton}>
                        <Trash2 className="size-3.5" />
                        Удалить
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

const ownerActionButton =
  "home-cta inline-flex h-12 items-center justify-center rounded-full px-3 text-center text-sm leading-tight font-medium";

const categoryButton =
  "inline-flex h-12 items-center justify-center rounded-full border border-line px-4 text-sm text-muted";

const fieldClass =
  "h-12 w-full rounded-2xl border border-line bg-background px-4 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60";

const tinyButton =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-muted";

function OwnerThemeSection({
  saved,
  storage,
  site,
  onSave,
  banner,
}: {
  saved: MenuTheme;
  storage: "ready" | "missing";
  site: OwnerSite | null;
  onSave: (theme: MenuTheme) => Promise<{ ok: true } | { ok: false; message: string }>;
  banner?: {
    src: string;
    hasBanner: boolean;
    busy: boolean;
    notice: { tone: "error" | "success"; text: string } | null;
    hint: string;
    onFile: (file: File | undefined) => void;
    onRemove: () => void;
  };
}) {
  const [selected, setSelected] = useState(saved);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const unavailable = storage === "missing";

  useEffect(() => {
    setSelected(saved);
  }, [saved]);

  const preview = () => {
    if (!site?.slug || !site.published) {
      setNotice({ tone: "error", text: siteMessage(site) });
      return;
    }
    const url = new URL(`/m/${site.slug}`, window.location.origin);
    url.searchParams.set("theme", selected);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };

  const save = async () => {
    setBusy(true);
    const result = await onSave(selected);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setNotice({ tone: "success", text: "Оформление сохранено" });
  };

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <span className="font-medium">Оформление сайта</span>
        <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
      <div className="grid gap-6 border-t border-line px-4 py-5">
      {banner ? (
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-accent uppercase">Баннер</p>
          <p className="mt-2 text-sm leading-6 text-muted">{banner.hint}</p>
          {banner.src ? (
            <DishPhoto
              src={banner.src}
              alt="Баннер"
              className="mt-4 aspect-[16/7] rounded-2xl"
              sizes="(max-width: 640px) 100vw, 560px"
            />
          ) : null}
          {banner.notice ? (
            <p
              className={`mt-4 text-sm ${banner.notice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`}
              role={banner.notice.tone === "error" ? "alert" : "status"}
            >
              {banner.notice.text}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <PhotoPicker
              label={banner.hasBanner ? "Заменить фото" : "Добавить фото"}
              busy={banner.busy}
              tone="accent"
              onFile={banner.onFile}
            />
            {banner.hasBanner ? (
              <button
                type="button"
                onClick={banner.onRemove}
                disabled={banner.busy}
                className="h-12 rounded-full border border-line px-5 text-sm disabled:opacity-60"
              >
                Удалить фото
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div>
      <p className="text-sm leading-6 text-muted">
        Тема видна только гостям на публичной странице. Кабинет остаётся прежним.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {menuThemeChoices.map((choice) => {
          const active = choice.id === selected;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelected(choice.id);
                setNotice(null);
              }}
              className={`rounded-2xl border p-3 text-left ${active ? "border-accent" : "border-line"}`}
            >
              <span className={`guest ${menuThemeClass(choice.id)} flex h-14 overflow-hidden rounded-xl`}>
                <span className="w-1/2 bg-background" />
                <span className="w-1/4 bg-card" />
                <span className="w-1/4 bg-accent" />
              </span>
              <span className="mt-2 block text-sm">{choice.title}</span>
              {active ? <span className="mt-1 block text-xs text-accent">Выбрано</span> : null}
            </button>
          );
        })}
      </div>
      {unavailable ? (
        <p className="mt-4 text-sm text-[#e2b2a2]" role="alert">
          Сохранение оформления пока недоступно. Обновление базы ещё не применено.
        </p>
      ) : null}
      {notice ? (
        <p className={`mt-4 text-sm ${notice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={preview} className="h-12 rounded-full border border-line px-5 text-sm">
          Предпросмотр
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected(saved);
            setNotice(null);
          }}
          disabled={selected === saved}
          className="h-12 rounded-full border border-line px-5 text-sm disabled:opacity-60"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="h-12 rounded-full bg-accent px-5 text-sm font-medium text-[#062117] disabled:opacity-60"
        >
          {busy ? "Сохраняем…" : "Сохранить оформление"}
        </button>
      </div>
      </div>
      </div>
      ) : null}
    </section>
  );
}

function OwnerAppSection({
  savedName,
  venueName,
  iconPath,
  storage,
  onSaveName,
  onSaveIcon,
  onDeleteIcon,
}: {
  savedName: string;
  venueName: string;
  iconPath: string;
  storage: "ready" | "missing";
  onSaveName: (name: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onSaveIcon: (file: File) => Promise<{ ok: true; path?: string } | { ok: false; message: string }>;
  onDeleteIcon: () => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [name, setName] = useState(savedName);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const unavailable = storage === "missing";
  const previewName = name.trim() || venueName.trim() || "Приложение";
  const previewSrc = iconPath ? menuPhotoUrl(iconPath) : "/icons/icon-192.png";

  useEffect(() => {
    setName(savedName);
  }, [savedName]);

  const saveName = async () => {
    setBusy(true);
    const result = await onSaveName(name);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setNotice({ tone: "success", text: "Название приложения сохранено" });
  };

  const uploadIcon = async (file: File | undefined) => {
    if (!file || busy) return;
    setNotice(null);
    setBusy(true);
    const result = await onSaveIcon(file);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setNotice({ tone: "success", text: "Иконка сохранена" });
  };

  const removeIcon = async () => {
    if (busy) return;
    setNotice(null);
    setBusy(true);
    const result = await onDeleteIcon();
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.message });
      return;
    }
    setNotice({ tone: "success", text: "Иконка удалена. На экране будет стандартная иконка NFCMENU." });
  };

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <span className="font-medium">Моё приложение</span>
        <ChevronDown className={`size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
      <div className="border-t border-line px-4 py-5">
      <p className="mt-2 text-sm leading-6 text-muted">
        Название и иконка для экрана «Домой» этого заведения. Пустое название означает название заведения. Своя иконка
        обрезается по центру до квадрата. Пока её нет, используется стандартная иконка NFCMENU.
      </p>
      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-line bg-background p-4">
        <DishPhoto src={previewSrc} alt="" className="size-16 shrink-0 rounded-2xl" sizes="64px" />
        <div className="min-w-0">
          <p className="text-xs text-muted">На экране «Домой»</p>
          <p className="mt-1 truncate text-base font-medium">{previewName}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <label className="text-sm" htmlFor="pwa-app-name">
          Название приложения
        </label>
        <input
          id="pwa-app-name"
          value={name}
          maxLength={40}
          disabled={unavailable || busy}
          onChange={(event) => {
            setName(event.target.value.slice(0, 40));
            setNotice(null);
          }}
          className={fieldClass}
          placeholder={venueName || "Название на экране"}
        />
        <p className="text-xs text-muted">{name.trim().length} из 40</p>
      </div>
      {unavailable ? (
        <p className="mt-4 text-sm text-[#e2b2a2]" role="alert">
          Сохранение приложения пока недоступно. Обновление базы ещё не применено.
        </p>
      ) : null}
      {notice ? (
        <p className={`mt-4 text-sm ${notice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => void saveName()}
          disabled={busy || unavailable || name.trim() === savedName}
          className="h-12 rounded-full bg-accent px-5 text-sm font-medium text-[#062117] disabled:opacity-60"
        >
          {busy ? "Сохраняем…" : "Сохранить название"}
        </button>
        <PhotoPicker
          label={iconPath ? "Заменить иконку" : "Загрузить иконку"}
          busy={busy}
          disabled={unavailable}
          onFile={(file) => void uploadIcon(file)}
        />
        {iconPath ? (
          <button
            type="button"
            onClick={() => void removeIcon()}
            disabled={busy || unavailable}
            className="h-12 rounded-full border border-line px-5 text-sm disabled:opacity-60"
          >
            Удалить иконку
          </button>
        ) : null}
      </div>
      </div>
      ) : null}
    </section>
  );
}

function siteMessage(site: OwnerSite | null) {
  if (site?.status === "draft") {
    return "Публичная страница скрыта. Сначала переведите заведение в демо.";
  }
  if (site?.blocked || site?.archived) {
    return "Публичная страница скрыта, пока заведение заблокировано или находится в архиве.";
  }
  return "Публичная страница сейчас недоступна.";
}

function VisibilityBadge({ visible }: { visible: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs ${
        visible ? "bg-accent/15 text-accent" : "bg-white/5 text-muted"
      }`}
    >
      {visible ? "Показывается" : "Скрыто"}
    </span>
  );
}

function CategoryManager({
  categories,
  drafts,
  editingId,
  notice,
  onEdit,
  onCancel,
  onDraft,
  onSave,
  onDelete,
  emptyLabel = "Категорий пока нет.",
  nameLabel = "Название категории",
}: {
  categories: { id: string; name: string }[];
  drafts: Record<string, string>;
  editingId: string | null;
  notice: { tone: "error" | "success"; text: string } | null;
  onEdit: (id: string, name: string) => void;
  onCancel: (id: string) => void;
  onDraft: (id: string, value: string) => void;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
  emptyLabel?: string;
  nameLabel?: string;
}) {
  return (
    <div className="mt-4">
      {notice ? (
        <p
          className={`text-sm ${notice.tone === "error" ? "text-[#e2b2a2]" : "text-accent"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}
      {categories.length === 0 ? <p className="mt-3 text-sm text-muted">{emptyLabel}</p> : null}
      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {categories.map((category) => {
          const editing = editingId === category.id;
          return (
            <li key={category.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              {editing ? (
                <input
                  value={drafts[category.id] ?? category.name}
                  onChange={(event) => onDraft(category.id, event.target.value)}
                  aria-label={`${nameLabel} ${category.name}`}
                  className={fieldClass}
                />
              ) : (
                <p className="truncate text-sm">{category.name}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {editing ? (
                  <>
                    <button type="button" onClick={() => onSave(category.id)} className={categoryButton}>
                      Сохранить
                    </button>
                    <button type="button" onClick={() => onCancel(category.id)} className={categoryButton}>
                      Закрыть
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => onEdit(category.id, category.name)} className={categoryButton}>
                      Изменить
                    </button>
                    <button type="button" onClick={() => onDelete(category.id)} className={categoryButton}>
                      Удалить
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
      className={`h-9 shrink-0 rounded-full px-4 text-sm ${
        active ? "bg-accent font-medium text-[#062117]" : "bg-card text-muted"
      }`}
    >
      {children}
    </button>
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

function PhotoPicker({
  label,
  busy,
  onFile,
  tone = "default",
  disabled = false,
}: {
  label: string;
  busy: boolean;
  onFile: (file: File | undefined) => void;
  tone?: "default" | "accent";
  disabled?: boolean;
}) {
  const locked = busy || disabled;
  return (
    <label
      className={`inline-flex h-12 cursor-pointer items-center justify-center rounded-full px-6 text-sm font-medium ${
        tone === "accent" ? "bg-accent text-[#062117]" : "bg-foreground text-background"
      } ${locked ? "pointer-events-none opacity-60" : ""}`}
    >
      {busy ? "Загружаем…" : label}
      <input
        type="file"
        accept="image/*"
        disabled={locked}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          onFile(file);
        }}
      />
    </label>
  );
}
