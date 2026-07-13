import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

import { appError, err, messageFromUnknown, ok, type Result } from "@/lib/result";

const toMp4Copy = {
  failed: (detail: string) => `Could not convert the clip to mp4 (${detail})`,
  empty: "Converting the clip to mp4 produced no data",
};

/**
 * Re-encode a video blob into an mp4 container. Driving-video models accept
 * mp4 but not webm, and previz clips captured before the avc-first encoder
 * (or on browsers without an avc encoder) are webm. Uses mediabunny's
 * Conversion, which decodes and re-encodes through WebCodecs.
 */
export const transcodeToMp4 = async (blob: Blob): Promise<Result<Blob>> => {
  if (blob.type.includes("mp4")) return ok(blob);
  try {
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const conversion = await Conversion.init({ input, output });
    await conversion.execute();
    if (!target.buffer) {
      return err(appError("provider-request-failed", toMp4Copy.empty));
    }
    return ok(new Blob([target.buffer], { type: "video/mp4" }));
  } catch (cause) {
    return err(
      appError(
        "provider-request-failed",
        toMp4Copy.failed(messageFromUnknown(cause)),
        cause,
      ),
    );
  }
};
