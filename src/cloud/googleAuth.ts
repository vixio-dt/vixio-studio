import {
  appError,
  err,
  messageFromUnknown,
  ok,
  type Result,
} from "@/lib/result";

import type {
  GisGoogle,
  GisTokenClient,
  GisTokenError,
  GisTokenResponse,
} from "./gis.d";
import type { GoogleIdentity } from "./types";

/**
 * Google Identity Services token-model auth. Sign-in is a single GIS grant
 * that carries the drive.file scope, so the same access token opens both the
 * user's identity and their Drive. The OAuth client id is a runtime setting,
 * so this module takes it per call and never reads it from the environment.
 *
 * Everything here returns Result and never throws across the module boundary;
 * the GIS callbacks (which fire outside the promise chain) are funneled back
 * into the Result the caller is awaiting.
 */

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

const copy = {
  scriptFailed: "Could not load the Google sign-in script. Check your connection and try again.",
  gisUnavailable: "Google sign-in is not available yet. Reload the page and try again.",
  clientIdMissing: "Add your Google OAuth client id in settings before signing in.",
  popupClosed: "Sign-in window was closed before finishing. Try again.",
  popupBlocked: "The browser blocked the sign-in window. Allow popups for this site and try again.",
  accessDenied: "Google access was declined. Grant the requested permissions to continue.",
  noToken: "Google did not return an access token. Try signing in again.",
  silentFailed: "Could not refresh access silently. Sign in again to continue.",
  identityFailed: (status: number): string =>
    `Could not read your Google profile (status ${status}). Try signing in again.`,
  identityNetwork: (detail: string): string =>
    `Could not reach Google to read your profile (${detail}).`,
  identityUnreadable: "Google returned a profile we could not read.",
} as const;

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GIS_SCRIPT_ID = "vixio-gis-client";

export const GOOGLE_DRIVE_SCOPE =
  "openid email profile https://www.googleapis.com/auth/drive.file";

const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/** Refresh a little early so calls in flight never race the expiry. */
const EXPIRY_SKEW_SECONDS = 60;
const DEFAULT_LIFETIME_SECONDS = 3600;

/* ------------------------------------------------------------------ */
/* Loose JSON readers                                                  */
/* ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string =>
  typeof value === "string" ? value : "";

/* ------------------------------------------------------------------ */
/* Script loading                                                      */
/* ------------------------------------------------------------------ */

const getGoogle = (): GisGoogle | null => {
  const candidate = window.google;
  if (
    candidate &&
    typeof candidate.accounts?.oauth2?.initTokenClient === "function"
  ) {
    return candidate;
  }
  return null;
};

let loadPromise: Promise<Result<void>> | null = null;

/**
 * Inject the GIS client script once and resolve when oauth2 is callable.
 * Idempotent: concurrent and repeat calls share one in-flight promise, and a
 * failed load clears it so a later attempt can retry.
 */
export const loadGis = (): Promise<Result<void>> => {
  if (getGoogle()) return Promise.resolve(ok(undefined));
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<Result<void>>((resolve) => {
    const settle = (result: Result<void>): void => {
      if (!result.ok) loadPromise = null;
      resolve(result);
    };

    const onLoad = (): void => {
      if (getGoogle()) {
        settle(ok(undefined));
      } else {
        settle(err(appError("provider-request-failed", copy.gisUnavailable)));
      }
    };
    const onError = (): void => {
      settle(err(appError("provider-request-failed", copy.scriptFailed)));
    };

    const existing = document.getElementById(GIS_SCRIPT_ID);
    if (existing instanceof HTMLScriptElement) {
      if (getGoogle()) {
        settle(ok(undefined));
        return;
      }
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
};

/* ------------------------------------------------------------------ */
/* Token client                                                        */
/* ------------------------------------------------------------------ */

type CachedToken = { token: string; expiresAt: number };

let cachedToken: CachedToken | null = null;

/** One token client per client id; reused so GIS keeps its own session. */
let tokenClient: GisTokenClient | null = null;
let tokenClientId: string | null = null;

/**
 * Resolver bridge for the GIS callbacks. requestAccessToken takes no promise;
 * its callback (success or OAuth error) and error_callback (popup faults) fire
 * asynchronously, so we park the current resolver here and clear it once one
 * of them lands. Concurrent requests are serialized at the call sites that
 * matter, but a stray late callback is ignored because the resolver is null.
 */
let pendingResolve: ((result: Result<string>) => void) | null = null;

const resolvePending = (result: Result<string>): void => {
  const resolve = pendingResolve;
  pendingResolve = null;
  if (resolve) resolve(result);
};

const mapTokenError = (response: GisTokenResponse): Result<string> => {
  const code = readString(response.error);
  if (code === "access_denied") {
    return err(appError("provider-not-configured", copy.accessDenied));
  }
  const detail = readString(response.error_description).trim();
  return err(
    appError(
      "provider-request-failed",
      detail.length > 0 ? detail : copy.noToken,
    ),
  );
};

const mapClientError = (error: GisTokenError): Result<string> => {
  const type = readString(error.type);
  if (type === "popup_closed") {
    return err(appError("generation-cancelled", copy.popupClosed));
  }
  if (type === "popup_failed_to_open") {
    return err(appError("provider-request-failed", copy.popupBlocked));
  }
  const detail = readString(error.message).trim();
  return err(
    appError(
      "provider-request-failed",
      detail.length > 0 ? detail : copy.gisUnavailable,
    ),
  );
};

const ensureTokenClient = (
  google: GisGoogle,
  clientId: string,
): GisTokenClient => {
  if (tokenClient && tokenClientId === clientId) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_DRIVE_SCOPE,
    callback: (response) => {
      const token = readString(response.access_token).trim();
      if (response.error || token.length === 0) {
        resolvePending(mapTokenError(response));
        return;
      }
      const lifetime =
        typeof response.expires_in === "number" && response.expires_in > 0
          ? response.expires_in
          : DEFAULT_LIFETIME_SECONDS;
      cachedToken = {
        token,
        expiresAt: Date.now() + (lifetime - EXPIRY_SKEW_SECONDS) * 1000,
      };
      resolvePending(ok(token));
    },
    error_callback: (error) => {
      resolvePending(mapClientError(error));
    },
  });
  tokenClientId = clientId;
  return tokenClient;
};

/**
 * Request an access token. The first interactive sign-in uses prompt:'consent'
 * so the user sees the scope grant; opts.silent uses prompt:'' to refresh in
 * the background without UI. Resolves with the access_token from the GIS
 * callback, or a readable AppError if the user declines or the popup fails.
 */
export const requestAccessToken = (
  clientId: string,
  opts?: { silent?: boolean },
): Promise<Result<string>> => {
  const trimmedId = clientId.trim();
  if (trimmedId.length === 0) {
    return Promise.resolve(
      err(appError("provider-not-configured", copy.clientIdMissing)),
    );
  }

  const google = getGoogle();
  if (!google) {
    return Promise.resolve(
      err(appError("provider-request-failed", copy.gisUnavailable)),
    );
  }

  // A request already in flight must settle before another can start, or its
  // callback would resolve the wrong promise.
  if (pendingResolve) {
    return Promise.resolve(
      err(appError("provider-request-failed", copy.silentFailed)),
    );
  }

  let client: GisTokenClient;
  try {
    client = ensureTokenClient(google, trimmedId);
  } catch (cause) {
    return Promise.resolve(
      err(
        appError(
          "provider-request-failed",
          copy.gisUnavailable,
          cause,
        ),
      ),
    );
  }

  return new Promise<Result<string>>((resolve) => {
    pendingResolve = resolve;
    try {
      client.requestAccessToken({
        prompt: opts?.silent === true ? "" : "consent",
      });
    } catch (cause) {
      resolvePending(
        err(
          appError(
            "provider-request-failed",
            copy.silentFailed,
            cause,
          ),
        ),
      );
    }
  });
};

/* ------------------------------------------------------------------ */
/* Token cache                                                         */
/* ------------------------------------------------------------------ */

/** The cached token if it is still comfortably valid, else null. */
export const getCachedToken = (): string | null => {
  if (!cachedToken) return null;
  if (Date.now() >= cachedToken.expiresAt) {
    cachedToken = null;
    return null;
  }
  return cachedToken.token;
};

/** Drop the in-memory token and client, e.g. on sign-out. */
export const clearCachedToken = (): void => {
  cachedToken = null;
  tokenClient = null;
  tokenClientId = null;
};

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

const readIdentity = (payload: unknown): GoogleIdentity => {
  if (!isRecord(payload)) {
    return { email: "", name: "", picture: "" };
  }
  return {
    email: readString(payload["email"]),
    name: readString(payload["name"]),
    picture: readString(payload["picture"]),
  };
};

/**
 * Read the signed-in user's profile from the OpenID userinfo endpoint. Fields
 * are read defensively because the user or their organization may withhold
 * any of them.
 */
export const fetchIdentity = async (
  token: string,
): Promise<Result<GoogleIdentity>> => {
  let response: Response;
  try {
    response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        copy.identityNetwork(messageFromUnknown(cause)),
        cause,
      ),
    );
  }

  if (!response.ok) {
    return err(
      appError("provider-request-failed", copy.identityFailed(response.status)),
    );
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch (cause) {
    return err(
      appError("provider-response-invalid", copy.identityUnreadable, cause),
    );
  }

  return ok(readIdentity(payload));
};
