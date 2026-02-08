import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SKILLS_EXTRA_DIR, loadWorkspaceSkillEntries } from "./workspace.js";

function writeSkill(dir: string, name: string, description: string): void {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  );
}

describe("SKILLS_EXTRA_DIR", () => {
  it("points to skills-extra inside the config directory", () => {
    expect(SKILLS_EXTRA_DIR).toMatch(/skills-extra$/);
  });
});

describe("loadWorkspaceSkillEntries", () => {
  const tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-skills-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("loads skills from config extraDirs", () => {
    const extraDir = makeTmpDir();
    const workspaceDir = makeTmpDir();
    writeSkill(extraDir, "test-extra-skill", "An extra skill");

    const entries = loadWorkspaceSkillEntries(workspaceDir, {
      config: { skills: { load: { extraDirs: [extraDir] } } } as never,
      bundledSkillsDir: makeTmpDir(), // empty — no bundled skills
    });

    const names = entries.map((e) => e.skill.name);
    expect(names).toContain("test-extra-skill");
  });

  it("loads skills from nested subdirectories in extraDirs", () => {
    const extraDir = makeTmpDir();
    const workspaceDir = makeTmpDir();
    const nestedDir = path.join(extraDir, "vendor");
    fs.mkdirSync(nestedDir, { recursive: true });
    writeSkill(nestedDir, "nested-skill", "A nested skill");

    const entries = loadWorkspaceSkillEntries(workspaceDir, {
      config: { skills: { load: { extraDirs: [extraDir] } } } as never,
      bundledSkillsDir: makeTmpDir(),
    });

    const names = entries.map((e) => e.skill.name);
    expect(names).toContain("nested-skill");
  });

  it("workspace skills override extra skills with same name", () => {
    const extraDir = makeTmpDir();
    const workspaceDir = makeTmpDir();
    writeSkill(extraDir, "my-skill", "Extra version");
    writeSkill(path.join(workspaceDir, "skills"), "my-skill", "Workspace version");

    const entries = loadWorkspaceSkillEntries(workspaceDir, {
      config: { skills: { load: { extraDirs: [extraDir] } } } as never,
      bundledSkillsDir: makeTmpDir(),
    });

    const match = entries.find((e) => e.skill.name === "my-skill");
    expect(match).toBeDefined();
    expect(match!.skill.description).toBe("Workspace version");
  });
});
