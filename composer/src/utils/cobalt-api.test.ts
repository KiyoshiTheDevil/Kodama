import { describe, expect, it } from "vitest";
import {
  CobaltApiError,
  formatCobaltErrorForToast,
  mapError,
  parseStandardCobaltResponse,
  stripFilenameExtension,
} from "@/utils/cobalt-api";

describe("mapError - known codes", () => {
  it("maps turnstile_failed to a user-readable message", () => {
    expect(mapError("turnstile_failed")).toBe("Verification failed, refresh and try again");
  });

  it("maps rate_limited to a user-readable message", () => {
    expect(mapError("rate_limited")).toBe("Too many requests, wait a minute and try again");
  });

  it("maps geo_blocked to a regional message", () => {
    expect(mapError("geo_blocked")).toBe("This video isn't available in this region");
  });

  it("maps invalid_video_id to a validation message", () => {
    expect(mapError("invalid_video_id")).toBe("That doesn't look like a valid YouTube video");
  });

  it("maps jwt_expired to a session message", () => {
    expect(mapError("jwt_expired")).toBe("Session expired, refresh and try again");
  });
});

describe("mapError - unknown codes", () => {
  it("falls back to the generic unknown message", () => {
    expect(mapError("totally_made_up_code")).toBe("Something went wrong, try again");
  });

  it("falls back for empty string", () => {
    expect(mapError("")).toBe("Something went wrong, try again");
  });
});

describe("CobaltApiError", () => {
  it("constructs with code, status, and a mapped message", () => {
    const err = new CobaltApiError("rate_limited", 429);
    expect(err.code).toBe("rate_limited");
    expect(err.status).toBe(429);
    expect(err.message).toBe("Too many requests, wait a minute and try again");
    expect(err.name).toBe("CobaltApiError");
  });

  it("constructs with unknown code and falls back gracefully", () => {
    const err = new CobaltApiError("strange_code", 500);
    expect(err.code).toBe("strange_code");
    expect(err.status).toBe(500);
    expect(err.message).toBe("Something went wrong, try again");
  });

  it("is throwable and catchable as Error", () => {
    expect(() => {
      throw new CobaltApiError("turnstile_failed", 403);
    }).toThrow(CobaltApiError);

    try {
      throw new CobaltApiError("turnstile_failed", 403);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(CobaltApiError);
    }
  });
});

describe("stripFilenameExtension", () => {
  it("strips a single trailing extension", () => {
    expect(stripFilenameExtension("Rick Astley - Never Gonna Give You Up.m4a")).toBe(
      "Rick Astley - Never Gonna Give You Up",
    );
  });

  it("strips uppercase extensions", () => {
    expect(stripFilenameExtension("song.MP3")).toBe("song");
  });

  it("leaves a name without an extension untouched", () => {
    expect(stripFilenameExtension("Rick Astley - Never Gonna Give You Up")).toBe(
      "Rick Astley - Never Gonna Give You Up",
    );
  });

  it("only strips the last extension on multi-dot names", () => {
    expect(stripFilenameExtension("artist - song (4K Remaster).mp4")).toBe("artist - song (4K Remaster)");
  });

  it("returns empty string for empty input", () => {
    expect(stripFilenameExtension("")).toBe("");
  });

  it("does not treat a hidden-file dot as an extension", () => {
    expect(stripFilenameExtension(".gitignore")).toBe(".gitignore");
  });
});

describe("parseStandardCobaltResponse", () => {
  it("returns tunnelUrl and filename for a tunnel response", () => {
    const result = parseStandardCobaltResponse({
      status: "tunnel",
      url: "https://example.com/tunnel?id=abc",
      filename: "Rick Astley - Never Gonna Give You Up.m4a",
    });
    expect(result.tunnelUrl).toBe("https://example.com/tunnel?id=abc");
    expect(result.filename).toBe("Rick Astley - Never Gonna Give You Up");
  });

  it("returns tunnelUrl and filename for a redirect response", () => {
    const result = parseStandardCobaltResponse({
      status: "redirect",
      url: "https://cdn.example.com/audio.opus",
      filename: "song.opus",
    });
    expect(result.tunnelUrl).toBe("https://cdn.example.com/audio.opus");
    expect(result.filename).toBe("song");
  });

  it("returns undefined filename when not provided", () => {
    const result = parseStandardCobaltResponse({
      status: "tunnel",
      url: "https://example.com/tunnel?id=abc",
    });
    expect(result.filename).toBeUndefined();
  });

  it("throws CobaltApiError with the cobalt error code on error status", () => {
    expect(() =>
      parseStandardCobaltResponse({
        status: "error",
        error: { code: "error.api.link.invalid" },
      }),
    ).toThrow(CobaltApiError);

    try {
      parseStandardCobaltResponse({
        status: "error",
        error: { code: "error.api.content.video.unavailable" },
      });
    } catch (e) {
      expect(e).toBeInstanceOf(CobaltApiError);
      expect((e as CobaltApiError).code).toBe("video_unavailable");
    }
  });

  it("throws on picker response (single-file expected)", () => {
    expect(() =>
      parseStandardCobaltResponse({
        status: "picker",
        picker: [{ type: "photo", url: "https://example.com/x.jpg" }],
      }),
    ).toThrow(CobaltApiError);
  });

  it("throws on missing url for tunnel/redirect", () => {
    expect(() => parseStandardCobaltResponse({ status: "tunnel" })).toThrow(CobaltApiError);
  });

  it("throws on unrecognised status", () => {
    expect(() => parseStandardCobaltResponse({ status: "weird" })).toThrow(CobaltApiError);
  });

  it("throws on non-object input", () => {
    expect(() => parseStandardCobaltResponse(null)).toThrow(CobaltApiError);
    expect(() => parseStandardCobaltResponse("nope")).toThrow(CobaltApiError);
  });

  it("maps auth-required cobalt errors to auth_required", () => {
    try {
      parseStandardCobaltResponse({ status: "error", error: { code: "error.api.auth.jwt.missing" } });
    } catch (e) {
      expect((e as CobaltApiError).code).toBe("auth_required");
    }
    try {
      parseStandardCobaltResponse({ status: "error", error: { code: "error.api.auth.key.invalid" } });
    } catch (e) {
      expect((e as CobaltApiError).code).toBe("auth_required");
    }
  });
});

describe("formatCobaltErrorForToast", () => {
  const defaultCtx = { isDefault: true, instanceLabel: "Composer" };
  const customCtx = { isDefault: false, instanceLabel: "Woof Monster" };

  it("returns a generic message for non-CobaltApiError throwables", () => {
    expect(formatCobaltErrorForToast(new Error("boom"), defaultCtx)).toBe("Couldn't load YouTube audio.");
    expect(formatCobaltErrorForToast("nope", defaultCtx)).toBe("Couldn't load YouTube audio.");
  });

  it("blames the active custom instance by name on empty_audio and suggests switching", () => {
    const msg = formatCobaltErrorForToast(new CobaltApiError("empty_audio", 200), customCtx);
    expect(msg).toContain("Woof Monster");
    expect(msg.toLowerCase()).toContain("different cobalt instance");
  });

  it("does not suggest switching for empty_audio on default", () => {
    const msg = formatCobaltErrorForToast(new CobaltApiError("empty_audio", 200), defaultCtx);
    expect(msg.toLowerCase()).not.toContain("different cobalt instance");
    expect(msg.toLowerCase()).toContain("try again");
  });

  it("calls out the custom instance for bad_response", () => {
    const msg = formatCobaltErrorForToast(new CobaltApiError("bad_response", 200), customCtx);
    expect(msg).toContain("Woof Monster");
    expect(msg.toLowerCase()).toContain("different cobalt instance");
  });

  it("explains bot_detection differently for default vs custom", () => {
    const onDefault = formatCobaltErrorForToast(new CobaltApiError("bot_detection", 0), defaultCtx);
    const onCustom = formatCobaltErrorForToast(new CobaltApiError("bot_detection", 0), customCtx);
    expect(onDefault.toLowerCase()).toContain("youtube");
    expect(onCustom).toContain("Woof Monster");
    expect(onCustom.toLowerCase()).toContain("different cobalt instance");
  });

  it("explains rate_limited as instance-side on custom", () => {
    const onCustom = formatCobaltErrorForToast(new CobaltApiError("rate_limited", 429), customCtx);
    expect(onCustom).toContain("Woof Monster");
  });

  it("treats video-content errors as content issues regardless of instance", () => {
    const onCustom = formatCobaltErrorForToast(new CobaltApiError("video_unavailable", 0), customCtx);
    expect(onCustom.toLowerCase()).not.toContain("different cobalt instance");
    expect(onCustom.toLowerCase()).toMatch(/private|removed|restricted/);
  });

  it("explains auth_required on custom by suggesting another instance", () => {
    const msg = formatCobaltErrorForToast(new CobaltApiError("auth_required", 401), customCtx);
    expect(msg).toContain("Woof Monster");
    expect(msg.toLowerCase()).toContain("different cobalt instance");
  });

  it("falls back to err.message for unmapped codes", () => {
    const err = new CobaltApiError("totally_made_up", 0);
    expect(formatCobaltErrorForToast(err, defaultCtx)).toBe(err.message);
  });
});
