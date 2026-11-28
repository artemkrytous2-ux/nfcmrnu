import type { Metadata } from "next";
import Link from "next/link";
import {
  AppWindow,
  ClipboardList,
  Link2,
  ListOrdered,
  Percent,
  Printer,
  QrCode,
  Settings2,
  ShoppingBag,
  Smartphone,
  UtensilsCrossed,
} from "lucide-react";
import { MONTH_PLAN_BENEFITS, SIX_MONTH_EXTRA_BENEFITS } from "@/lib/activation-plans";

export const metadata: Metadata = {
  title: "NFCMENU",
  description:
    "Меню, услуги, цены и фотографии на одной странице. Клиенты оформляют заказы и заявки, а вы сами управляете содержимым сайта через личный кабинет.",
};

const restaurantExample = "/m/nfcmenu-demo";
const salonExample = "/m/salonkrasotidemo";
const orderHref = "https://t.me/artuomk";

const examples = [
  { title: "Кафе и рестораны", href: restaurantExample },
  { title: "Салоны красоты", href: salonExample },
];

const essentials = [
  {
    title: "Меню и услуги",
    text: "Клиенты видят актуальные предложения, фотографии и цены.",
    icon: UtensilsCrossed,
  },
  {
    title: "Заказы и заявки",
    text: "Клиенты могут оформить заказ или связаться с заведением.",
    icon: ClipboardList,
  },
  {
    title: "Управление без программиста",
    text: "Вы самостоятельно меняете меню, услуги, фотографии и информацию через личный кабинет.",
    icon: Settings2,
  },
  {
    title: "Своё приложение для заведения",
    text: "Задайте индивидуальное название, загрузите собственную иконку и управляйте оформлением приложения прямо из личного кабинета.",
    icon: AppWindow,
  },
  {
    title: "Больше повторных заказов",
    text: "Клиент в один клик сохраняет ваш сайт как приложение на экран смартфона — ваш бренд всегда под рукой, и гость возвращается к вам, а не уходит к конкурентам.",
    icon: Smartphone,
  },
  {
    title: "0% комиссии с продаж",
    text: "Вся выручка с заказов и заявок остается у вас — вы не платите процент агрегаторам.",
    icon: Percent,
  },
  {
    title: "Экономия на печати меню",
    text: "Меняйте цены и добавляйте сезонные позиции в личном кабинете, не тратя деньги на перепечатку полиграфии.",
    icon: Printer,
  },
  {
    title: "Удобно для соцсетей и карт",
    text: "Одна короткая ссылка для Яндекс Карт, 2ГИС, мессенджеров и QR-кодов на столиках вместо неудобных PDF-файлов.",
    icon: Link2,
  },
];

const howItWorks = [
  {
    step: "1",
    title: "Заполняете каталог",
    text: "Регистрируетесь и добавляете позиции, фото и цены в личном кабинете.",
    icon: ListOrdered,
  },
  {
    step: "2",
    title: "Делитесь ссылкой или QR-кодом",
    text: "Размещаете ссылку в соцсетях и на картах или ставите QR-код в заведении.",
    icon: QrCode,
  },
  {
    step: "3",
    title: "Принимаете заказы",
    text: "Клиенты оформляют заказы, сохраняют ваше приложение на экран и заказывают снова.",
    icon: ShoppingBag,
  },
];

export default function Home() {
  return (
    <div id="top" className="home flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="shrink-0 text-[15px] font-extrabold tracking-[0.04em] text-accent uppercase">
            NFCMENU
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/admin" className="home-btn-sm home-btn-ghost">
              Войти
            </Link>
            <a href="#tariffs" className="home-cta home-btn-sm">
              Подключить
            </a>
          </div>
        </div>
      </header>

      <main>
        <section>
          <div className="home-shell">
            <h1 className="home-h1">Ваш бизнес — в удобном онлайн-формате</h1>
            <p className="home-lead">
              Меню, услуги, цены и фотографии на одной странице. Клиенты оформляют заказы и заявки, а вы сами управляете
              содержимым сайта через личный кабинет.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/try" className="home-cta home-btn">
                Попробовать бесплатно
              </Link>
              <a href="#tariffs" className="home-btn home-btn-ghost">
                Выбрать тариф
              </a>
            </div>
          </div>
        </section>

        <section id="examples" className="scroll-mt-20 border-t border-line">
          <div className="home-shell">
            <h2 className="home-h2">Примеры</h2>
            <div className="home-section-gap home-grid-2">
              {examples.map((example) => (
                <article key={example.href} className="home-card">
                  <h3 className="home-h3">{example.title}</h3>
                  <Link href={example.href} className="home-btn home-btn-ghost mt-6">
                    Открыть пример
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-t border-line">
          <div className="home-shell">
            <h2 className="home-h2">Всё необходимое для вашего заведения</h2>
            <ul className="home-section-gap home-grid-2">
              {essentials.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="home-card">
                    <div className="flex items-start gap-4">
                      <span className="home-icon">
                        <Icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="home-card-title">{item.title}</h3>
                        <p className="home-body mt-3">{item.text}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 border-t border-line">
          <div className="home-shell">
            <h2 className="home-h2">Как это работает</h2>
            <ol className="home-section-gap home-grid-3">
              {howItWorks.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.step} className="home-card flex flex-col">
                    <div className="flex items-center justify-between gap-3">
                      <span className="home-step">{item.step}</span>
                      <span className="home-icon">
                        <Icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
                      </span>
                    </div>
                    <h3 className="home-card-title mt-6">{item.title}</h3>
                    <p className="home-body mt-3">{item.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section id="why" className="scroll-mt-20 border-t border-line">
          <div className="home-shell">
            <h2 className="home-h2">Давайте спросим у ИИ, сколько стоит сделать подобный сайт</h2>

            <div className="home-section-gap grid gap-4 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-stretch lg:gap-4">
              <figure className="home-card mx-auto w-full max-w-[520px] overflow-hidden p-0 lg:mx-0 lg:max-w-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/home/ai-site-cost-dialog.png"
                  alt="Диалог с ИИ: создание сайта-витрины от 15 000 до 250 000 ₽, ежемесячная поддержка от 1 000 до 15 000 ₽"
                  className="block h-auto w-full max-w-full"
                  loading="lazy"
                  decoding="async"
                />
              </figure>

              <div className="flex min-h-0 flex-col gap-4 lg:h-full">
                <div className="home-card flex flex-1 flex-col">
                  <h3 className="home-h3">А после создания сайта придётся платить каждый месяц:</h3>
                  <ul className="mt-5 space-y-3 text-[15px] leading-6 text-foreground">
                    <li className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span>
                        Хостинг — <span className="font-semibold">500–1 000 ₽/мес.</span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span>
                        Изменение содержания сайта — ещё{" "}
                        <span className="font-semibold">500–1 000 ₽/мес.</span>
                      </span>
                    </li>
                  </ul>
                  <p className="home-body mt-5 lg:mt-auto lg:pt-6">
                    Изменения содержания включают добавление новых блюд, изменение цен, создание категорий, изменение
                    иконки приложения и другие правки информации и оформления сайта.
                  </p>
                </div>

                <div className="home-card-accent">
                  <p className="home-label text-accent">С NFCMENU всё проще</p>
                  <p className="home-h3 mt-3">
                    Сайт, личный кабинет и самостоятельное управление содержанием — за{" "}
                    <span className="text-accent">990 ₽/мес.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="tariffs" className="scroll-mt-20 border-t border-line">
          <div className="home-shell">
            <h2 className="home-h2">Тарифы</h2>
            <div className="home-section-gap home-grid-2 items-stretch">
              <article className="home-card flex flex-col">
                <h3 className="home-label">Ежемесячный</h3>
                <p className="home-price mt-6">990 ₽</p>
                <p className="home-body mt-3">в месяц</p>
                <ul className="mt-8 space-y-3.5 border-t border-line pt-8 text-[15px] leading-6">
                  {MONTH_PLAN_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={orderHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="home-cta home-btn mt-8"
                >
                  Подключить
                </a>
              </article>

              <article className="home-card-accent flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="home-label">На 6 месяцев</h3>
                  <p className="text-[12px] font-semibold tracking-[0.06em] text-accent uppercase">Выгодно</p>
                </div>
                <p className="home-price mt-6">5 490 ₽</p>
                <p className="home-body mt-3">за 6 месяцев</p>
                <ul className="mt-8 space-y-3.5 border-t border-line/80 pt-8 text-[15px] leading-6">
                  {MONTH_PLAN_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 rounded-2xl border border-accent/40 bg-background/60 px-4 py-4">
                  <p className="home-label text-accent">Бесплатная настройка сайта под ключ</p>
                  <ul className="mt-3 space-y-2.5 text-[15px] leading-6">
                    {SIX_MONTH_EXTRA_BENEFITS.map((benefit) => (
                      <li key={benefit} className="flex gap-3 font-medium">
                        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <a
                  href={orderHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="home-cta home-btn mt-8"
                >
                  Подключить
                </a>
              </article>
            </div>
          </div>
        </section>

        <section id="services" className="scroll-mt-20 border-t border-line">
          <div className="home-shell">
            <h2 className="home-h2">Дополнительные услуги</h2>
            <article className="home-card home-section-gap">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <h3 className="home-h3">Настройка сайта под ключ</h3>
                  <p className="home-body mt-3">
                    Создадим и оформим сайт вашего заведения, добавим необходимые материалы и подготовим его к
                    публикации.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-4 lg:items-end">
                  <p>
                    <span className="home-price block text-[2rem] sm:text-[2.25rem]">1 990 ₽</span>
                    <span className="home-body mt-2 block">разовая оплата</span>
                  </p>
                  <a
                    href={orderHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="home-cta home-btn w-full sm:w-auto"
                  >
                    Заказать настройку
                  </a>
                </div>
              </div>
            </article>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl px-5 py-8 text-sm text-muted sm:px-8">
          <p>NFCMENU</p>
        </div>
      </footer>
    </div>
  );
}
