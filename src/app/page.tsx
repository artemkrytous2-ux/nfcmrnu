import type { Metadata } from "next";
import Link from "next/link";
import {
  Link2,
  ListOrdered,
  Percent,
  Printer,
  QrCode,
  Smartphone,
  ShoppingBag,
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

const features = [
  {
    title: "Меню и услуги",
    text: "Клиенты видят актуальные предложения, фотографии и цены.",
  },
  {
    title: "Заказы и заявки",
    text: "Клиенты могут оформить заказ или связаться с заведением.",
  },
  {
    title: "Управление без программиста",
    text: "Вы самостоятельно меняете меню, услуги, фотографии и информацию через личный кабинет.",
  },
  {
    title: "Своё приложение для заведения",
    text: "Задайте индивидуальное название, загрузите собственную иконку и управляйте оформлением приложения прямо из личного кабинета.",
  },
];

const examples = [
  { title: "Кафе и рестораны", href: restaurantExample },
  { title: "Салоны красоты", href: salonExample },
];

const whyChoose = [
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
            <Link
              href="/admin"
              className="inline-flex h-9 items-center justify-center rounded-full border border-line px-3 text-[13px] font-medium text-foreground sm:h-10 sm:px-4 sm:text-sm"
            >
              Войти
            </Link>
            <a
              href="#tariffs"
              className="home-cta inline-flex h-9 items-center justify-center rounded-full px-3 text-[13px] font-medium sm:h-10 sm:px-5 sm:text-sm"
            >
              Подключить
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
          <h1 className="max-w-3xl text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[36px]">
            Ваш бизнес — в удобном онлайн-формате
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-6 text-muted">
            Меню, услуги, цены и фотографии на одной странице. Клиенты оформляют заказы и заявки, а вы сами управляете
            содержимым сайта через личный кабинет.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/try"
              className="home-cta inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-medium"
            >
              Попробовать бесплатно
            </Link>
            <a
              href="#tariffs"
              className="inline-flex h-12 items-center justify-center rounded-full border border-line px-6 text-sm text-foreground transition-colors hover:border-accent"
            >
              Выбрать тариф
            </a>
          </div>
        </section>

        <section id="examples" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">Примеры</h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {examples.map((example) => (
                <article key={example.href} className="rounded-3xl border border-line bg-card px-6 py-6 sm:px-8">
                  <h3 className="text-[22px] leading-none font-extrabold tracking-[-0.03em]">{example.title}</h3>
                  <Link
                    href={example.href}
                    className="mt-6 inline-flex h-12 items-center justify-center rounded-full border border-line px-6 text-sm text-foreground transition-colors hover:border-accent"
                  >
                    Открыть пример
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">Возможности</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {features.map((feature) => (
                <li key={feature.title} className="rounded-3xl border border-line bg-card px-6 py-6">
                  <h3 className="text-[15px] font-extrabold tracking-[-0.03em]">{feature.title}</h3>
                  <p className="mt-3 text-[15px] leading-6 text-muted">{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="choose" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="max-w-3xl text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em] uppercase sm:text-[30px]">
              Почему заведения выбирают NFCMENU
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {whyChoose.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="rounded-3xl border border-line bg-card px-6 py-6 sm:px-7 sm:py-7">
                    <div className="flex items-start gap-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
                        <Icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[16px] leading-snug font-extrabold tracking-[-0.03em] sm:text-[17px]">
                          {item.title}
                        </h3>
                        <p className="mt-3 text-[15px] leading-6 text-muted">{item.text}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">Как это работает</h2>
            <ol className="mt-8 grid gap-4 lg:grid-cols-3">
              {howItWorks.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.step}
                    className="relative flex flex-col rounded-3xl border border-line bg-card px-6 py-7 sm:px-7"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-accent/40 bg-accent/10 px-3 text-[13px] font-semibold tracking-[0.06em] text-accent">
                        {item.step}
                      </span>
                      <span className="grid size-10 place-items-center rounded-2xl border border-line text-accent">
                        <Icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
                      </span>
                    </div>
                    <h3 className="mt-6 text-[17px] leading-snug font-extrabold tracking-[-0.03em]">{item.title}</h3>
                    <p className="mt-3 text-[15px] leading-6 text-muted">{item.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section id="why" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="max-w-3xl text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em] uppercase sm:text-[30px]">
              Давайте спросим у ИИ, сколько стоит сделать подобный сайт
            </h2>

            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-stretch lg:gap-8">
              <figure className="mx-auto w-full max-w-[520px] overflow-hidden rounded-3xl border border-line bg-card lg:mx-0 lg:max-w-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/home/ai-site-cost-dialog.png"
                  alt="Диалог с ИИ: создание сайта-витрины от 15 000 до 250 000 ₽, ежемесячная поддержка от 1 000 до 15 000 ₽"
                  className="block h-auto w-full max-w-full"
                  loading="lazy"
                  decoding="async"
                />
              </figure>

              <div className="flex min-h-0 flex-col gap-6 lg:h-full">
                <div className="flex flex-1 flex-col rounded-3xl border border-line bg-card px-5 py-6 sm:px-8 sm:py-8">
                  <h3 className="text-[18px] leading-snug font-extrabold tracking-[-0.03em] sm:text-[22px]">
                    А после создания сайта придётся платить каждый месяц:
                  </h3>
                  <ul className="mt-5 space-y-3 text-[15px] leading-6">
                    <li className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span>
                        Хостинг — <span className="font-semibold text-foreground">500–1 000 ₽/мес.</span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span>
                        Изменение содержания сайта — ещё{" "}
                        <span className="font-semibold text-foreground">500–1 000 ₽/мес.</span>
                      </span>
                    </li>
                  </ul>
                  <p className="mt-5 text-[14px] leading-6 text-muted lg:mt-auto lg:pt-6">
                    Изменения содержания включают добавление новых блюд, изменение цен, создание категорий, изменение
                    иконки приложения и другие правки информации и оформления сайта.
                  </p>
                </div>

                <div className="rounded-3xl border border-accent/40 bg-accent/10 px-5 py-6 sm:px-8 sm:py-8">
                  <p className="text-[13px] font-medium tracking-[0.12em] text-accent uppercase">
                    С NFCMENU всё проще
                  </p>
                  <p className="mt-3 text-[18px] leading-snug font-extrabold tracking-[-0.03em] sm:text-[22px]">
                    Сайт, личный кабинет и самостоятельное управление содержанием — за{" "}
                    <span className="text-accent">990 ₽/мес.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="tariffs" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">Тарифы</h2>
            <div className="mt-8 grid items-stretch gap-4 lg:grid-cols-2">
              <article className="flex flex-col rounded-3xl border border-line bg-card px-6 py-8 sm:px-8 sm:py-10">
                <h3 className="text-[13px] font-medium tracking-[0.08em] text-muted uppercase">Ежемесячный</h3>
                <p className="mt-6 text-[36px] leading-none font-extrabold tracking-[-0.04em] sm:text-[44px]">990 ₽</p>
                <p className="mt-3 text-sm text-muted">в месяц</p>
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
                  className="home-cta mt-8 inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-medium"
                >
                  Подключить
                </a>
              </article>

              <article className="flex flex-col rounded-3xl border border-accent/40 bg-accent/10 px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[13px] font-medium tracking-[0.08em] text-muted uppercase">На 6 месяцев</h3>
                  <p className="text-[12px] font-semibold tracking-[0.06em] text-accent uppercase">Выгодно</p>
                </div>
                <p className="mt-6 text-[36px] leading-none font-extrabold tracking-[-0.04em] sm:text-[44px]">
                  5 490 ₽
                </p>
                <p className="mt-3 text-sm text-muted">за 6 месяцев</p>
                <ul className="mt-8 space-y-3.5 border-t border-line/80 pt-8 text-[15px] leading-6">
                  {MONTH_PLAN_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 rounded-2xl border border-accent/40 bg-background/60 px-4 py-4">
                  <p className="text-[13px] font-semibold tracking-[0.06em] text-accent uppercase">
                    Бесплатная настройка сайта под ключ
                  </p>
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
                  className="home-cta mt-8 inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-medium"
                >
                  Подключить
                </a>
              </article>
            </div>
          </div>
        </section>

        <section id="services" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">
              Дополнительные услуги
            </h2>
            <article className="mt-8 rounded-3xl border border-line px-6 py-7 sm:px-8 sm:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <h3 className="text-[22px] leading-none font-extrabold tracking-[-0.03em]">
                    Настройка сайта под ключ
                  </h3>
                  <p className="mt-3 text-[15px] leading-6 text-muted">
                    Создадим и оформим сайт вашего заведения, добавим необходимые материалы и подготовим его к
                    публикации.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-4 lg:items-end">
                  <p>
                    <span className="block text-[32px] leading-none font-extrabold tracking-[-0.04em]">1 990 ₽</span>
                    <span className="mt-2 block text-sm text-muted">разовая оплата</span>
                  </p>
                  <a
                    href={orderHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="home-cta inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-sm font-medium sm:w-auto"
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
