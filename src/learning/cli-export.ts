/**
 * CLI export for learning layer data (JSON/CSV to stdout).
 */

import type { DatabaseSync } from "node:sqlite";
import { listRunTracesWithOffset, loadPosteriors } from "./store.js";
import type { ArmPosterior, RunTrace } from "./types.js";

export type ExportOptions = {
  format: "json" | "csv";
  traces?: boolean;
  posteriors?: boolean;
};

export function exportLearningData(db: DatabaseSync, opts: ExportOptions): string {
  const includeTraces = opts.traces ?? true;
  const includePosteriors = opts.posteriors ?? true;

  if (opts.format === "json") {
    return exportJson(db, includeTraces, includePosteriors);
  }
  return exportCsv(db, includeTraces, includePosteriors);
}

function exportJson(db: DatabaseSync, traces: boolean, posteriors: boolean): string {
  const result: Record<string, unknown> = {};
  if (traces) {
    const { traces: data } = listRunTracesWithOffset(db, { limit: 10_000 });
    result.traces = data;
  }
  if (posteriors) {
    result.posteriors = Array.from(loadPosteriors(db).values());
  }
  return JSON.stringify(result, null, 2);
}

function exportCsv(db: DatabaseSync, traces: boolean, posteriors: boolean): string {
  const sections: string[] = [];

  if (traces) {
    const { traces: data } = listRunTracesWithOffset(db, { limit: 10_000 });
    sections.push(tracesToCsv(data));
  }

  if (posteriors) {
    const data = Array.from(loadPosteriors(db).values());
    sections.push(posteriorsToCsv(data));
  }

  return sections.join("\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function tracesToCsv(traces: RunTrace[]): string {
  const header =
    "traceId,runId,sessionId,timestamp,provider,model,channel,isBaseline,totalTokens,durationMs,aborted";
  const rows = traces.map((t) =>
    [
      csvEscape(t.traceId),
      csvEscape(t.runId),
      csvEscape(t.sessionId),
      String(t.timestamp),
      csvEscape(t.provider ?? ""),
      csvEscape(t.model ?? ""),
      csvEscape(t.channel ?? ""),
      t.isBaseline ? "1" : "0",
      String(t.usage?.total ?? 0),
      String(t.durationMs ?? 0),
      t.aborted ? "1" : "0",
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function posteriorsToCsv(posteriors: ArmPosterior[]): string {
  const header = "armId,alpha,beta,mean,pulls,lastUpdated";
  const rows = posteriors.map((p) =>
    [
      csvEscape(p.armId),
      p.alpha.toFixed(4),
      p.beta.toFixed(4),
      (p.alpha / (p.alpha + p.beta)).toFixed(4),
      String(p.pulls),
      String(p.lastUpdated),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}
