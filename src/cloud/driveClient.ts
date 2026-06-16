import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";

import {
  VIXIO_DRIVE_FOLDER,
  VIXIO_MANIFEST_NAME,
  type DriveClient,
  type ManifestAsset,
  type WorkspaceManifest,
} from "./types";

/**
 * The Google Drive transport. Talks to Drive REST API v3 with a bearer token
 * supplied per call (the auth layer owns the token and its refresh). Every
 * method returns Result and never throws across the boundary. No settings
 * access and no UI live here; folderId and token arrive as arguments.
 *
 * Request shapes follow the current Drive API v3 reference:
 *   files.list  GET  /drive/v3/files?q=...                 (find by name)
 *   files.create POST /drive/v3/files                       (create folder)
 *   multipart   POST /upload/drive/v3/files?uploadType=multipart
 *   media patch PATCH /upload/drive/v3/files/{id}?uploadType=media
 *   download    GET  /drive/v3/files/{id}?alt=media
 *   delete      DELETE /drive/v3/files/{id}
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MANIFEST_MIME = "application/json";

/**
 * Every user-visible string this client can surface. These land in inline
 * error states and sync rows, so they follow the copy charter: sentence case,
 * no em or en dashes, plain functional language. No prose lives inline below.
 */
const driveCopy = {
  networkFailed: (detail: string) => `Could not reach Google Drive (${detail})`,
  requestFailed: (status: number, detail: string) =>
    detail.length > 0
      ? `Drive request failed with status ${status} (${detail})`
      : `Drive request failed with status ${status}`,
  unreadableResponse: "Drive returned a response that could not be read",
  folderMissingId: "Drive created the folder but returned no id",
  uploadMissingId: "Drive accepted the upload but returned no file id",
  fileNotFound: "The Drive file no longer exists",
  manifestUnparseable: "The workspace manifest in Drive could not be parsed",
  manifestInvalid: "The workspace manifest in Drive is not in a readable shape",
} as const;

/* ------------------------------------------------------------------ */
/* Loose JSON readers                                                  */
/* ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Drive error bodies arrive as { error: { message, code } }. */
const readApiErrorDetail = (payload: unknown): string => {
  if (!isRecord(payload)) return "";
  const error = payload["error"];
  if (!isRecord(error)) return "";
  return asString(error["message"], "");
};

/** First file id from a files.list response, or null when the list is empty. */
const firstFileId = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const files = payload["files"];
  if (!Array.isArray(files)) return null;
  const first = files[0];
  if (!isRecord(first)) return null;
  const id = first["id"];
  return typeof id === "string" && id.length > 0 ? id : null;
};

/** The id field of a files.create or upload response, or null. */
const readFileId = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const id = payload["id"];
  return typeof id === "string" && id.length > 0 ? id : null;
};

/* ------------------------------------------------------------------ */
/* Query and error helpers                                             */
/* ------------------------------------------------------------------ */

/** Escape single quotes for inclusion inside a Drive q string literal. */
const escapeQueryValue = (value: string): string => value.replace(/'/g, "\\'");

const httpError = (status: number, detail: string) =>
  status === 404
    ? appError("not-found", driveCopy.fileNotFound)
    : appError("storage-failed", driveCopy.requestFailed(status, detail));

const networkError = (cause: unknown) =>
  appError(
    "storage-failed",
    driveCopy.networkFailed(messageFromUnknown(cause)),
    cause,
  );

/** Read an error body without ever throwing; returns "" when unreadable. */
const safeErrorDetail = async (response: Response): Promise<string> => {
  try {
    return readApiErrorDetail(await response.json());
  } catch {
    return "";
  }
};

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

/** Issue a request with bearer auth, mapping transport faults to Result. */
const driveFetch = async (
  url: string,
  token: string,
  init: RequestInit,
): Promise<Result<Response>> => {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    response = await fetch(url, { ...init, headers });
  } catch (cause) {
    return err(networkError(cause));
  }
  if (!response.ok) {
    return err(httpError(response.status, await safeErrorDetail(response)));
  }
  return ok(response);
};

/** A request whose successful body is JSON. */
const driveFetchJson = async (
  url: string,
  token: string,
  init: RequestInit,
): Promise<Result<unknown>> => {
  const result = await driveFetch(url, token, init);
  if (!result.ok) return result;
  try {
    return ok((await result.value.json()) as unknown);
  } catch (cause) {
    return err(
      appError("provider-response-invalid", driveCopy.unreadableResponse, cause),
    );
  }
};

/**
 * Build a multipart/related body (metadata part + media part) for an upload.
 * A random boundary that cannot collide with JSON or binary content is used.
 */
const buildMultipartBody = (
  metadata: Record<string, unknown>,
  media: Blob,
  mediaType: string,
): { body: Blob; contentType: string } => {
  const boundary = `vixio-${crypto.randomUUID()}`;
  const head =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mediaType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([head, media, tail], {
    type: `multipart/related; boundary=${boundary}`,
  });
  return { body, contentType: `multipart/related; boundary=${boundary}` };
};

/* ------------------------------------------------------------------ */
/* Manifest validation                                                 */
/* ------------------------------------------------------------------ */

const readManifestAsset = (value: unknown): ManifestAsset | null => {
  if (!isRecord(value)) return null;
  const id = value["id"];
  const projectId = value["projectId"];
  const kind = value["kind"];
  const driveFileId = value["driveFileId"];
  if (
    typeof id !== "string" ||
    typeof projectId !== "string" ||
    (kind !== "image" && kind !== "video") ||
    typeof driveFileId !== "string"
  ) {
    return null;
  }
  return {
    id,
    projectId,
    kind,
    width: asNumber(value["width"], 0),
    height: asNumber(value["height"], 0),
    duration:
      typeof value["duration"] === "number" ? value["duration"] : null,
    prompt: asString(value["prompt"], ""),
    model: asString(value["model"], ""),
    seed: asNumber(value["seed"], 0),
    createdAt: asString(value["createdAt"], ""),
    driveFileId,
  } as ManifestAsset;
};

/** Defensively narrow an arbitrary payload into a WorkspaceManifest. */
const readManifest = (payload: unknown): WorkspaceManifest | null => {
  if (!isRecord(payload)) return null;
  if (payload["version"] !== 1) return null;
  const rawAssets = payload["assets"];
  const assets: Record<string, ManifestAsset> = {};
  if (isRecord(rawAssets)) {
    for (const [key, entry] of Object.entries(rawAssets)) {
      const asset = readManifestAsset(entry);
      if (asset) assets[key] = asset;
    }
  }
  return {
    version: 1,
    updatedAt: asString(payload["updatedAt"], ""),
    projects: payload["projects"] ?? null,
    assets,
  };
};

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

const buildListUrl = (query: string): string => {
  const params = new URLSearchParams({
    q: query,
    spaces: "drive",
    fields: "files(id,name)",
    pageSize: "1",
  });
  return `${DRIVE_API}?${params.toString()}`;
};

/** Find the id of the named file in the folder, or null when absent. */
const findFileInFolder = async (
  token: string,
  folderId: string,
  name: string,
): Promise<Result<string | null>> => {
  const query =
    `name = '${escapeQueryValue(name)}'` +
    ` and '${escapeQueryValue(folderId)}' in parents` +
    " and trashed = false";
  const listed = await driveFetchJson(buildListUrl(query), token, {
    method: "GET",
  });
  if (!listed.ok) return listed;
  return ok(firstFileId(listed.value));
};

export const driveClient: DriveClient = {
  ensureFolder: async (token) => {
    const query =
      `name = '${escapeQueryValue(VIXIO_DRIVE_FOLDER)}'` +
      ` and mimeType = '${FOLDER_MIME}'` +
      " and trashed = false";
    const listed = await driveFetchJson(buildListUrl(query), token, {
      method: "GET",
    });
    if (!listed.ok) return listed;

    const existing = firstFileId(listed.value);
    if (existing) return ok(existing);

    const created = await driveFetchJson(`${DRIVE_API}?fields=id`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: VIXIO_DRIVE_FOLDER, mimeType: FOLDER_MIME }),
    });
    if (!created.ok) return created;

    const id = readFileId(created.value);
    if (!id) return err(appError("storage-failed", driveCopy.folderMissingId));
    return ok(id);
  },

  uploadAsset: async ({ token, folderId, blob, name, meta }) => {
    const appProperties: Record<string, string> = {
      vixioAssetId: meta.vixioAssetId,
      projectId: meta.projectId,
      kind: meta.kind,
    };
    const metadata = { name, parents: [folderId], appProperties };
    const mediaType = blob.type.length > 0 ? blob.type : "application/octet-stream";
    const { body, contentType } = buildMultipartBody(metadata, blob, mediaType);

    const created = await driveFetchJson(
      `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      },
    );
    if (!created.ok) return created;

    const fileId = readFileId(created.value);
    if (!fileId) return err(appError("storage-failed", driveCopy.uploadMissingId));
    return ok({ fileId });
  },

  downloadFile: async (token, fileId) => {
    const result = await driveFetch(
      `${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`,
      token,
      { method: "GET" },
    );
    if (!result.ok) return result;
    try {
      return ok(await result.value.blob());
    } catch (cause) {
      return err(
        appError("provider-response-invalid", driveCopy.unreadableResponse, cause),
      );
    }
  },

  deleteFile: async (token, fileId) => {
    const result = await driveFetch(
      `${DRIVE_API}/${encodeURIComponent(fileId)}`,
      token,
      { method: "DELETE" },
    );
    if (!result.ok) return result;
    return ok(undefined);
  },

  readManifest: async (token, folderId) => {
    const located = await findFileInFolder(token, folderId, VIXIO_MANIFEST_NAME);
    if (!located.ok) return located;
    if (located.value === null) return ok(null);

    const download = await driveFetch(
      `${DRIVE_API}/${encodeURIComponent(located.value)}?alt=media`,
      token,
      { method: "GET" },
    );
    if (!download.ok) return download;

    let text: string;
    try {
      text = await download.value.text();
    } catch (cause) {
      return err(
        appError("provider-response-invalid", driveCopy.unreadableResponse, cause),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (cause) {
      return err(
        appError("provider-response-invalid", driveCopy.manifestUnparseable, cause),
      );
    }

    const manifest = readManifest(parsed);
    if (!manifest) {
      return err(appError("provider-response-invalid", driveCopy.manifestInvalid));
    }
    return ok(manifest);
  },

  writeManifest: async ({ token, folderId, manifest }) => {
    const located = await findFileInFolder(token, folderId, VIXIO_MANIFEST_NAME);
    if (!located.ok) return located;

    const json = JSON.stringify(manifest);

    if (located.value !== null) {
      const updated = await driveFetch(
        `${DRIVE_UPLOAD}/${encodeURIComponent(located.value)}?uploadType=media`,
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": MANIFEST_MIME },
          body: json,
        },
      );
      if (!updated.ok) return updated;
      return ok(undefined);
    }

    const metadata = {
      name: VIXIO_MANIFEST_NAME,
      parents: [folderId],
      mimeType: MANIFEST_MIME,
    };
    const { body, contentType } = buildMultipartBody(
      metadata,
      new Blob([json], { type: MANIFEST_MIME }),
      MANIFEST_MIME,
    );
    const created = await driveFetch(
      `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      },
    );
    if (!created.ok) return created;
    return ok(undefined);
  },
};
