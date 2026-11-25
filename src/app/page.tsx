import type { Metadata } from "next";
import Link from "next/link";

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

const subscriptionBenefits = [
  "Персональный сайт",
  "Кабинет владельца",
  "Самостоятельное управление",
  "Индивидуальное оформление приложения",
];

const quarterBenefits = [...subscriptionBenefits];

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
            Меню, услуги, цены и фотографии на одной странице. Клиенты оформляют заказы и заявки, а вы сами управляете содержимым сайта через личный кабинет.
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

        <section id="why" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="max-w-3xl text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em] uppercase sm:text-[30px]">
              Давайте спросим у ИИ, сколько стоит сделать подобный сайт
            </h2>

            <figure className="mt-8 overflow-hidden rounded-3xl border border-line bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/home/ai-site-cost-dialog.png"
                alt="Диалог с ИИ: создание сайта-витрины от 15 000 до 250 000 ₽, ежемесячная поддержка от 1 000 до 15 000 ₽"
                className="block h-auto w-full max-w-full"
                loading="lazy"
                decoding="async"
              />
            </figure>

            <div className="mt-6 rounded-3xl border border-line bg-card px-5 py-6 sm:px-8 sm:py-8">
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
              <p className="mt-5 text-[14px] leading-6 text-muted">
                Изменения содержания включают добавление новых блюд, изменение цен, создание категорий, изменение
                иконки приложения и другие правки информации и оформления сайта.
              </p>
            </div>

            <div className="mt-6 rounded-3xl border border-accent/40 bg-accent/10 px-5 py-6 sm:px-8 sm:py-8">
              <p className="text-[13px] font-medium tracking-[0.12em] text-accent uppercase">С NFCMENU всё проще</p>
              <p className="mt-3 max-w-2xl text-[18px] leading-snug font-extrabold tracking-[-0.03em] sm:text-[22px]">
                Сайт, личный кабинет и самостоятельное управление содержанием — за{" "}
                <span className="text-accent">990 ₽/мес.</span>
              </p>
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
                  {subscriptionBenefits.map((benefit) => (
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
              <article className="flex flex-col rounded-3xl border border-white/15 bg-[#1c221f] px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[13px] font-medium tracking-[0.08em] text-muted uppercase">На 3 месяца</h3>
                  <p className="text-[12px] font-semibold tracking-[0.06em] text-accent uppercase">Рекомендуем</p>
                </div>
                <p className="mt-6 text-[36px] leading-none font-extrabold tracking-[-0.04em] sm:text-[44px]">2 970 ₽</p>
                <p className="mt-3 text-sm text-muted">за первые 3 месяца</p>
                <p className="mt-1 text-sm text-foreground">Далее 990 ₽ / месяц</p>
                <ul className="mt-8 space-y-3.5 border-t border-white/10 pt-8 text-[15px] leading-6">
                  {quarterBenefits.map((benefit) => (
                    <li key={benefit} className="flex gap-3">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                  <li className="flex gap-3 font-semibold">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>NFC-стикер для сбора отзывов на Яндекс Картах — в подарок</span>
                  </li>
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
            </div>
          </div>
        </section>

        <section id="services" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">Дополнительные услуги</h2>
            <article className="mt-8 rounded-3xl border border-line px-6 py-7 sm:px-8 sm:py-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-xl">
                  <h3 className="text-[22px] leading-none font-extrabold tracking-[-0.03em]">Настройка сайта под ключ</h3>
                  <p className="mt-3 text-[15px] leading-6 text-muted">
                    Создадим и оформим сайт вашего заведения, добавим необходимые материалы и подготовим его к публикации.
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
