import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "NFCMENU",
  description:
    "Меню, услуги, цены и фотографии на одной странице. Клиенты оформляют заказы и заявки, а вы сами управляете содержимым сайта через личный кабинет.",
};

const restaurantExample = "/m/nfcmenu-demo";
const salonExample = "/m/salonkrasotidemo";

const nav = [
  { href: "#top", label: "Главная" },
  { href: "#examples", label: "Примеры" },
  { href: "#features", label: "Возможности" },
  { href: "#tariffs", label: "Тарифы" },
];

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
];

const examples = [
  { title: "Кафе и рестораны", href: restaurantExample },
  { title: "Салоны красоты", href: salonExample },
];

export default function Home() {
  return (
    <div id="top" className="home flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3 sm:px-8 lg:h-16 lg:flex-nowrap lg:py-0">
          <Link href="/" className="shrink-0 text-[15px] font-extrabold tracking-[0.04em] text-accent uppercase">
            NFCMENU
          </Link>
          <nav className="order-3 flex w-full flex-wrap items-center gap-1 text-sm lg:order-none lg:w-auto lg:flex-nowrap">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 text-muted transition-colors hover:text-accent"
              >
                {item.label}
              </a>
            ))}
          </nav>
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
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#examples"
              className="home-cta inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-medium"
            >
              Посмотреть примеры
            </a>
            <a
              href="#tariffs"
              className="inline-flex h-12 items-center justify-center rounded-full border border-line px-6 text-sm text-foreground transition-colors hover:border-accent"
            >
              Выбрать тариф
            </a>
          </div>
        </section>

        <section id="examples" className="scroll-mt-24 border-t border-line">
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

        <section id="features" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">Возможности</h2>
            <ul className="mt-6 grid gap-4 lg:grid-cols-3">
              {features.map((feature) => (
                <li key={feature.title} className="rounded-3xl border border-line bg-card px-6 py-6">
                  <h3 className="text-[15px] font-extrabold tracking-[-0.03em]">{feature.title}</h3>
                  <p className="mt-3 text-[15px] leading-6 text-muted">{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="tariffs" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
            <h2 className="text-[26px] leading-none font-extrabold tracking-[-0.03em] uppercase">Тарифы</h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <article className="rounded-3xl border border-line bg-card px-6 py-8 sm:px-8">
                <h3 className="text-[22px] leading-none font-extrabold tracking-[-0.03em]">Ежемесячный</h3>
                <p className="mt-4 text-[15px] font-semibold leading-6">990 ₽ / месяц</p>
                <ul className="mt-6 space-y-3 text-[15px] leading-6 text-muted">
                  <li>Персональный сайт.</li>
                  <li>Кабинет владельца.</li>
                  <li>Самостоятельное управление.</li>
                  <li>Настройка сайта в подарок.</li>
                </ul>
              </article>
              <article className="rounded-3xl border border-accent bg-card px-6 py-8 sm:px-8">
                <p className="text-[13px] font-extrabold tracking-[0.04em] text-accent uppercase">Рекомендуем</p>
                <h3 className="mt-3 text-[22px] leading-none font-extrabold tracking-[-0.03em]">На 3 месяца</h3>
                <p className="mt-4 text-[15px] font-semibold leading-6">2 970 ₽ за первые 3 месяца.</p>
                <ul className="mt-6 space-y-3 text-[15px] leading-6 text-muted">
                  <li>Персональный сайт.</li>
                  <li>Кабинет владельца.</li>
                  <li>Самостоятельное управление.</li>
                  <li>Настройка сайта в подарок.</li>
                  <li>Фирменный NFC-стикер в подарок. Его не выдают сразу при подключении.</li>
                </ul>
                <p className="mt-6 text-[15px] leading-6 text-foreground">После трёх месяцев — 990 ₽ / месяц.</p>
              </article>
            </div>
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
