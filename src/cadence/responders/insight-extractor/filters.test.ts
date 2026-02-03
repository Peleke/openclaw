/**
 * Filter utilities tests — exhaustive coverage.
 */

import { describe, it, expect } from "vitest";
import { shouldExtract, extractPillarHint, shouldSkipPath } from "./filters.js";

describe("shouldExtract", () => {
  const defaultConfig = {
    magicString: "::publish",
    minContentLength: 50,
  };

  describe("Magic String Detection", () => {
    it("accepts content starting with magic string", () => {
      const result = shouldExtract(
        "::publish\n\n# My Title\n\nThis is content that is definitely long enough to pass the minimum",
        defaultConfig,
      );

      expect(result.shouldExtract).toBe(true);
      expect(result.content).toBe(
        "# My Title\n\nThis is content that is definitely long enough to pass the minimum",
      );
    });

    it("rejects content without magic string", () => {
      const result = shouldExtract(
        "# My Title\n\nThis is content without magic string at the start",
        defaultConfig,
      );

      expect(result.shouldExtract).toBe(false);
      expect(result.reason).toBe("Missing magic string");
    });

    it("rejects magic string not at start", () => {
      const result = shouldExtract(
        "# Title\n\n::publish\n\nContent after the title",
        defaultConfig,
      );

      expect(result.shouldExtract).toBe(false);
      expect(result.reason).toBe("Missing magic string");
    });

    it("handles magic string with immediate content (no newline)", () => {
      const result = shouldExtract(
        "::publishThis is content that follows immediately and is definitely long enough to pass",
        defaultConfig,
      );

      expect(result.shouldExtract).toBe(true);
      expect(result.content).toBe(
        "This is content that follows immediately and is definitely long enough to pass",
      );
    });

    it("handles magic string with multiple newlines", () => {
      const result = shouldExtract(
        "::publish\n\n\n\n# Title\n\nContent that is definitely long enough to meet the requirement",
        defaultConfig,
      );

      expect(result.shouldExtract).toBe(true);
      expect(result.content).toBe(
        "# Title\n\nContent that is definitely long enough to meet the requirement",
      );
    });

    it("handles magic string with spaces after", () => {
      const result = shouldExtract(
        "::publish   \n\n# Title with enough content here to meet the minimum length requirement",
        defaultConfig,
      );

      expect(result.shouldExtract).toBe(true);
      expect(result.content).toBe(
        "# Title with enough content here to meet the minimum length requirement",
      );
    });

    it("handles different magic strings", () => {
      const configs = [
        { magicString: "@publish", minContentLength: 10 },
        { magicString: "#!extract", minContentLength: 10 },
        { magicString: ">>>PROCESS", minContentLength: 10 },
        { magicString: "🚀", minContentLength: 10 },
      ];

      for (const config of configs) {
        const content = `${config.magicString}\n\nTest content here`;
        const result = shouldExtract(content, config);

        expect(result.shouldExtract).toBe(true);
        expect(result.content).toBe("Test content here");
      }
    });

    it("is case-sensitive for magic string", () => {
      const result = shouldExtract("::PUBLISH\n\nContent", defaultConfig);

      expect(result.shouldExtract).toBe(false);
    });
  });

  describe("Minimum Content Length", () => {
    it("accepts content meeting minimum length", () => {
      const content = "::publish\n\n" + "x".repeat(50);
      const result = shouldExtract(content, defaultConfig);

      expect(result.shouldExtract).toBe(true);
    });

    it("rejects content below minimum length", () => {
      const content = "::publish\n\n" + "x".repeat(49);
      const result = shouldExtract(content, defaultConfig);

      expect(result.shouldExtract).toBe(false);
      expect(result.reason).toBe("Content too short (49 < 50)");
    });

    it("counts length after stripping magic string", () => {
      // Magic string is 9 chars, so we need 50 chars AFTER it
      const shortContent = "::publish\n\n" + "x".repeat(30);
      const result = shouldExtract(shortContent, defaultConfig);

      expect(result.shouldExtract).toBe(false);
    });

    it("handles zero minimum length", () => {
      const config = { magicString: "::publish", minContentLength: 0 };
      const result = shouldExtract("::publish", config);

      expect(result.shouldExtract).toBe(true);
      expect(result.content).toBe("");
    });

    it("handles very large minimum length", () => {
      const config = { magicString: "::publish", minContentLength: 10000 };
      const content = "::publish\n\n" + "x".repeat(9999);
      const result = shouldExtract(content, config);

      expect(result.shouldExtract).toBe(false);
      expect(result.reason).toContain("Content too short");
    });
  });

  describe("Content Stripping", () => {
    it("strips leading whitespace after magic string", () => {
      const result = shouldExtract(
        "::publish   \n\n   Content with enough length here to pass the minimum threshold",
        defaultConfig,
      );

      expect(result.content).toBe("Content with enough length here to pass the minimum threshold");
    });

    it("preserves internal whitespace", () => {
      const result = shouldExtract(
        "::publish\n\n# Title\n\n   Indented content with spaces that is definitely long enough",
        defaultConfig,
      );

      expect(result.content).toBe(
        "# Title\n\n   Indented content with spaces that is definitely long enough",
      );
    });

    it("handles tabs and mixed whitespace", () => {
      const result = shouldExtract(
        "::publish\t\n \t\n Content with enough text here now to pass the minimum threshold",
        defaultConfig,
      );

      expect(result.content).toBe(
        "Content with enough text here now to pass the minimum threshold",
      );
    });
  });

  describe("Edge Cases", () => {
    it("handles empty content", () => {
      const result = shouldExtract("", defaultConfig);

      expect(result.shouldExtract).toBe(false);
      expect(result.reason).toBe("Missing magic string");
    });

    it("handles content that is exactly the magic string", () => {
      const result = shouldExtract("::publish", defaultConfig);

      expect(result.shouldExtract).toBe(false);
      expect(result.reason).toContain("Content too short");
    });

    it("handles very long content", () => {
      const content = "::publish\n\n" + "x".repeat(100000);
      const result = shouldExtract(content, defaultConfig);

      expect(result.shouldExtract).toBe(true);
      expect(result.content.length).toBe(100000);
    });

    it("handles content with only whitespace after magic string", () => {
      const result = shouldExtract("::publish\n\n   \t\n   ", defaultConfig);

      expect(result.shouldExtract).toBe(false);
      expect(result.reason).toContain("Content too short");
    });

    it("handles unicode in magic string", () => {
      const config = { magicString: "📝✨", minContentLength: 10 };
      const result = shouldExtract("📝✨\n\nUnicode content here", config);

      expect(result.shouldExtract).toBe(true);
    });

    it("handles unicode in content", () => {
      // Ensure content is long enough (50+ chars after magic string)
      const content =
        "::publish\n\n# 北欧神話について\n\nこれは日本語のコンテンツです。長さが十分あります。追加のテキストでさらに長くします。";
      const result = shouldExtract(content, defaultConfig);

      expect(result.shouldExtract).toBe(true);
    });
  });
});

describe("extractPillarHint", () => {
  it("extracts string pillar value", () => {
    const result = extractPillarHint({ pillar: "norse" });
    expect(result).toBe("norse");
  });

  it("trims whitespace from pillar value", () => {
    const result = extractPillarHint({ pillar: "  technical  " });
    expect(result).toBe("technical");
  });

  it("returns undefined for missing pillar", () => {
    const result = extractPillarHint({});
    expect(result).toBeUndefined();
  });

  it("returns undefined for null pillar", () => {
    const result = extractPillarHint({ pillar: null });
    expect(result).toBeUndefined();
  });

  it("returns undefined for numeric pillar", () => {
    const result = extractPillarHint({ pillar: 42 });
    expect(result).toBeUndefined();
  });

  it("returns undefined for boolean pillar", () => {
    const result = extractPillarHint({ pillar: true });
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty string pillar", () => {
    const result = extractPillarHint({ pillar: "" });
    expect(result).toBeUndefined();
  });

  it("returns undefined for whitespace-only pillar", () => {
    const result = extractPillarHint({ pillar: "   " });
    expect(result).toBeUndefined();
  });

  it("returns undefined for array pillar", () => {
    const result = extractPillarHint({ pillar: ["norse", "technical"] });
    expect(result).toBeUndefined();
  });

  it("returns undefined for object pillar", () => {
    const result = extractPillarHint({ pillar: { id: "norse" } });
    expect(result).toBeUndefined();
  });

  it("ignores other frontmatter fields", () => {
    const result = extractPillarHint({
      title: "My Note",
      tags: ["test"],
      pillar: "neurodivergent",
      publish: true,
    });
    expect(result).toBe("neurodivergent");
  });
});

describe("shouldSkipPath", () => {
  describe("Test File Patterns", () => {
    it("skips _cadence-* files", () => {
      expect(shouldSkipPath("/vault/_cadence-smoke-test.md")).toBe(true);
      expect(shouldSkipPath("_cadence-test.md")).toBe(true);
      expect(shouldSkipPath("/deep/path/_cadence-anything.md")).toBe(true);
    });

    it("skips _debug-* files", () => {
      expect(shouldSkipPath("/vault/_debug-test.md")).toBe(true);
      expect(shouldSkipPath("_debug-foo.md")).toBe(true);
    });

    it("does not skip files containing but not starting with _cadence-", () => {
      expect(shouldSkipPath("/vault/my_cadence-notes.md")).toBe(false);
      expect(shouldSkipPath("/vault/test_cadence-file.md")).toBe(false);
    });
  });

  describe("Dot Files", () => {
    it("skips files starting with dot", () => {
      expect(shouldSkipPath("/vault/.hidden.md")).toBe(true);
      expect(shouldSkipPath(".DS_Store")).toBe(true);
      expect(shouldSkipPath("/path/to/.obsidian")).toBe(true);
    });

    it("does not skip files in dot directories", () => {
      // The function only checks the filename, not directories
      expect(shouldSkipPath("/vault/.obsidian/workspace.json")).toBe(false);
    });
  });

  describe("Regular Files", () => {
    it("does not skip normal markdown files", () => {
      expect(shouldSkipPath("/vault/My Note.md")).toBe(false);
      expect(shouldSkipPath("/vault/Journal/2024-01-01.md")).toBe(false);
      expect(shouldSkipPath("simple.md")).toBe(false);
    });

    it("does not skip files with underscores in name", () => {
      expect(shouldSkipPath("/vault/my_notes.md")).toBe(false);
      expect(shouldSkipPath("/vault/test_file_name.md")).toBe(false);
    });

    it("does not skip files starting with underscore (except patterns)", () => {
      expect(shouldSkipPath("/vault/_private.md")).toBe(false);
      expect(shouldSkipPath("_notes.md")).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("handles paths with spaces", () => {
      expect(shouldSkipPath("/My Vault/My Notes/_cadence-test.md")).toBe(true);
      expect(shouldSkipPath("/My Vault/My Notes/Regular Note.md")).toBe(false);
    });

    it("handles paths with unicode", () => {
      expect(shouldSkipPath("/保管庫/ノート.md")).toBe(false);
      expect(shouldSkipPath("/保管庫/_cadence-テスト.md")).toBe(true);
    });

    it("handles empty path", () => {
      expect(shouldSkipPath("")).toBe(false);
    });

    it("handles just filename", () => {
      expect(shouldSkipPath("note.md")).toBe(false);
      expect(shouldSkipPath("_cadence-x.md")).toBe(true);
      expect(shouldSkipPath(".hidden")).toBe(true);
    });

    it("handles trailing slashes", () => {
      // This is unusual but should handle gracefully
      expect(shouldSkipPath("/vault/folder/")).toBe(false);
    });
  });
});
