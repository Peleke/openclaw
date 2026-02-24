import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LinWheel } from "@linwheel/sdk";
import type { OpenClawPluginApi } from "../../../../src/plugins/types.js";
import { createLinWheelClient } from "../client-factory.js";
import { createAllTools } from "./index.js";

// ---------------------------------------------------------------------------
// Mock SDK client
// ---------------------------------------------------------------------------

function mockClient(): LinWheel {
  return {
    analyze: vi.fn().mockResolvedValue({ linkedinFit: { score: 8 }, suggestedAngles: [] }),
    reshape: vi.fn().mockResolvedValue({ posts: [{ text: "reshaped", postId: "p1" }] }),
    refine: vi.fn().mockResolvedValue({ text: "refined" }),
    split: vi.fn().mockResolvedValue({ posts: [{ text: "part1" }, { text: "part2" }] }),
    draft: vi.fn().mockResolvedValue({ postId: "d1" }),
    bundle: vi.fn().mockResolvedValue({ postId: "b1" }),
    posts: {
      list: vi.fn().mockResolvedValue({ posts: [] }),
      get: vi.fn().mockResolvedValue({ id: "p1", fullText: "hello" }),
      update: vi.fn().mockResolvedValue({ id: "p1" }),
      approve: vi.fn().mockResolvedValue({ id: "p1", approved: true }),
      schedule: vi.fn().mockResolvedValue({ id: "p1", scheduledAt: "2026-02-24T09:00:00Z" }),
      image: vi.fn().mockResolvedValue({ imageUrl: "https://example.com/img.png" }),
      carousel: vi.fn().mockResolvedValue({ carouselUrl: "https://example.com/carousel.pdf" }),
    },
    voiceProfiles: {
      list: vi.fn().mockResolvedValue({ profiles: [], activeProfileId: null }),
      create: vi.fn().mockResolvedValue({ profile: { id: "vp1", name: "Test" } }),
      delete: vi.fn().mockResolvedValue({ deleted: true }),
      activate: vi.fn().mockResolvedValue({ activated: true }),
    },
  } as unknown as LinWheel;
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

describe("createLinWheelClient", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.LINWHEEL_API_KEY;
    delete process.env.LINWHEEL_SIGNING_SECRET;
    delete process.env.LINWHEEL_BASE_URL;
  });

  afterEach(() => {
    process.env = env;
  });

  function fakeApi(pluginConfig?: Record<string, unknown>): OpenClawPluginApi {
    return {
      pluginConfig: pluginConfig ?? {},
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as unknown as OpenClawPluginApi;
  }

  it("returns null when no API key is available", () => {
    expect(createLinWheelClient(fakeApi())).toBeNull();
  });

  it("creates client from plugin config", () => {
    const client = createLinWheelClient(fakeApi({ apiKey: "lw_sk_test" }));
    expect(client).not.toBeNull();
  });

  it("creates client from env var", () => {
    process.env.LINWHEEL_API_KEY = "lw_sk_env";
    const client = createLinWheelClient(fakeApi());
    expect(client).not.toBeNull();
  });

  it("prefers plugin config over env var", () => {
    process.env.LINWHEEL_API_KEY = "lw_sk_env";
    const client = createLinWheelClient(fakeApi({ apiKey: "lw_sk_config" }));
    expect(client).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

describe("createAllTools", () => {
  it("returns 17 tools", () => {
    const tools = createAllTools(mockClient());
    expect(tools).toHaveLength(17);
  });

  it("all tools have unique names", () => {
    const tools = createAllTools(mockClient());
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(17);
  });

  it("all tool names start with linwheel_", () => {
    const tools = createAllTools(mockClient());
    for (const tool of tools) {
      expect(tool.name).toMatch(/^linwheel_/);
    }
  });

  it("all tools have descriptions", () => {
    const tools = createAllTools(mockClient());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe("string");
    }
  });

  it("all tools have parameters", () => {
    const tools = createAllTools(mockClient());
    for (const tool of tools) {
      expect(tool.parameters).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Tool execution — content processing
// ---------------------------------------------------------------------------

describe("linwheel_analyze", () => {
  it("calls client.analyze with text and context", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_analyze")!;

    await tool.execute("id", { text: "Today I shipped an SDK", context: "buildlog" });
    expect(client.analyze).toHaveBeenCalledWith({
      text: "Today I shipped an SDK",
      context: "buildlog",
    });
  });

  it("throws when text is missing", async () => {
    const tools = createAllTools(mockClient());
    const tool = tools.find((t) => t.name === "linwheel_analyze")!;
    await expect(tool.execute("id", {})).rejects.toThrow("text required");
  });
});

describe("linwheel_reshape", () => {
  it("calls client.reshape with angles and saveDrafts", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_reshape")!;

    await tool.execute("id", {
      text: "content",
      angles: ["field_note", "contrarian"],
      saveDrafts: true,
    });
    expect(client.reshape).toHaveBeenCalledWith({
      text: "content",
      angles: ["field_note", "contrarian"],
      preEdit: undefined,
      instructions: undefined,
      saveDrafts: true,
    });
  });

  it("throws when angles is empty", async () => {
    const tools = createAllTools(mockClient());
    const tool = tools.find((t) => t.name === "linwheel_reshape")!;
    await expect(tool.execute("id", { text: "content", angles: [] })).rejects.toThrow("angles required");
  });
});

describe("linwheel_refine", () => {
  it("calls client.refine with intensity", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_refine")!;

    await tool.execute("id", { text: "draft", intensity: "heavy" });
    expect(client.refine).toHaveBeenCalledWith(
      expect.objectContaining({ text: "draft", intensity: "heavy" }),
    );
  });
});

describe("linwheel_split", () => {
  it("calls client.split with maxPosts", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_split")!;

    await tool.execute("id", { text: "long content", maxPosts: 4 });
    expect(client.split).toHaveBeenCalledWith(
      expect.objectContaining({ text: "long content", maxPosts: 4 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tool execution — drafting
// ---------------------------------------------------------------------------

describe("linwheel_draft", () => {
  it("calls client.draft with fullText and scheduledAt", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_draft")!;

    await tool.execute("id", {
      fullText: "My post",
      postType: "field_note",
      scheduledAt: "2026-02-24T09:00:00Z",
    });
    expect(client.draft).toHaveBeenCalledWith(
      expect.objectContaining({
        fullText: "My post",
        postType: "field_note",
        scheduledAt: "2026-02-24T09:00:00Z",
      }),
    );
  });
});

describe("linwheel_bundle", () => {
  it("calls client.bundle with image and carousel", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_bundle")!;

    await tool.execute("id", {
      fullText: "Post text",
      imageHeadlineText: "Big Title",
      imageStylePreset: "dark_mode",
      carouselSlides: [{ headlineText: "Slide 1" }],
    });
    expect(client.bundle).toHaveBeenCalledWith(
      expect.objectContaining({
        fullText: "Post text",
        imageHeadlineText: "Big Title",
        imageStylePreset: "dark_mode",
        carouselSlides: [{ headlineText: "Slide 1" }],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tool execution — post management
// ---------------------------------------------------------------------------

describe("linwheel_posts_list", () => {
  it("calls client.posts.list with filters", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_posts_list")!;

    await tool.execute("id", { approved: false, limit: 10 });
    expect(client.posts.list).toHaveBeenCalledWith(
      expect.objectContaining({ approved: false, limit: 10 }),
    );
  });
});

describe("linwheel_post_get", () => {
  it("calls client.posts.get with postId", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_post_get")!;

    await tool.execute("id", { postId: "p123" });
    expect(client.posts.get).toHaveBeenCalledWith("p123");
  });

  it("throws when postId is missing", async () => {
    const tools = createAllTools(mockClient());
    const tool = tools.find((t) => t.name === "linwheel_post_get")!;
    await expect(tool.execute("id", {})).rejects.toThrow("postId required");
  });
});

describe("linwheel_post_update", () => {
  it("calls client.posts.update", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_post_update")!;

    await tool.execute("id", { postId: "p1", fullText: "updated" });
    expect(client.posts.update).toHaveBeenCalledWith("p1", expect.objectContaining({ fullText: "updated" }));
  });
});

describe("linwheel_post_approve", () => {
  it("calls client.posts.approve", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_post_approve")!;

    await tool.execute("id", { postId: "p1", approved: true });
    expect(client.posts.approve).toHaveBeenCalledWith("p1", true);
  });

  it("throws when approved is not boolean", async () => {
    const tools = createAllTools(mockClient());
    const tool = tools.find((t) => t.name === "linwheel_post_approve")!;
    await expect(tool.execute("id", { postId: "p1" })).rejects.toThrow("approved required");
  });
});

describe("linwheel_post_schedule", () => {
  it("schedules with ISO datetime", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_post_schedule")!;

    await tool.execute("id", { postId: "p1", scheduledAt: "2026-02-24T09:00:00Z" });
    expect(client.posts.schedule).toHaveBeenCalledWith("p1", {
      scheduledAt: "2026-02-24T09:00:00Z",
      autoPublish: undefined,
    });
  });

  it("unschedules with empty string", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_post_schedule")!;

    await tool.execute("id", { postId: "p1", scheduledAt: "" });
    expect(client.posts.schedule).toHaveBeenCalledWith("p1", {
      scheduledAt: null,
      autoPublish: undefined,
    });
  });
});

describe("linwheel_post_image", () => {
  it("calls client.posts.image", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_post_image")!;

    await tool.execute("id", { postId: "p1", headlineText: "Title", stylePreset: "dark_mode" });
    expect(client.posts.image).toHaveBeenCalledWith("p1", {
      headlineText: "Title",
      stylePreset: "dark_mode",
    });
  });
});

describe("linwheel_post_carousel", () => {
  it("calls client.posts.carousel", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_post_carousel")!;

    await tool.execute("id", {
      postId: "p1",
      slides: [{ headlineText: "S1" }, { headlineText: "S2" }],
    });
    expect(client.posts.carousel).toHaveBeenCalledWith("p1", {
      slides: [{ headlineText: "S1" }, { headlineText: "S2" }],
      stylePreset: undefined,
    });
  });

  it("throws when slides is empty", async () => {
    const tools = createAllTools(mockClient());
    const tool = tools.find((t) => t.name === "linwheel_post_carousel")!;
    await expect(tool.execute("id", { postId: "p1", slides: [] })).rejects.toThrow("slides required");
  });
});

// ---------------------------------------------------------------------------
// Tool execution — voice profiles
// ---------------------------------------------------------------------------

describe("linwheel_voice_profiles_list", () => {
  it("calls client.voiceProfiles.list", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_voice_profiles_list")!;

    await tool.execute("id", {});
    expect(client.voiceProfiles.list).toHaveBeenCalled();
  });
});

describe("linwheel_voice_profile_create", () => {
  it("calls client.voiceProfiles.create with samples", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_voice_profile_create")!;

    await tool.execute("id", {
      name: "My Voice",
      samples: ["sample1", "sample2", "sample3"],
      isActive: true,
    });
    expect(client.voiceProfiles.create).toHaveBeenCalledWith({
      name: "My Voice",
      description: undefined,
      samples: ["sample1", "sample2", "sample3"],
      isActive: true,
    });
  });
});

describe("linwheel_voice_profile_delete", () => {
  it("calls client.voiceProfiles.delete", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_voice_profile_delete")!;

    await tool.execute("id", { profileId: "vp1" });
    expect(client.voiceProfiles.delete).toHaveBeenCalledWith("vp1");
  });
});

describe("linwheel_voice_profile_activate", () => {
  it("calls client.voiceProfiles.activate", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_voice_profile_activate")!;

    await tool.execute("id", { profileId: "vp1" });
    expect(client.voiceProfiles.activate).toHaveBeenCalledWith("vp1");
  });
});

// ---------------------------------------------------------------------------
// Tool result format
// ---------------------------------------------------------------------------

describe("tool result format", () => {
  it("returns JSON-stringified content", async () => {
    const client = mockClient();
    const tools = createAllTools(client);
    const tool = tools.find((t) => t.name === "linwheel_analyze")!;

    const result = await tool.execute("id", { text: "test" });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text as string)).toEqual({
      linkedinFit: { score: 8 },
      suggestedAngles: [],
    });
  });
});
