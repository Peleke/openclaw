import { Type } from "@sinclair/typebox";
import type { LinWheel } from "@linwheel/sdk";
import type { AnyAgentTool } from "../../../../src/agents/tools/common.js";
import { jsonResult, readStringParam, readStringArrayParam } from "../../../../src/agents/tools/common.js";

export function createVoiceProfileTools(client: LinWheel): AnyAgentTool[] {
  const list: AnyAgentTool = {
    name: "linwheel_voice_profiles_list",
    description: "List all voice profiles. Shows which profile is active for style matching.",
    parameters: Type.Object({}),
    async execute() {
      const result = await client.voiceProfiles.list();
      return jsonResult(result);
    },
  };

  const create: AnyAgentTool = {
    name: "linwheel_voice_profile_create",
    description:
      "Create a voice profile from writing samples. The active profile is injected into all content generation. Provide 3+ samples for best results.",
    parameters: Type.Object({
      name: Type.String({ description: "Name for the voice profile" }),
      description: Type.Optional(Type.String({ description: "Style notes, e.g. 'Technical, direct, slightly irreverent'" })),
      samples: Type.Array(Type.String(), { description: "Writing samples (3+ recommended)" }),
      isActive: Type.Optional(Type.Boolean({ description: "Set as active profile (default: true)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const name = readStringParam(params, "name", { required: true });
      const samples = readStringArrayParam(params, "samples", { required: true });
      const result = await client.voiceProfiles.create({
        name,
        description: readStringParam(params, "description"),
        samples,
        isActive: typeof params.isActive === "boolean" ? params.isActive : undefined,
      });
      return jsonResult(result);
    },
  };

  const del: AnyAgentTool = {
    name: "linwheel_voice_profile_delete",
    description: "Delete a voice profile by ID.",
    parameters: Type.Object({
      profileId: Type.String({ description: "The voice profile ID to delete" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const profileId = readStringParam(params, "profileId", { required: true });
      const result = await client.voiceProfiles.delete(profileId);
      return jsonResult(result);
    },
  };

  const activate: AnyAgentTool = {
    name: "linwheel_voice_profile_activate",
    description: "Set a voice profile as active. Only one can be active at a time.",
    parameters: Type.Object({
      profileId: Type.String({ description: "The voice profile ID to activate" }),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const profileId = readStringParam(params, "profileId", { required: true });
      const result = await client.voiceProfiles.activate(profileId);
      return jsonResult(result);
    },
  };

  return [list, create, del, activate];
}
