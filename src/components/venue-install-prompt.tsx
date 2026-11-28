"use client";

import { useEffect, useRef, useState } from "react";

type InstallMode = "hidden" | "safari" | "in-app" | "android";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function VenueInstallPrompt({ slug, enabled }: { slug: string; enabled: boolean }) {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const promptEvent = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!enabled || isStandalone() || isInstalled(slug) || isSessionClosed(slug)) {
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

    // Android / desktop Chromium: wait for a real beforeinstallprompt before showing UI.
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptEvent.current = event as BeforeInstallPromptEvent;
      if (isStandalone() || isInstalled(slug) || isSessionClosed(slug)) {
        setMode("hidden");
        return;
      }
      setMode("android");
    };
    const onInstalled = () => {
      promptEvent.current = null;
      rememberInstalled(slug);
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
    rememberSessionClosed(slug);
    setMode("hidden");
  };

  const install = () => {
    const event = promptEvent.current;
    if (!event) {
      setMode("hidden");
      return;
    }

    // prompt() must run in the same user-gesture turn as the click.
    const prompted = event.prompt();

    void prompted
      .then(async () => {
        await event.userChoice;
        promptEvent.current = null;
        // accepted is not proof of install — wait for appinstalled / standalone.
        // dismissed: no permanent or session dismiss; a later BIP may show the sheet again.
        setMode("hidden");
      })
      .catch(() => {
        // prompt() failed. Do not write dismiss / installed flags.
        if (promptEvent.current === event) {
          setMode("android");
          return;
        }
        promptEvent.current = null;
        setMode("hidden");
      });
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
              onClick={install}
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

function sessionKey(slug: string) {
  return `nfcmenu-pwa-prompt-session:${slug}`;
}

function installedKey(slug: string) {
  return `nfcmenu-pwa-installed:${slug}`;
}

function isSessionClosed(slug: string) {
  try {
    return sessionStorage.getItem(sessionKey(slug)) === "1";
  } catch {
    return false;
  }
}

function rememberSessionClosed(slug: string) {
  try {
    sessionStorage.setItem(sessionKey(slug), "1");
  } catch {
    // Хранилище браузера может быть закрыто. Страница при этом продолжает работать.
  }
}

function isInstalled(slug: string) {
  try {
    return localStorage.getItem(installedKey(slug)) === "1";
  } catch {
    return false;
  }
}

function rememberInstalled(slug: string) {
  try {
    localStorage.setItem(installedKey(slug), "1");
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
