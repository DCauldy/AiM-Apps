import { describe, expect, it, vi } from "vitest";

import { openRouterApps } from "./apps";
import { createOpenRouterClient } from "./client";
import {
  OpenRouterAuthenticationError,
  OpenRouterRateLimitError,
} from "./errors";

describe("createOpenRouterClient", () => {
  it("sends attribution headers on chat requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] }), {
        status: 200,
      })
    );
    const client = createOpenRouterClient({
      apiKey: "openrouter-key",
      app: openRouterApps.tours,
      fetcher,
    });

    await client.chat.text({
      operation: "test.chat",
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Say hello." }],
    });

    const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(headers.get("Authorization")).toBe("Bearer openrouter-key");
    expect(headers.get("HTTP-Referer")).toBe("https://tours.aimarketingacademy.com");
    expect(headers.get("X-OpenRouter-Title")).toBe("AiM Tours");
    expect(headers.get("X-Title")).toBe("AiM Tours");
  });

  it("parses fenced JSON chat content", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "```json\n{\"ok\":true}\n```" } }],
          usage: { total_tokens: 5 },
        }),
        { status: 200 }
      )
    );
    const client = createOpenRouterClient({
      apiKey: "openrouter-key",
      app: openRouterApps.tours,
      fetcher,
    });

    await expect(
      client.chat.json<{ ok: boolean }>({
        operation: "test.json",
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Return JSON." }],
      })
    ).resolves.toMatchObject({
      value: { ok: true },
      usage: { total_tokens: 5 },
    });
  });

  it("maps OpenRouter http statuses to stable errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "No credits." } }), {
        status: 429,
      })
    );
    const client = createOpenRouterClient({
      apiKey: "openrouter-key",
      app: openRouterApps.tours,
      fetcher,
    });

    await expect(
      client.chat.text({
        operation: "test.rate_limit",
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Hello." }],
      })
    ).rejects.toBeInstanceOf(OpenRouterRateLimitError);
  });

  it("maps auth failures separately from other request failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Bad key." } }), {
        status: 401,
      })
    );
    const client = createOpenRouterClient({
      apiKey: "openrouter-key",
      app: openRouterApps.tours,
      fetcher,
    });

    await expect(
      client.request({
        operation: "test.auth",
        path: "/models",
      })
    ).rejects.toBeInstanceOf(OpenRouterAuthenticationError);
  });

  it("submits and polls video jobs with attribution headers", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "video-job-1", status: "queued" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "video-job-1",
            status: "completed",
            unsigned_urls: ["https://provider.example/video.mp4"],
          }),
          { status: 200 }
        )
      );
    const client = createOpenRouterClient({
      apiKey: "openrouter-key",
      app: openRouterApps.tours,
      fetcher,
    });

    const result = await client.video.render({
      operation: "test.video",
      pollIntervalMs: 0,
      maxPollAttempts: 1,
      body: {
        model: "kwaivgi/kling-v3.0-std",
        prompt: "move through the kitchen",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "9:16",
        generate_audio: false,
        frame_images: [
          {
            type: "image_url",
            image_url: { url: "https://signed.example/kitchen.jpg" },
            frame_type: "first_frame",
          },
        ],
      },
    });

    expect(result.outputUrls).toEqual(["https://provider.example/video.mp4"]);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/videos");
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://openrouter.ai/api/v1/videos/video-job-1");
    const submitHeaders = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    const pollHeaders = fetcher.mock.calls[1]?.[1]?.headers as Headers;
    expect(submitHeaders.get("X-OpenRouter-Title")).toBe("AiM Tours");
    expect(pollHeaders.get("X-OpenRouter-Title")).toBe("AiM Tours");
  });
});
