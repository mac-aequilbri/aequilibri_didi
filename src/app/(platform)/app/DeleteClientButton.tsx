"use client";

// Small confirm-gated delete control for the org picker. The server action is
// passed in from the (server) picker page. confirm() guards against accidental
// offboarding — this is a destructive admin action.

interface Props {
  action: (formData: FormData) => void | Promise<void>;
  slug: string;
  name: string;
}

export function DeleteClientButton({ action, slug, name }: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Remove "${name}" from the registry?\n\nIt will disappear from the picker. Its Airtable base is NOT deleted — remove that manually in Airtable if you want it gone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <button type="submit" className="btn-ae-danger-outline">
        <span aria-hidden>🗑</span> Delete client
      </button>
    </form>
  );
}
