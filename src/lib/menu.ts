export type OrderChannels = {
  telegram: boolean;
  max: boolean;
};

export type Venue = {
  name: string;
  description: string;
  subDescription: string;
  address: string;
  phone: string;
  hours: string;
  orderPhone: string;
  banner: string;
  channels: OrderChannels;
  orderEnabled: boolean;
  callButtonEnabled: boolean;
};

export const SUB_DESCRIPTION_MAX = 150;

export type Category = {
  id: string;
  name: string;
};

export type Dish = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  image: string;
  visible: boolean;
};

export type MenuState = {
  venue: Venue;
  categories: Category[];
  dishes: Dish[];
};

export const MENU_STORAGE_KEY = "nfcmenu.menu.v1";
export const MENU_CHANGE_EVENT = "nfcmenu-menu";

const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

export const seedMenu: MenuState = {
  venue: {
    name: "Шаурма №1",
    description:
      "Сочная шаурма, свежие овощи и соусы, которые готовят при вас. Меню открывается на телефоне — без бумажной карточки.",
    subDescription: "",
    address: "Владивосток, ул. Светланская, 12",
    phone: "+7 914 000-00-01",
    hours: "Ежедневно 10:00–23:00",
    orderPhone: "+7 981 881-04-30",
    banner: "",
    channels: { telegram: true, max: true },
    orderEnabled: true,
    callButtonEnabled: false,
  },
  categories: [
    { id: "shawarma", name: "Шаурма" },
    { id: "snacks", name: "Закуски" },
    { id: "drinks", name: "Напитки" },
  ],
  dishes: [
    {
      id: "classic",
      categoryId: "shawarma",
      name: "Классическая",
      description: "Курица, свежие овощи, фирменный чесночный соус и лаваш.",
      price: 290,
      image: photo("photo-1529006557810-274b9b2fc783"),
      visible: true,
    },
    {
      id: "spicy",
      categoryId: "shawarma",
      name: "Острая",
      description: "Та же классика, но с острым соусом и перцем.",
      price: 320,
      image: photo("photo-1561651823-34feb02250e4"),
      visible: true,
    },
    {
      id: "cheese",
      categoryId: "shawarma",
      name: "Сырная",
      description: "Курица, расплавленный сыр и овощи в тёплом лаваше.",
      price: 340,
      image: photo("photo-1555939594-58d7cb561ad1"),
      visible: true,
    },
    {
      id: "fries",
      categoryId: "snacks",
      name: "Картофель фри",
      description: "Хрустящая картошка с солью. Можно взять к шаурме.",
      price: 150,
      image: photo("photo-1573080496219-bb080dd4f877"),
      visible: true,
    },
    {
      id: "ayran",
      categoryId: "drinks",
      name: "Айран",
      description: "Холодный кисломолочный напиток, 0,3 л.",
      price: 90,
      image: photo("photo-1544145945-f90425340c7e"),
      visible: true,
    },
    {
      id: "double",
      categoryId: "shawarma",
      name: "Двойная",
      description: "Двойная порция курицы. Сейчас скрыта из меню для гостей.",
      price: 420,
      image: photo("photo-1626645738196-c2a7c87a8f58"),
      visible: false,
    },
  ],
};

function orderPhoneFrom(value: unknown) {
  if (typeof value !== "string" || value.replace(/\D/g, "").length < 11) {
    return seedMenu.venue.orderPhone;
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalize(raw: unknown): MenuState | null {
  if (!isRecord(raw) || !Array.isArray(raw.categories) || !Array.isArray(raw.dishes)) {
    return null;
  }

  const categories = raw.categories.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") {
      return [];
    }
    const name = item.name.trim();
    if (!name) return [];
    return [{ id: item.id, name }];
  });

  if (categories.length === 0) return null;
  const categoryIds = new Set(categories.map((category) => category.id));

  const dishes = raw.dishes.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.categoryId !== "string" ||
      !categoryIds.has(item.categoryId)
    ) {
      return [];
    }
    const name = item.name.trim();
    if (!name) return [];
    const price = Number(item.price);
    return [
      {
        id: item.id,
        categoryId: item.categoryId,
        name,
        description: typeof item.description === "string" ? item.description.trim() : "",
        price: Number.isFinite(price) && price >= 0 ? Math.round(price) : 0,
        image: typeof item.image === "string" ? item.image : "",
        visible: item.visible !== false,
      },
    ];
  });

  const venueRaw = isRecord(raw.venue) ? raw.venue : {};
  const channelsRaw = isRecord(venueRaw.channels) ? venueRaw.channels : {};
  const venue: Venue = {
    name: typeof venueRaw.name === "string" && venueRaw.name.trim() ? venueRaw.name : seedMenu.venue.name,
    description:
      typeof venueRaw.description === "string" ? venueRaw.description : seedMenu.venue.description,
    subDescription:
      typeof venueRaw.subDescription === "string" ? venueRaw.subDescription.slice(0, SUB_DESCRIPTION_MAX) : "",
    address: typeof venueRaw.address === "string" ? venueRaw.address : seedMenu.venue.address,
    phone: typeof venueRaw.phone === "string" ? venueRaw.phone : seedMenu.venue.phone,
    hours: typeof venueRaw.hours === "string" ? venueRaw.hours : seedMenu.venue.hours,
    orderPhone: orderPhoneFrom(venueRaw.orderPhone),
    banner: typeof venueRaw.banner === "string" ? venueRaw.banner.trim() : "",
    channels: {
      telegram: channelsRaw.telegram !== false,
      max: channelsRaw.max !== false,
    },
    orderEnabled: venueRaw.orderEnabled !== false,
    callButtonEnabled: venueRaw.callButtonEnabled === true,
  };

  return { venue, categories, dishes };
}

export function loadMenu(): MenuState {
  if (typeof window === "undefined") return seedMenu;
  try {
    const raw = window.localStorage.getItem(MENU_STORAGE_KEY);
    if (!raw) return seedMenu;
    return normalize(JSON.parse(raw)) ?? seedMenu;
  } catch {
    return seedMenu;
  }
}

export function saveMenu(menu: MenuState) {
  window.localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(menu));
  window.dispatchEvent(new Event(MENU_CHANGE_EVENT));
}

export function formatPrice(price: number) {
  return `${new Intl.NumberFormat("ru-RU").format(price)} ₽`;
}

export function createId() {
  return crypto.randomUUID();
}

function loadImageCanvas(file: File) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Не удалось открыть изображение"));
      image.onload = () => {
        const maxSide = 960;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Не удалось подготовить фото"));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function readImageFile(file: File) {
  return loadImageCanvas(file).then((canvas) => canvas.toDataURL("image/jpeg", 0.72));
}

export function readImageBlob(file: File) {
  return loadImageCanvas(file).then(
    (canvas) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Не удалось подготовить фото"));
            return;
          }
          resolve(blob);
        }, "image/jpeg", 0.72);
      }),
  );
}
