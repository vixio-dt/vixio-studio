import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";
import { elevenLabsGet } from "@/providers/elevenlabs/shared";
import { geminiRequest } from "@/providers/gemini/shared";
import { getBalance } from "@/providers/meshy/client";

import { settingsCopy } from "./copy";

/**
 * Key checks behind the Verify buttons. Each hits the cheapest authenticated
 * endpoint its provider offers and maps the outcome to Result, so the page
 * renders success or the provider's own error string inline. No generation
 * credits are spent by any of these calls. Every network call carries a
 * timeout so a dead connection lands an inline error instead of hanging.
 */

/** Verify calls are quick reachability checks; cap them well under a lost patience. */
const VERIFY_TIMEOUT_MS = 6_000;

/** Gemini: list models; any 2xx means the key is live. */
export const verifyGeminiKey = async (key: string): Promise<Result<null>> => {
  const response = await geminiRequest(
    "/models",
    key,
    undefined,
    AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  );
  if (!response.ok) return response;
  return ok(null);
};

/** ElevenLabs: list voices; any 2xx means the key is live. */
export const verifyElevenLabsKey = async (key: string): Promise<Result<null>> => {
  const response = await elevenLabsGet(
    "/v1/voices",
    key,
    AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  );
  if (!response.ok) return response;
  return ok(null);
};

/** Meshy: read the credit balance (the client reads the key from settings). */
export const verifyMeshyKey = async (): Promise<Result<null>> => {
  const balance = await getBalance(AbortSignal.timeout(VERIFY_TIMEOUT_MS));
  if (!balance.ok) return balance;
  return ok(null);
};

/**
 * fal has no free list endpoint, so probe the status of a request id that
 * cannot exist. Auth runs before request lookup: 401 and 403 mean the key was
 * rejected, while any other status (the expected 404 included) means fal
 * accepted the credentials.
 */
const FAL_PROBE_URL =
  "https://queue.fal.run/fal-ai/flux/dev/requests/00000000-0000-0000-0000-000000000000/status";

export const verifyFalKey = async (key: string): Promise<Result<null>> => {
  // fal keys are always key_id:key_secret; a colon-less value can never be
  // valid, so skip the network probe and land the inline error immediately.
  if (!key.includes(":")) {
    return err(
      appError("provider-request-failed", settingsCopy.verify.falInvalidFormat),
    );
  }
  let response: Response;
  try {
    response = await fetch(FAL_PROBE_URL, {
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        settingsCopy.verify.falNetwork(messageFromUnknown(cause)),
        cause,
      ),
    );
  }
  if (response.status === 401 || response.status === 403) {
    return err(
      appError(
        "provider-request-failed",
        settingsCopy.verify.falRejected(response.status),
      ),
    );
  }
  return ok(null);
};
