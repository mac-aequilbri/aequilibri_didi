import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { loadUc1Team, type Uc1TeamMemberView } from "@/lib/platform/uc1Source";
import { createTeamMember, toggleMember, updateAccuracyProfile } from "./actions";

export const dynamic = "force-dynamic";

const ROLES = ["estimator", "director", "admin", "technician"];

export default async function TeamPage() {
  let members: Uc1TeamMemberView[] = [];
  try {
    members = await loadUc1Team();
  } catch { members = []; }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Estimator accuracy profiles — feed into correction root causes"
      />
      <div className="px-8 space-y-4">
        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Accuracy profile</th><th className="text-right">Corrections</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No team members. Add the first one.</td></tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className={m.isActive ? "" : "opacity-40"}>
                    <td className="font-medium">{m.name}</td>
                    <td><span className="text-xs bg-[var(--ae-khaki)] px-2 py-0.5 rounded-full">{m.role}</span></td>
                    <td className="text-sm text-neutral-600 max-w-xs">
                      <form action={updateAccuracyProfile} className="flex gap-2">
                        <input type="hidden" name="id" value={m.id} />
                        <input name="accuracy_profile" defaultValue={m.accuracyProfile} placeholder="Known tendencies…" className="flex-1 border border-[var(--ae-earth)] rounded px-2 py-1 text-sm" />
                        <button className="btn-ae-outline text-xs">Save</button>
                      </form>
                    </td>
                    <td className="text-right">{m.corrections}</td>
                    <td className="text-sm">{formatDate(m.dateJoined)}</td>
                    <td className="text-right">
                      <form action={toggleMember}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="btn-ae-outline text-xs">{m.isActive ? "Deactivate" : "Activate"}</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form action={createTeamMember} className="ae-card p-5 space-y-3">
          <h2 className="font-semibold">Add Team Member</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="name" placeholder="Full name" required className="border border-[var(--ae-earth)] rounded px-3 py-2" />
            <select name="role" className="border border-[var(--ae-earth)] rounded px-3 py-2">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input name="accuracy_profile" placeholder="Known tendencies (e.g. adds 12% contingency on multi-wing)" className="border border-[var(--ae-earth)] rounded px-3 py-2 sm:col-span-2" />
          </div>
          <button className="btn-ae">Add Member</button>
        </form>
      </div>
    </div>
  );
}
