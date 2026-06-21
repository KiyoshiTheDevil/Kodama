// -- Types --------------------------------------------------------------------

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: (errorCode: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  size?: "normal" | "compact" | "flexible" | "invisible";
  appearance?: "always" | "execute" | "interaction-only";
}

interface TurnstileApi {
  render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// -- Constants ----------------------------------------------------------------

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const LOG_PREFIX = "[Turnstile]";

// -- Module state -------------------------------------------------------------

let scriptPromise: Promise<void> | null = null;

// -- Functions ----------------------------------------------------------------

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const start = Date.now();
      const poll = () => {
        if (window.turnstile) return resolve();
        if (Date.now() - start > 5000)
          return reject(new Error(`${LOG_PREFIX} script loaded but window.turnstile never appeared`));
        setTimeout(poll, 50);
      };
      poll();
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error(`${LOG_PREFIX} failed to load Turnstile script`));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function runTurnstile(sitekey: string): Promise<string> {
  await loadScript();
  const api = window.turnstile;
  if (!api) throw new Error(`${LOG_PREFIX} window.turnstile is undefined after script load`);

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  document.body.appendChild(container);

  return new Promise<string>((resolve, reject) => {
    let widgetId: string | null = null;
    const cleanup = () => {
      if (widgetId !== null) {
        try {
          api.remove(widgetId);
        } catch (err) {
          console.warn(LOG_PREFIX, "widget remove failed", err);
        }
      }
      container.remove();
    };

    try {
      widgetId = api.render(container, {
        sitekey,
        callback: (token) => {
          cleanup();
          resolve(token);
        },
        "error-callback": (code) => {
          cleanup();
          reject(new Error(`${LOG_PREFIX} challenge error: ${code}`));
        },
        "timeout-callback": () => {
          cleanup();
          reject(new Error(`${LOG_PREFIX} challenge timed out`));
        },
        "expired-callback": () => {
          cleanup();
          reject(new Error(`${LOG_PREFIX} challenge expired before callback`));
        },
      });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

// -- Exports ------------------------------------------------------------------

export { runTurnstile };
