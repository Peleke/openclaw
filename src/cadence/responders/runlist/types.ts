/**
 * Runlist responder types.
 *
 * Domain types for parsing RUNLET_SUMMARY JSON blocks
 * from Obsidian vault runlist files.
 */

export interface RunletSummary {
  date: string;
  focus: string;
  known_focuses: string[];
  counts: {
    do_first: number;
    block_time: number;
    batch: number;
    kill: number;
  };
  top_task: string;
  carried: string[];
  carried_count: number;
  tasks: RunletTask[];
}

export interface RunletTask {
  description: string;
  quadrant: "do_first" | "block_time" | "batch" | "kill";
  energy: "low" | "high";
  moves_focus: boolean;
  focuses: string[];
  carried_from: string | null;
}

export interface TaskCompletion {
  done: string[];
  pending: string[];
}

export interface RunlistResponderConfig {
  /** Cron job IDs this responder listens for */
  cronTriggerJobIds: string[];
  /** Directory within vault containing runlist files (default: "Runlist") */
  runlistDir: string;
}
