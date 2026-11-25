import { seedMenu, type MenuState } from "@/lib/menu";
import type { MenuTheme } from "@/lib/menu-theme";

/** Версия шаблона персонального демо. Увеличивать при несовместимых изменениях структуры. */
export const PERSONAL_DEMO_TEMPLATE_VERSION = 1;

const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

/**
 * Начальный шаблон персонального демо.
 * Клонирует и расширяет seedMenu, не мутируя общий seed и публичную витрину `/demo`.
 */
export function createPersonalDemoMenu(): MenuState {
  const menu = structuredClone(seedMenu) as MenuState;

  menu.venue = {
    ...menu.venue,
    name: "Шаурма №1 — демо",
    description:
      "Сочная шаурма, свежие овощи и соусы, которые готовят при вас. Это ваш персональный черновик — меняйте меню и смотрите, как выглядит сайт для гостей.",
    subDescription:
      "Демоверсия только для вас. Настоящее заведение и данные клиентов здесь не создаются.",
    address: "Владивосток, ул. Светланская, 12",
    phone: "+7 914 000-00-01",
    hours: "Ежедневно 10:00–23:00",
    orderPhone: "+7 981 881-04-30",
    banner: photo("photo-1555939594-58d7cb561ad1"),
    channels: { telegram: true, max: true },
    orderEnabled: true,
    callButtonEnabled: true,
  };

  menu.categories = [
    { id: "shawarma", name: "Шаурма" },
    { id: "snacks", name: "Закуски" },
    { id: "drinks", name: "Напитки" },
    { id: "desserts", name: "Десерты" },
  ];

  menu.dishes = [
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
      id: "double",
      categoryId: "shawarma",
      name: "Двойная",
      description: "Двойная порция курицы. Скрыта из меню для гостей — пример выключения позиции.",
      price: 420,
      image: photo("photo-1626645738196-c2a7c87a8f58"),
      visible: false,
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
      id: "nuggets",
      categoryId: "snacks",
      name: "Наггетсы",
      description: "6 штук с соусом на выбор.",
      price: 190,
      image: photo("photo-1562967914-608f82629710"),
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
      id: "cola",
      categoryId: "drinks",
      name: "Лимонад",
      description: "Охлаждённый напиток, 0,5 л.",
      price: 120,
      image: photo("photo-1523677011780-c8ee50436391"),
      visible: true,
    },
    {
      id: "baklava",
      categoryId: "desserts",
      name: "Пахлава",
      description: "Сладкий десерт с орехами и мёдом.",
      price: 180,
      image: photo("photo-1571115177098-24ec42ed204d"),
      visible: true,
    },
  ];

  return menu;
}

export function personalDemoDefaultTheme(): MenuTheme {
  return "warm";
}
