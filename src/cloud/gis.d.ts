/**
 * Minimal ambient declarations for the Google Identity Services token model.
 * Only the surface this app touches is typed: initTokenClient, the token
 * client it returns, and the response/override config shapes. The full GIS
 * client is loaded at runtime from accounts.google.com/gsi/client, so these
 * declarations describe a global that exists only after that script resolves.
 *
 * Shapes mirror the official reference; every TokenResponse field is optional
 * because the callback fires on both success and error.
 * https://developers.google.com/identity/oauth2/web/reference/js-reference
 */

/** Config for google.accounts.oauth2.initTokenClient. */
export interface GisTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GisTokenResponse) => void;
  error_callback?: (error: GisTokenError) => void;
  prompt?: string;
  include_granted_scopes?: boolean;
  login_hint?: string;
  hd?: string;
  state?: string;
}

/** Per-call overrides for TokenClient.requestAccessToken. */
export interface GisOverridableTokenClientConfig {
  scope?: string;
  prompt?: string;
  include_granted_scopes?: boolean;
  login_hint?: string;
  state?: string;
}

/**
 * Delivered to the callback on success; on failure the OAuth error fields are
 * populated and access_token is absent.
 */
export interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  hd?: string;
  prompt?: string;
  token_type?: string;
  scope?: string;
  state?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Delivered to error_callback for non-OAuth failures (popup closed before a
 * response, popup blocked, or an unknown initialization fault).
 */
export interface GisTokenError {
  type: string;
  message?: string;
}

export interface GisTokenClient {
  requestAccessToken: (overrideConfig?: GisOverridableTokenClientConfig) => void;
}

export interface GisOAuth2 {
  initTokenClient: (config: GisTokenClientConfig) => GisTokenClient;
}

export interface GisAccounts {
  oauth2: GisOAuth2;
}

export interface GisGoogle {
  accounts: GisAccounts;
}

declare global {
  interface Window {
    google?: GisGoogle;
  }
}
