"use client";

import { useEffect, useRef, useState } from "react";

const dismissPeriodMs = 7 * 24 * 60 * 60 * 1000;

type InstallMode = "hidden" | "safari" | "in-app" | "android";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function VenueInstallPrompt({ slug, enabled }: { slug: string; enabled: boolean }) {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const promptEvent = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!enabled || isStandalone() || dismissedRecently(slug)) {
      setMode("hidden");
      return;
    }

    const agent = navigator.userAgent;
    if (isTelegramOrInstagram(agent)) {
      setMode("in-app");
      return;
    }
    if (isIosSafari(agent)) {
      setMode("safari");
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptEvent.current = event as BeforeInstallPromptEvent;
      setMode("android");
    };
    const onInstalled = () => {
      promptEvent.current = null;
      rememberDismiss(slug);
      setMode("hidden");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [enabled, slug]);

  if (!enabled || mode === "hidden") return null;

  const close = () => {
    rememberDismiss(slug);
    setMode("hidden");
  };

  const install = async () => {
    const event = promptEvent.current;
    promptEvent.current = null;
    if (!event) {
      setMode("hidden");
      return;
    }
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // Браузер отклонил повторный вызов. Предложение просто закрывается.
    }
    rememberDismiss(slug);
    setMode("hidden");
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-4 pt-4">
      <section className="rounded-2xl border border-line bg-card px-4 py-4">
        {mode === "android" ? (
          <p className="text-sm leading-6 text-foreground">Установите приложение этого заведения на экран телефона.</p>
        ) : null}
        {mode === "safari" ? (
          <p className="text-sm leading-6 text-foreground">
            Установите приложение: нажмите «Поделиться», затем «На экран Домой».
          </p>
        ) : null}
        {mode === "in-app" ? (
          <p className="text-sm leading-6 text-foreground">Откройте эту страницу в Safari, чтобы установить приложение.</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {mode === "android" ? (
            <button
              type="button"
              onClick={() => void install()}
              className="h-11 rounded-full bg-accent px-4 text-sm font-medium text-[#062117]"
            >
              Установить
            </button>
          ) : null}
          <button type="button" onClick={close} className="h-11 rounded-full border border-line px-4 text-sm">
            Закрыть
          </button>
        </div>
      </section>
    </div>
  );
}

function dismissKey(slug: string) {
  return `nfcmenu-pwa-prompt:${slug}`;
}

function dismissedRecently(slug: string) {
  try {
    const stored = Number(localStorage.getItem(dismissKey(slug)));
    return Number.isFinite(stored) && Date.now() - stored < dismissPeriodMs;
  } catch {
    return false;
  }
}

function rememberDismiss(slug: string) {
  try {
    localStorage.setItem(dismissKey(slug), String(Date.now()));
  } catch {
    // Хранилище браузера может быть закрыто. Страница при этом продолжает работать.
  }
}

function isStandalone() {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return "standalone" in navigator && navigator.standalone === true;
}

function isIos(agent: string) {
  return /iPhone|iPad|iPod/i.test(agent);
}

function isTelegramOrInstagram(agent: string) {
  return /Telegram|Instagram/i.test(agent);
}

function isIosSafari(agent: string) {
  if (!isIos(agent) || isTelegramOrInstagram(agent)) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(agent)) return false;
  return /Safari/i.test(agent);
}
