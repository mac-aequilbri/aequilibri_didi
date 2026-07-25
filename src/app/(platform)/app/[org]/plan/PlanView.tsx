// Spec 12 Module 8 — the PLAN view component: four rendering modes of ONE
// component, selected by the engagement type at render time (lock plan §8.1,
// spec: "not four separate components"). Module 5 owns the data structure
// (planSource); this owns only the rendering:
//   gantt     — Long Project: phase-grouped timeline bars (Start→End), RAG
//               tint, today marker
//   checklist — Short Job: a simple tick-list
//   workflow  — Ongoing Lifecycle: status-column board
//   season    — Seasonal Cycle: month-bucketed calendar list
// Server component; pure HTML/CSS in the app's existing visual language.

import type { PlanTaskView } from "@/lib/platform/planSource";
import type { PlanViewMode } from "@/lib/platform/engagementProfile";
import { formatDate } from "@/lib/format";

const RAG_BAR: Record<string, string> = {
  Red: "bg-red-400",
  Amber: "bg-amber-400",
  Green: "bg-emerald-400",
};

const DAY = 86_400_000;

interface GanttRow {
  task: PlanTaskView;
  /** Bar geometry in % of the [min,max] range; null = undated. */
  leftPct: number | null;
  widthPct: number | null;
}

/** Bar geometry for the Gantt — pure and exported for tests. */
export function ganttLayout(tasks: PlanTaskView[]): {
  rows: GanttRow[];
  min: number | null;
  max: number | null;
  todayPct: number | null;
} {
  const dated = tasks.filter((t) => t.startDate || t.endDate);
  const times = dated.flatMap((t) =>
    [t.startDate?.getTime(), t.endDate?.getTime()].filter((n): n is number => n != null),
  );
  if (!times.length) {
    return { rows: tasks.map((task) => ({ task, leftPct: null, widthPct: null })), min: null, max: null, todayPct: null };
  }
  const min = Math.min(...times);
  const max = Math.max(...times, min + DAY); // never a zero-width range
  const span = max - min;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - min) / span) * 100));
  const rows = tasks.map((task) => {
    const s = task.startDate?.getTime() ?? task.endDate?.getTime();
    const e = task.endDate?.getTime() ?? task.startDate?.getTime();
    if (s == null || e == null) return { task, leftPct: null, widthPct: null };
    const left = pct(Math.min(s, e));
    const width = Math.max(1.5, pct(Math.max(s, e, Math.min(s, e) + DAY)) - left);
    return { task, leftPct: left, widthPct: width };
  });
  const now = Date.now();
  return { rows, min, max, todayPct: now >= min && now <= max ? pct(now) : null };
}

function groupBy<T>(items: T[], keyOf: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    (m.get(k) ?? m.set(k, []).get(k)!).push(it);
  }
  return m;
}

function Gantt({ tasks }: { tasks: PlanTaskView[] }) {
  const { rows, min, max, todayPct } = ganttLayout(tasks);
  const byPhase = groupBy(rows, (r) => r.task.phaseName ?? "(no phase)");
  return (
    <div>
      {min != null && max != null && (
        <p className="mb-2 text-xs text-neutral-400">
          {formatDate(new Date(min))} — {formatDate(new Date(max))}
        </p>
      )}
      <div className="relative space-y-4">
        {todayPct != null && (
          <div
            className="absolute inset-y-0 w-px bg-red-400/70 z-10"
            style={{ left: `${todayPct}%` }}
            title="Today"
          />
        )}
        {[...byPhase.entries()].map(([phase, phaseRows]) => (
          <div key={phase}>
            <p className="text-xs font-semibold text-neutral-500 mb-1">{phase}</p>
            <div className="space-y-1">
              {phaseRows.map(({ task, leftPct, widthPct }) => (
                <div key={task.id} className="flex items-center gap-2 text-xs">
                  <span className="w-44 shrink-0 truncate" title={task.name}>
                    {task.name}
                  </span>
                  <div className="relative h-4 flex-1 rounded bg-neutral-100 overflow-hidden">
                    {leftPct != null && widthPct != null ? (
                      <div
                        className={`absolute inset-y-0 rounded ${RAG_BAR[task.rag] ?? "bg-[var(--ae-space,#1f2937)]/70"} ${task.status === "Complete" ? "opacity-40" : ""}`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        title={`${task.name} · ${task.status}${task.assignedTo ? ` · ${task.assignedTo}` : ""}`}
                      />
                    ) : (
                      <span className="absolute inset-y-0 left-2 flex items-center text-[0.65rem] text-neutral-400">
                        no dates
                      </span>
                    )}
                  </div>
                  <span className="w-20 shrink-0 text-right text-neutral-400">{task.status}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Checklist({ tasks }: { tasks: PlanTaskView[] }) {
  const byPhase = groupBy(tasks, (t) => t.phaseName ?? "(no phase)");
  return (
    <div className="space-y-3">
      {[...byPhase.entries()].map(([phase, list]) => (
        <div key={phase}>
          <p className="text-xs font-semibold text-neutral-500 mb-1">{phase}</p>
          <ul className="space-y-1 text-sm">
            {list.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span aria-hidden className={t.status === "Complete" ? "text-emerald-600" : "text-neutral-300"}>
                  {t.status === "Complete" ? "☑" : "☐"}
                </span>
                <span className={t.status === "Complete" ? "line-through text-neutral-400" : ""}>{t.name}</span>
                {t.endDate && (
                  <span className={`text-xs ${t.isOverdue ? "text-red-600" : "text-neutral-400"}`}>
                    {formatDate(t.endDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const WORKFLOW_COLUMNS = ["Not Started", "In Progress", "Blocked", "Deferred", "Complete"];

function Workflow({ tasks }: { tasks: PlanTaskView[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {WORKFLOW_COLUMNS.map((col) => {
        const list = tasks.filter((t) => t.status === col);
        return (
          <div key={col} className="rounded-lg bg-neutral-50 p-2">
            <p className="text-xs font-semibold text-neutral-500 mb-1.5">
              {col} <span className="text-neutral-400">({list.length})</span>
            </p>
            <div className="space-y-1.5">
              {list.map((t) => (
                <div key={t.id} className="rounded border border-neutral-200 bg-white px-2 py-1.5 text-xs">
                  <span className="font-medium">{t.name}</span>
                  {t.assignedTo && <span className="block text-neutral-400">{t.assignedTo}</span>}
                </div>
              ))}
              {list.length === 0 && <p className="text-[0.65rem] text-neutral-300">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Season({ tasks }: { tasks: PlanTaskView[] }) {
  const byMonth = groupBy(
    tasks,
    (t) => (t.startDate ? t.startDate.toISOString().slice(0, 7) : "undated"),
  );
  const keys = [...byMonth.keys()].sort();
  return (
    <div className="space-y-3">
      {keys.map((month) => (
        <div key={month}>
          <p className="text-xs font-semibold text-neutral-500 mb-1">
            {month === "undated"
              ? "Undated"
              : new Date(`${month}-01`).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
          </p>
          <ul className="space-y-1 text-sm">
            {byMonth.get(month)!.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="text-xs text-neutral-400 w-14 shrink-0">
                  {t.startDate ? formatDate(t.startDate).slice(0, 6) : "—"}
                </span>
                <span>{t.name}</span>
                <span className="text-xs text-neutral-400">{t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const MODE_TITLE: Record<PlanViewMode, string> = {
  gantt: "Gantt",
  checklist: "Checklist",
  workflow: "Workflow states",
  season: "Season calendar",
};

export function PlanView({ tasks, mode }: { tasks: PlanTaskView[]; mode: PlanViewMode }) {
  if (!tasks.length) return null;
  return (
    <section className="ae-card p-5 mb-6">
      <h2 className="font-semibold mb-3">
        {MODE_TITLE[mode]}{" "}
        <span className="text-xs font-normal text-neutral-400">
          render mode from the engagement type (Spec 12 M8)
        </span>
      </h2>
      {mode === "gantt" && <Gantt tasks={tasks} />}
      {mode === "checklist" && <Checklist tasks={tasks} />}
      {mode === "workflow" && <Workflow tasks={tasks} />}
      {mode === "season" && <Season tasks={tasks} />}
    </section>
  );
}
