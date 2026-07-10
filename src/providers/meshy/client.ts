import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";
import { useSettingsStore } from "@/stores/settings";

/**
 * Typed client for the Meshy 3d generation API. This is a utility seam for
 * the previz feature: nothing here runs through the task queue. Callers
 * create a task, hold the returned handle, and poll getTask until it settles.
 * Meshy's test key (msy_dummy_api_key_for_test_mode_12345678) returns canned
 * results, which makes the seam exercisable without spending credits.
 */

export const MESHY_BASE = "https://api.meshy.ai";

export const meshyCopy = {
  missingKey: "Add a Meshy key in settings to generate 3d previews.",
  networkFailed: (detail: string) => `Could not reach Meshy. ${detail}`,
  requestFailed: (status: number, detail: string) =>
    detail.length > 0
      ? `Meshy request failed (${status}). ${detail}`
      : `Meshy request failed (${status}).`,
  unreadableResponse: "Meshy returned a response that could not be read.",
  noTaskId: "Meshy did not return a task id.",
  noBalance: "Meshy did not return a balance.",
} as const;

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type MeshyTaskKind = "text-to-3d" | "image-to-3d";

/** Create calls return this handle; getTask needs it to pick the endpoint. */
export type MeshyTaskHandle = {
  kind: MeshyTaskKind;
  taskId: string;
};

export type MeshyTaskStatus =
  | "pending"
  | "in-progress"
  | "succeeded"
  | "failed"
  | "canceled";

export type MeshyTask = {
  id: string;
  status: MeshyTaskStatus;
  /** 0 to 1; Meshy reports percent and it is normalized here. */
  progress: number;
  modelUrls: {
    glb: string | null;
    fbx: string | null;
    obj: string | null;
    usdz: string | null;
  };
  thumbnailUrl: string | null;
  /** Populated when status is failed. */
  errorMessage: string | null;
};

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const readApiKey = (): string => useSettingsStore.getState().meshyApiKey.trim();

const readApiErrorDetail = (payload: unknown): string =>
  isRecord(payload) ? asString(payload["message"], "") : "";

const meshyRequest = async (
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Result<unknown>> => {
  const apiKey = readApiKey();
  if (apiKey.length === 0) {
    return err(appError("provider-not-configured", meshyCopy.missingKey));
  }

  let response: Response;
  try {
    response = await fetch(`${MESHY_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        meshyCopy.networkFailed(messageFromUnknown(cause)),
        cause,
      ),
    );
  }

  if (!response.ok) {
    let detail: string;
    try {
      detail = readApiErrorDetail(await response.json());
    } catch {
      detail = "";
    }
    return err(
      appError(
        "provider-request-failed",
        meshyCopy.requestFailed(response.status, detail),
      ),
    );
  }

  try {
    return ok((await response.json()) as unknown);
  } catch (cause) {
    return err(
      appError("provider-response-invalid", meshyCopy.unreadableResponse, cause),
    );
  }
};

/* ------------------------------------------------------------------ */
/* Response readers                                                    */
/* ------------------------------------------------------------------ */

const handleFromCreateResponse = (
  payload: unknown,
  kind: MeshyTaskKind,
): Result<MeshyTaskHandle> => {
  const taskId = isRecord(payload) ? asString(payload["result"], "") : "";
  if (taskId.length === 0) {
    return err(appError("provider-response-invalid", meshyCopy.noTaskId));
  }
  return ok({ kind, taskId });
};

const toStatus = (raw: string): MeshyTaskStatus => {
  switch (raw) {
    case "IN_PROGRESS":
      return "in-progress";
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "CANCELED":
      return "canceled";
    default:
      return "pending";
  }
};

const readModelUrl = (urls: unknown, key: string): string | null => {
  if (!isRecord(urls)) return null;
  const url = asString(urls[key], "");
  return url.length > 0 ? url : null;
};

const taskFromResponse = (payload: unknown): Result<MeshyTask> => {
  if (!isRecord(payload)) {
    return err(appError("provider-response-invalid", meshyCopy.unreadableResponse));
  }
  const progressPercent =
    typeof payload["progress"] === "number" ? payload["progress"] : 0;
  const taskError = payload["task_error"];
  const errorMessage = isRecord(taskError)
    ? asString(taskError["message"], "")
    : "";
  const modelUrls = payload["model_urls"];
  const thumbnail = asString(payload["thumbnail_url"], "");
  return ok({
    id: asString(payload["id"], ""),
    status: toStatus(asString(payload["status"], "")),
    progress: Math.min(1, Math.max(0, progressPercent / 100)),
    modelUrls: {
      glb: readModelUrl(modelUrls, "glb"),
      fbx: readModelUrl(modelUrls, "fbx"),
      obj: readModelUrl(modelUrls, "obj"),
      usdz: readModelUrl(modelUrls, "usdz"),
    },
    thumbnailUrl: thumbnail.length > 0 ? thumbnail : null,
    errorMessage: errorMessage.length > 0 ? errorMessage : null,
  });
};

/* ------------------------------------------------------------------ */
/* Client functions                                                    */
/* ------------------------------------------------------------------ */

/** Fast draft mesh from a prompt; refine the returned task for textures. */
export const createTextTo3dPreview = async (
  prompt: string,
): Promise<Result<MeshyTaskHandle>> => {
  const response = await meshyRequest("/openapi/v2/text-to-3d", {
    mode: "preview",
    prompt,
  });
  if (!response.ok) return response;
  return handleFromCreateResponse(response.value, "text-to-3d");
};

/** Textured pass over a succeeded preview task. */
export const createTextTo3dRefine = async (
  previewTaskId: string,
): Promise<Result<MeshyTaskHandle>> => {
  const response = await meshyRequest("/openapi/v2/text-to-3d", {
    mode: "refine",
    preview_task_id: previewTaskId,
  });
  if (!response.ok) return response;
  return handleFromCreateResponse(response.value, "text-to-3d");
};

/** Mesh from a single reference image (public URL or data URI). */
export const createImageTo3d = async (
  imageUrl: string,
): Promise<Result<MeshyTaskHandle>> => {
  const response = await meshyRequest("/openapi/v1/image-to-3d", {
    image_url: imageUrl,
  });
  if (!response.ok) return response;
  return handleFromCreateResponse(response.value, "image-to-3d");
};

/** Poll a task by the handle its create call returned. */
export const getTask = async (
  handle: MeshyTaskHandle,
): Promise<Result<MeshyTask>> => {
  const path =
    handle.kind === "text-to-3d"
      ? `/openapi/v2/text-to-3d/${encodeURIComponent(handle.taskId)}`
      : `/openapi/v1/image-to-3d/${encodeURIComponent(handle.taskId)}`;
  const response = await meshyRequest(path);
  if (!response.ok) return response;
  return taskFromResponse(response.value);
};

/** Remaining credits; also the cheapest way to verify a key. */
export const getBalance = async (signal?: AbortSignal): Promise<Result<number>> => {
  const response = await meshyRequest("/openapi/v1/balance", undefined, signal);
  if (!response.ok) return response;
  const payload = response.value;
  const balance = isRecord(payload) ? payload["balance"] : undefined;
  if (typeof balance !== "number") {
    return err(appError("provider-response-invalid", meshyCopy.noBalance));
  }
  return ok(balance);
};
