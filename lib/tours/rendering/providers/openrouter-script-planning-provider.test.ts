import { describe, expect, it, vi } from "vitest";

import { createOpenRouterScriptPlanningProvider } from "./openrouter-script-planning-provider";

describe("createOpenRouterScriptPlanningProvider", () => {
  it("sends auto camera motion instructions and normalizes the selected motion", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fullScript: "Welcome to the foyer.",
                  sceneTimings: [
                    {
                      sceneId: "scene-1",
                      spokenText: "Welcome to the foyer.",
                      selectedCameraMotion: "vertical_rise",
                      selectedTransitionEffect: "iris",
                      durationSeconds: 5,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    const provider = createOpenRouterScriptPlanningProvider({
      apiKey: "openrouter-key",
      fetcher,
    });

    const result = await provider.planScript({
      project: {
        id: "project-1",
        userId: "user-1",
        name: "My New Listing",
        propertyAddress: "123 Main St",
        listingUrl: null,
        tourType: "tour_video",
      },
      scenes: [
        {
          id: "scene-1",
          title: "Foyer",
          sortOrder: 0,
          cameraMotion: "auto",
          transitionEffect: "auto",
          imageUrl: "https://signed.example/foyer.jpg",
          proofedFacts: [],
        },
      ],
      modelId: "google/gemini-2.5-flash",
      promptVersion: "test-prompt",
      timing: {
        fallbackDurationSeconds: 5,
        minDurationSeconds: 3,
        maxDurationSeconds: 8,
      },
    });

    const requestBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const userContent = requestBody.messages[1].content;
    expect(JSON.stringify(userContent)).toContain("cameraMotion: auto");
    expect(JSON.stringify(userContent)).toContain("selectedCameraMotion");
    expect(JSON.stringify(userContent)).toContain("transitionEffect: auto");
    expect(JSON.stringify(userContent)).toContain("selectedTransitionEffect");
    expect(JSON.stringify(userContent)).toContain("Use case:");
    expect(JSON.stringify(userContent)).toContain("inspect its image");
    expect(JSON.stringify(userContent)).toContain("vertical_rise");
    expect(userContent).toContainEqual({
      type: "image_url",
      image_url: { url: "https://signed.example/foyer.jpg" },
    });
    const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("X-OpenRouter-Title")).toBe("AiM Tours");
    expect(headers.get("X-Title")).toBe("AiM Tours");
    expect(result.sceneTimings[0]?.selectedCameraMotion).toBe("vertical_rise");
    expect(result.sceneTimings[0]?.selectedTransitionEffect).toBe("iris");
  });
});
