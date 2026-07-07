"use client";

// At-a-glance highlights for a client-picker card. Reads a cached snapshot from
// the control base (passed in as `cached` by the server) and renders it on the
// first paint — so the picker stays instant and, within the TTL, touches no
// customer base at all. Only when the cache is missing or stale does the card
// fetch fresh counts in the background (fetchOrgHighlights, which also writes
// the cache back). Postgres mode passes no cache, so the card fetches on mount.
// Follows the dashboard's attention-first rule — the overdue/approval signals
// only appear (and only colour up) when there's something to act on.

import { useEffect, useState } from "react";
import { fetchOrgHighlights } from "./actions";
import type { OrgHighlights } from "@/lib/platform/orgHighlightsSource";

/** A cached snapshot is refreshed once it's older than this. Bounds how stale
 *  the picker numbers can be; a shorter TTL trades freshness for base traffic. */
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;

interface CachedSnapshot extends OrgHighlights {
  at: string;
}

function isStale(cached: CachedSnapshot | null): boolean {
  if (!cached) return true;
  const at = Date.parse(cached.at);
  return Number.isNaN(at) || Date.now() - at > SNAPSHOT_TTL_MS;
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "bad" | "warn" }) {
  const cls =
    tone === "bad"
      ? "bg-red-50 text-red-700"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-neutral-100 text-neutral-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function Pills({ data }: { data: OrgHighlights }) {
  const { projects, openActions, overdueActions, pendingApprovals } = data;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <Pill>
        {projects} project{projects === 1 ? "" : "s"}
      </Pill>
      <Pill>
        {openActions} open
        {overdueActions > 0 ? (
          <span className="font-semibold text-red-700"> · {overdueActions} overdue</span>
        ) : null}
      </Pill>
      {pendingApprovals > 0 ? <Pill tone="warn">{pendingApprovals} awaiting approval</Pill> : null}
    </div>
  );
}

export function ClientCardMetrics({ slug, cached }: { slug: string; cached: CachedSnapshot | null }) {
  const [data, setData] = useState<OrgHighlights | null>(cached);
  // Only show the skeleton when there's nothing cached to show yet.
  const [state, setState] = useState<"idle" | "loading" | "error">(cached ? "idle" : "loading");

  useEffect(() => {
    // Fresh cache → render it and skip the base entirely.
    if (!isStale(cached)) return;

    let alive = true;
    fetchOrgHighlights(slug)
      .then((h) => {
        if (!alive) return;
        if (h) {
          setData(h);
          setState("idle");
        } else if (!cached) {
          setState("error");
        }
      })
      .catch(() => {
        if (alive && !cached) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [slug, cached]);

  if (data) return <Pills data={data} />;

  if (state === "loading") {
    return (
      <div className="mt-2 flex gap-1.5" aria-hidden>
        <span className="h-5 w-20 animate-pulse rounded-full bg-neutral-100" />
        <span className="h-5 w-16 animate-pulse rounded-full bg-neutral-100" />
      </div>
    );
  }

  return <p className="mt-2 text-xs text-neutral-400">Open workspace</p>;
}
