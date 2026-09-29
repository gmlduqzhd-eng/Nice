export const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" && Boolean(googleClientId);

type GoogleCredential = { credential?: string };

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredential) => void;
    nonce: string;
    auto_select: false;
    button_auto_select: false;
    use_fedcm_for_button: true;
    ux_mode: "popup";
  }) => void;
  renderButton: (parent: HTMLElement, options: {
    type: "standard";
    theme: "filled_blue";
    size: "large";
    text: "continue_with";
    shape: "rectangular";
    locale: "ko";
    width: string;
  }) => void;
};

function identityApi(): GoogleIdentity | null {
  const api = (window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id;
  return api && typeof api.initialize === "function" && typeof api.renderButton === "function" ? api : null;
}

let sdkPromise: Promise<GoogleIdentity> | null = null;

// Called only by the open Google login panel. Failed loads can be retried.
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const ready = identityApi();
  if (ready) return Promise.resolve(ready);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client?hl=ko";
    script.async = true;
    script.defer = true;
    script.dataset.damimGoogleIdentity = "true";
    const cleanup = () => {
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
    };
    const fail = () => {
      cleanup();
      script.remove();
      reject(new Error("Google sign-in unavailable"));
    };
    const timeout = window.setTimeout(fail, 15_000);
    script.onload = () => {
      const api = identityApi();
      if (!api) { fail(); return; }
      cleanup();
      resolve(api);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

export async function createGoogleNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}
