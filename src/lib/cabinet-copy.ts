import { type BusinessKind } from "@/lib/business-kind";

export type CabinetCopy = {
  pageTitle: string;
  pageSubtitle: string;
  dishCount: string;
  categoryCount: string;
  addDish: string;
  addCategory: string;
  newCategoryPlaceholder: string;
  editDish: string;
  newDish: string;
  editDishAction: string;
  price: string;
  categoryField: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  photoAfterSave: string;
  showToGuests: string;
  saveDish: string;
  allDishes: string;
  noDishes: string;
  noDishesInCategory: string;
  deleteDish: string;
  noCategories: string;
  categoryNameLabel: string;
  categoryNameTooLong: string;
  addCategoryFailed: string;
  saveCategoryFailed: string;
  deleteCategoryFailed: string;
  dishDeleted: string;
  deleteConfirm: string;
  hideItem: string;
  showItem: string;
  closeActions: string;
  bannerHint: string;
  settingsNote: string;
  cashierPhone: string;
  cashierPhoneRequired: string;
  telegramOrders: string;
  maxOrders: string;
  nameRequired: string;
  priceRequired: string;
  priceNegative: string;
  priceInteger: string;
  priceTooHigh: string;
  chooseCategory: string;
  savedPhotoFailed: string;
  dishSaved: string;
  dishAdded: string;
  dishShown: string;
  dishHidden: string;
  categoryNameRequired: string;
  categorySaved: string;
  newCategoryNameRequired: string;
  categoryHasItems: string;
  lastCategory: string;
  categoryAdded: string;
  categoryDeleted: string;
  loadFailed: string;
  itemNameRequired: string;
  itemNameTooLong: string;
  saveItemFailed: string;
  chooseOwnCategory: string;
  visibilityFailed: string;
  deleteItemFailed: string;
  saveBeforePhoto: string;
  noItemPhoto: string;
  checkFields: string;
};

const food: CabinetCopy = {
  pageTitle: "Моё меню",
  pageSubtitle: "Управляйте блюдами и категориями заведения",
  dishCount: "Блюд в меню",
  categoryCount: "Категории",
  addDish: "+ Добавить блюдо",
  addCategory: "+ Категория",
  newCategoryPlaceholder: "Новая категория",
  editDish: "Редактирование",
  newDish: "Новое блюдо",
  editDishAction: "Редактировать",
  price: "Цена, ₽",
  categoryField: "Категория",
  namePlaceholder: "Например, Классическая",
  descriptionPlaceholder: "Коротко, что внутри",
  photoAfterSave: "Фотография загрузится после сохранения блюда.",
  showToGuests: "Показывать гостям в меню",
  saveDish: "Сохранить блюдо",
  allDishes: "Все блюда",
  noDishes: "Блюд пока нет.",
  noDishesInCategory: "В этой категории пока нет блюд.",
  deleteDish: "Удалить",
  noCategories: "Категорий пока нет.",
  categoryNameLabel: "Название категории",
  categoryNameTooLong: "Название категории не длиннее 80 символов.",
  addCategoryFailed: "Не удалось добавить категорию.",
  saveCategoryFailed: "Не удалось сохранить категорию.",
  deleteCategoryFailed: "Не удалось удалить категорию.",
  dishDeleted: "Блюдо удалено",
  deleteConfirm: "Удалить «{name}»?",
  hideItem: "Скрыть",
  showItem: "Показать",
  closeActions: "Закрыть меню действий",
  bannerHint: "Эта картинка стоит вверху публичного меню. Без неё гости видят аккуратную заглушку.",
  settingsNote:
    "Эти данные относятся только к вашему заведению. Заказ по-прежнему приходит личным сообщением на номер кассира.",
  cashierPhone: "Телефон кассира",
  cashierPhoneRequired: "Введите номер телефона кассира",
  telegramOrders: "Принимать заказы в Telegram",
  maxOrders: "Принимать заказы в MAX",
  nameRequired: "Введите название блюда",
  priceRequired: "Введите цену",
  priceNegative: "Цена не может быть отрицательной.",
  priceInteger: "Введите цену целым числом рублей.",
  priceTooHigh: "Цена не больше 1 000 000 ₽.",
  chooseCategory: "Выберите категорию",
  savedPhotoFailed: "Блюдо сохранено, но фотография не загрузилась.",
  dishSaved: "Блюдо сохранено",
  dishAdded: "Блюдо добавлено",
  dishShown: "Блюдо снова видно гостям",
  dishHidden: "Блюдо скрыто из меню",
  categoryNameRequired: "Введите название категории",
  categorySaved: "Категория сохранена",
  newCategoryNameRequired: "Введите название новой категории",
  categoryHasItems: "Нельзя удалить категорию, пока в ней есть блюда",
  lastCategory: "Нельзя удалить последнюю категорию. У каждого заведения должна оставаться хотя бы одна категория",
  categoryAdded: "Категория добавлена",
  categoryDeleted: "Категория удалена",
  loadFailed: "Не удалось загрузить меню. Обновите страницу.",
  itemNameRequired: "Введите название блюда",
  itemNameTooLong: "Название блюда не длиннее 120 символов.",
  saveItemFailed: "Не удалось сохранить блюдо.",
  chooseOwnCategory: "Выберите категорию своего заведения.",
  visibilityFailed: "Не удалось изменить видимость блюда.",
  deleteItemFailed: "Не удалось удалить блюдо.",
  saveBeforePhoto: "Сначала сохраните блюдо, затем добавьте фото.",
  noItemPhoto: "У блюда нет фотографии.",
  checkFields: "Проверьте название, описание и цену.",
};

const beauty: CabinetCopy = {
  ...food,
  pageTitle: "Мои услуги",
  pageSubtitle: "Управляйте услугами и категориями заведения",
  dishCount: "Услуг",
  categoryCount: "Категории услуг",
  addDish: "+ Добавить услугу",
  addCategory: "+ Категория услуг",
  newCategoryPlaceholder: "Новая категория услуг",
  editDish: "Редактировать услугу",
  newDish: "Новая услуга",
  editDishAction: "Редактировать услугу",
  price: "Стоимость, ₽",
  categoryField: "Категория услуг",
  namePlaceholder: "Например, Стрижка",
  descriptionPlaceholder: "Коротко об услуге",
  photoAfterSave: "Фотография загрузится после сохранения услуги.",
  showToGuests: "Показывать гостям на сайте",
  saveDish: "Сохранить услугу",
  allDishes: "Все услуги",
  noDishes: "Услуг пока нет.",
  noDishesInCategory: "В этой категории пока нет услуг.",
  deleteDish: "Удалить услугу",
  noCategories: "Категорий услуг пока нет.",
  categoryNameLabel: "Название категории услуг",
  categoryNameTooLong: "Название категории услуг не длиннее 80 символов.",
  addCategoryFailed: "Не удалось добавить категорию услуг.",
  saveCategoryFailed: "Не удалось сохранить категорию услуг.",
  deleteCategoryFailed: "Не удалось удалить категорию услуг.",
  dishDeleted: "Услуга удалена",
  deleteConfirm: "Удалить услугу «{name}»?",
  hideItem: "Скрыть услугу",
  showItem: "Показать услугу",
  closeActions: "Закрыть список действий",
  bannerHint: "Эта картинка стоит вверху публичного сайта. Без неё гости видят аккуратную заглушку.",
  settingsNote:
    "Эти данные относятся только к вашему заведению. Сообщение по-прежнему приходит личным сообщением на указанный номер.",
  cashierPhone: "Телефон для сообщений",
  cashierPhoneRequired: "Введите номер телефона для сообщений",
  telegramOrders: "Принимать сообщения в Telegram",
  maxOrders: "Принимать сообщения в MAX",
  nameRequired: "Введите название услуги",
  priceRequired: "Введите стоимость",
  priceNegative: "Стоимость не может быть отрицательной.",
  priceInteger: "Введите стоимость целым числом рублей.",
  priceTooHigh: "Стоимость не больше 1 000 000 ₽.",
  chooseCategory: "Выберите категорию услуг",
  savedPhotoFailed: "Услуга сохранена, но фотография не загрузилась.",
  dishSaved: "Услуга сохранена",
  dishAdded: "Услуга добавлена",
  dishShown: "Услуга снова видна гостям",
  dishHidden: "Услуга скрыта с сайта",
  categoryNameRequired: "Введите название категории услуг",
  categorySaved: "Категория услуг сохранена",
  newCategoryNameRequired: "Введите название новой категории услуг",
  categoryHasItems: "Нельзя удалить категорию услуг, пока в ней есть услуги",
  lastCategory:
    "Нельзя удалить последнюю категорию услуг. У каждого заведения должна оставаться хотя бы одна категория услуг",
  categoryAdded: "Категория услуг добавлена",
  categoryDeleted: "Категория услуг удалена",
  loadFailed: "Не удалось загрузить услуги. Обновите страницу.",
  itemNameRequired: "Введите название услуги",
  itemNameTooLong: "Название услуги не длиннее 120 символов.",
  saveItemFailed: "Не удалось сохранить услугу.",
  chooseOwnCategory: "Выберите категорию услуг своего заведения.",
  visibilityFailed: "Не удалось изменить видимость услуги.",
  deleteItemFailed: "Не удалось удалить услугу.",
  saveBeforePhoto: "Сначала сохраните услугу, затем добавьте фото.",
  noItemPhoto: "У услуги нет фотографии.",
  checkFields: "Проверьте название, описание и стоимость.",
};

export function cabinetCopy(kind: BusinessKind): CabinetCopy {
  if (kind === "beauty") return beauty;
  return food;
}

export function fillCopy(template: string, name: string) {
  return template.replaceAll("{name}", name);
}
