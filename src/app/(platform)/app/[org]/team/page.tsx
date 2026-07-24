// Team & access management (governance framework: Authentication & User
// Provisioning). Owner-gated. Members listed here are the org's authoritative
// access list: with Clerk active a user signs in and is matched by email;
// inviting sends a Clerk invitation email; deactivating revokes access.

import { PageHeader } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/form/ConfirmSubmitButton";
import { SubmitButton } from "@/components/form/SubmitButton";
import { controlEnabled, listControlAssignments } from "@/lib/airtable/control";
import { clerkEnabled } from "@/lib/platform/authConfig";
import { loadJobOptions } from "@/lib/platform/jobOptionsSource";
import { requireAdmin, requireOrgCtx } from "@/lib/platform/org-context";
import { listMembers } from "@/lib/platform/provisioning";
import { rolePriority } from "@/lib/platform/module1Governance";
import { rlsExempt } from "@/lib/platform/roles";
import { inviteMemberAction, setMemberActiveAction, setMemberRoleAction } from "./actions";
import { ProjectAssignments } from "./ProjectAssignments";

export const dynamic = "force-dynamic";

// Governance roles (D5 mapping) incl. §2.1 sub-roles — the "+suffix" rides on
// the stored Role string; lib/platform/roles.ts parses it.
const ROLES: { value: string; label: string; hint: string }[] = [
  { value: "owner", label: "Owner (Administrator)", hint: "full access incl. finance, approvals, admin" },
  { value: "builder", label: "Builder (Manager)", hint: "read/write + approvals, no finance or admin" },
  { value: "builder+finance", label: "Builder — Finance Manager", hint: "Manager + finance visibility and financial approvals" },
  { value: "architect", label: "Architect (Contributor)", hint: "read/write, no approvals, finance or admin" },
  { value: "broker", label: "Broker (Viewer)", hint: "read-only" },
  { value: "broker+auditor", label: "Broker — Auditor", hint: "read-only incl. finance, whole tenant" },
];

function StatusBanner({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const status = typeof sp.status === "string" ? sp.status : undefined;
  if (!status) return null;
  const who = typeof sp.who === "string" ? sp.who : "";
  const msg = typeof sp.msg === "string" ? sp.msg : "";
  const ok = "bg-emerald-50 text-emerald-800 border-emerald-200";
  const warn = "bg-amber-50 text-amber-800 border-amber-200";
  const err = "bg-rose-50 text-rose-800 border-rose-200";
  const map: Record<string, { cls: string; text: string }> = {
    invited: { cls: ok, text: `Invitation email sent to ${who}. They'll appear as signed-in once they create their account.` },
    added: { cls: ok, text: `${who} added. No invitation email sent — they either already have an account or auth is not active.` },
    reactivated: { cls: ok, text: `${who} was previously deactivated — access restored with the new role.` },
    already_member: { cls: warn, text: `${who} is already an active member — nothing changed.` },
    role_updated: { cls: ok, text: `Role updated for ${who}.` },
    projects_updated: { cls: ok, text: `Project access updated for ${who}.` },
    deactivated: { cls: ok, text: `${who} deactivated — access is revoked (takes up to a minute to apply).` },
    reactivated_member: { cls: ok, text: `${who} reactivated.` },
    invalid: { cls: err, text: "Enter a name and a valid email address." },
    error: { cls: err, text: msg || "The change was not applied." },
  };
  const m = map[status];
  if (!m) return null;
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${m.cls}`}>{m.text}</div>;
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgCtx(org);
  const me = await requireAdmin(ctx);

  const members = (await listMembers(ctx)).sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || rolePriority(a.role) - rolePriority(b.role) || a.name.localeCompare(b.name),
  );
  const authOn = clerkEnabled();

  // Project (job) assignments = the RLS access list. Only meaningful on the
  // Airtable control plane (where PLAT_ASSIGNMENTS lives); hidden otherwise.
  const showProjects = controlEnabled();
  const jobs = showProjects ? await loadJobOptions(ctx) : [];
  const capped = jobs.length >= 200; // loadJobOptions caps the picker at 200
  const assignmentsByEmail = new Map<string, string[]>();
  if (showProjects) {
    for (const a of await listControlAssignments(ctx.orgSlug)) {
      (assignmentsByEmail.get(a.email) ?? assignmentsByEmail.set(a.email, []).get(a.email)!).push(a.jobRecId);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader
        title="Team & access"
        subtitle="Who can sign in to this organisation, and with which role."
      />

      <StatusBanner sp={sp} />

      {!authOn && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Authentication is not active (demo mode) — roles below still govern permissions, but no
          sign-in is required and no invitation emails are sent.
        </div>
      )}

      <section className="ae-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Invite a member</h2>
        <form action={inviteMemberAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="org" value={ctx.orgSlug} />
          <label className="text-xs text-neutral-600">
            Name
            <input
              name="name"
              required
              className="mt-1 block w-44 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              placeholder="Full name"
            />
          </label>
          <label className="text-xs text-neutral-600">
            Email
            <input
              name="email"
              type="email"
              required
              className="mt-1 block w-60 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              placeholder="person@company.com"
            />
          </label>
          <label className="text-xs text-neutral-600">
            Role
            <select
              name="role"
              defaultValue="builder"
              className="mt-1 block rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton
            label={authOn ? "Send invitation" : "Add member"}
            pendingLabel={authOn ? "Sending…" : "Adding…"}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          />
        </form>
      </section>

      <section className="ae-card p-5 mb-6">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Member</th>
              <th className="py-1 pr-2">Role</th>
              {showProjects && <th className="py-1 pr-2">Project access</th>}
              <th className="py-1 pr-2 text-center">Status</th>
              <th className="py-1 text-right">Access</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const self = m.email.toLowerCase() === me.email.toLowerCase();
              return (
                <tr key={m.email} className={`border-t border-neutral-100 align-middle ${m.isActive ? "" : "opacity-50"}`}>
                  <td className="py-2 pr-2">
                    <div className="font-medium">
                      {m.name}
                      {self && <span className="ml-1.5 text-xs font-normal text-neutral-400">(you)</span>}
                    </div>
                    <div className="text-xs text-neutral-400">{m.email}</div>
                  </td>
                  <td className="py-2 pr-2">
                    <form action={setMemberRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="email" value={m.email} />
                      <select
                        name="role"
                        defaultValue={m.role}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <SubmitButton
                        label="Set"
                        pendingLabel="Saving…"
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                      />
                    </form>
                  </td>
                  {showProjects && (
                    <td className="py-2 pr-2 align-top">
                      {rlsExempt(m.role) ? (
                        <span className="text-xs text-neutral-400" title="This role sees every project">
                          Full access
                        </span>
                      ) : (
                        <ProjectAssignments
                          orgSlug={ctx.orgSlug}
                          email={m.email}
                          jobs={jobs}
                          assigned={assignmentsByEmail.get(m.email.toLowerCase()) ?? []}
                          capped={capped}
                        />
                      )}
                    </td>
                  )}
                  <td className="py-2 pr-2 text-center">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.isActive ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {m.isActive ? "active" : "deactivated"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <form action={setMemberActiveAction}>
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="email" value={m.email} />
                      <input type="hidden" name="active" value={m.isActive ? "0" : "1"} />
                      {m.isActive ? (
                        <ConfirmSubmitButton
                          label="Deactivate"
                          confirmLabel="Confirm deactivate"
                          pendingLabel="Deactivating…"
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                        />
                      ) : (
                        <SubmitButton
                          label="Reactivate"
                          pendingLabel="Reactivating…"
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                        />
                      )}
                    </form>
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={showProjects ? 5 : 4} className="py-4 text-center text-sm text-neutral-500">
                  No members yet — invite the first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-xs text-neutral-400 mt-3">
          Membership here is the source of truth for access: a user signs in with their email
          (via Clerk) and must match an active member of this organisation. Deactivating a member
          revokes access without deleting their sign-in account. Every organisation must keep at
          least one active owner.
        </p>
      </section>
    </div>
  );
}
