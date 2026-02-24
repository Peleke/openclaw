/**
 * LinWheel Publisher responder types.
 */

export interface LinWheelPublisherConfig {
  /** Magic string to trigger publishing (default: "::linkedin") */
  magicString: string;

  /** Minimum content length after magic string (default: 50) */
  minContentLength: number;

  /** Debounce delay for file changes in ms (default: 3000) */
  debounceMs: number;

  /** Default angles for reshape (default: field_note, demystification, contrarian) */
  defaultAngles: string[];

  /** Whether to save drafts in LinWheel (default: true) */
  saveDrafts: boolean;
}

export const DEFAULT_PUBLISHER_CONFIG: LinWheelPublisherConfig = {
  magicString: "::linkedin",
  minContentLength: 50,
  debounceMs: 3000,
  defaultAngles: ["field_note", "demystification", "contrarian"],
  saveDrafts: true,
};
