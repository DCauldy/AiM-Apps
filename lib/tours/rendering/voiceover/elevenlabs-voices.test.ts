import { describe, expect, it, vi } from "vitest";
import { listElevenLabsDigitalTwinVoices } from "./elevenlabs-voices";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("listElevenLabsDigitalTwinVoices", () => {
  it("loads personal cloned and professional voices with sanitized metadata", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          voices: [
            {
              voice_id: "voice-cloned",
              name: "Cloned Voice",
              category: "cloned",
              description: "Instant clone",
              preview_url: "https://example.test/cloned.mp3",
              labels: { accent: "American", unsafe: 123 },
            },
            {
              voice_id: "premade-voice",
              name: "Premade Voice",
              category: "premade",
            },
          ],
          has_more: false,
          next_page_token: null,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          voices: [
            {
              voice_id: "voice-professional",
              name: "Professional Voice",
              category: "professional",
              preview_url: null,
              fine_tuning: { state: { eleven_multilingual_v2: "fine_tuned" } },
              labels: { gender: "female" },
            },
          ],
          has_more: false,
          next_page_token: null,
        })
      );

    const voices = await listElevenLabsDigitalTwinVoices({
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
    });

    expect(voices).toEqual([
      {
        id: "voice-cloned",
        name: "Cloned Voice",
        category: "cloned",
        description: "Instant clone",
        previewUrl: "https://example.test/cloned.mp3",
        labels: { accent: "American" },
        fineTuningState: null,
      },
      {
        id: "voice-professional",
        name: "Professional Voice",
        category: "professional",
        description: null,
        previewUrl: null,
        labels: { gender: "female" },
        fineTuningState: "fine_tuned",
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toContain("category=cloned");
    expect(String(fetch.mock.calls[0][0])).toContain("voice_type=personal");
    expect(String(fetch.mock.calls[1][0])).toContain("category=professional");
  });

  it("paginates and dedupes voices across categories", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          voices: [{ voice_id: "voice-1", name: "Voice One", category: "cloned" }],
          has_more: true,
          next_page_token: "page-2",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          voices: [{ voice_id: "voice-2", name: "Voice Two", category: "cloned" }],
          has_more: false,
          next_page_token: null,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          voices: [{ voice_id: "voice-1", name: "Voice One", category: "professional" }],
          has_more: false,
          next_page_token: null,
        })
      );

    const voices = await listElevenLabsDigitalTwinVoices({
      apiKey: "key",
      fetch: fetch as typeof globalThis.fetch,
    });

    expect(voices.map((voice) => voice.id)).toEqual(["voice-1", "voice-2"]);
    expect(String(fetch.mock.calls[1][0])).toContain("next_page_token=page-2");
  });
});
