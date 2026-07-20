"use client";

// Generic, spec-driven edit form — the generalised ActionEditor. Renders one
// input per EditorField, offers "✨ AI suggest / auto-fill" (populates the form
// for review; writes nothing), and Saves through the generic updateRecordDetail
// server action. Every list window reuses this; only the config + values differ.

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  toAiFields,
  toSpecLite,
  type EditorField,
  type EditorValues,
  type RecordEditorConfig,
} from "@/lib/platform/recordEditor";
import { suggestRecordEdits, updateRecordDetail } from "@/lib/platform/recordEditorActions";

const inputCls = "mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm";

/** Today as the YYYY-MM-DD an <input type="date"> emits, in local time —
 *  mirrors the shared DateField's noPast behavior. */
function todayInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function SaveButton({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-ae disabled:opacity-60" disabled={pending || saved}>
      {pending ? "Saving…" : saved ? "Saved — returning…" : "Save changes"}
    </button>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: EditorField;
  value: string | number | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const label = (
    <span className="text-neutral-600">
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name={field.name}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        {label}
      </label>
    );
  }

  const control = (() => {
    if (field.readOnly) {
      return (
        <div className={`${inputCls} bg-neutral-50 text-neutral-500`}>
          {String(value) || "—"}
          {/* still submit nothing — read-only fields are skipped server-side */}
        </div>
      );
    }
    if (field.type === "textarea") {
      return (
        <textarea
          name={field.name}
          required={field.required}
          rows={4}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      );
    }
    if (field.type === "select") {
      return (
        <select
          name={field.name}
          required={field.required}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    const inputType = ["number", "date", "email", "tel"].includes(field.type)
      ? field.type
      : "text";
    return (
      <input
        type={inputType}
        name={field.name}
        value={String(value)}
        min={field.type === "date" ? (field.noPast ? todayInput() : undefined) : field.min}
        max={field.max}
        step={field.step}
        required={field.required}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    );
  })();

  return (
    <label className={`block text-sm ${field.full ? "sm:col-span-2" : ""}`}>
      {label}
      {control}
      {field.help && <span className="mt-0.5 block text-xs text-neutral-400">{field.help}</span>}
    </label>
  );
}

export default function RecordEditor({
  orgSlug,
  config,
  values,
  recordId,
  backHref,
}: {
  orgSlug: string;
  config: RecordEditorConfig;
  values: EditorValues;
  recordId: string;
  backHref: string;
}) {
  // Seed every field so React inputs stay controlled even if a value is absent.
  // The seed is kept as the pristine baseline for the unsaved-changes guard.
  const [initial] = useState<EditorValues>(() => {
    const seed: EditorValues = {};
    for (const f of config.fields) {
      const v = values[f.name];
      seed[f.name] = v ?? (f.type === "number" ? "" : f.type === "checkbox" ? false : "");
    }
    return seed;
  });
  const [state, setState] = useState<EditorValues>(initial);

  const router = useRouter();

  // Save runs the server action; on success we show "Saved — returning…" and
  // navigate client-side after a beat (a redirect inside the action would route
  // through the [org] loading fallback and blank the page). A failed write
  // surfaces its error inline and keeps the user's values.
  const [saveState, saveAction] = useActionState(updateRecordDetail, null);
  const saved = Boolean(saveState?.ok);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => router.push(backHref), 600);
    return () => clearTimeout(t);
  }, [saved, router, backHref]);

  // Unsaved-changes guard: warn on tab close / hard nav while edits are pending.
  // String-compare so a loaded number (e.g. likelihood 3) equals its form echo "3".
  const dirty = !saved && config.fields.some((f) => String(state[f.name]) !== String(initial[f.name]));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const aiFields = toAiFields(config.fields);
  const [aiState, runAi, aiPending] = useActionState(suggestRecordEdits, null);

  // Fill only the fields the model actually proposed; leave the rest as the user
  // has them. They review, then Save.
  useEffect(() => {
    const s = aiState?.suggestion;
    if (!s) return;
    setState((prev) => ({ ...prev, ...s }));
  }, [aiState]);

  const setField = (name: string, v: string | boolean) =>
    setState((prev) => ({ ...prev, [name]: v }));

  const askAi = () => {
    const fd = new FormData();
    fd.set("org", orgSlug);
    fd.set("aiRole", config.aiRole);
    fd.set("__aifields", JSON.stringify(aiFields));
    for (const f of aiFields) fd.set(f.name, String(state[f.name] ?? ""));
    runAi(fd);
  };

  return (
    <form action={saveAction} className="ae-card p-5 space-y-4">
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="table" value={config.table} />
      <input type="hidden" name="listPath" value={config.listPath} />
      <input type="hidden" name="__spec" value={JSON.stringify(toSpecLite(config.fields))} />

      {aiFields.length > 0 && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={askAi}
            disabled={aiPending}
            className="btn-ae-outline text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {aiPending && (
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border-2 border-neutral-300 border-t-neutral-600 animate-spin"
              />
            )}
            {aiPending ? "Thinking…" : "✨ AI suggest / auto-fill"}
          </button>
        </div>
      )}

      {aiState?.note && !aiState.error && (
        <p
          role="status"
          className="rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-800"
        >
          {aiState.demo ? "🛈 " : "✨ "}
          {aiState.note}
        </p>
      )}
      {aiState?.error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          {aiState.error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800"
        >
          Saved — returning…
        </p>
      )}
      {saveState && !saveState.ok && saveState.error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          Couldn&apos;t save — {saveState.error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {config.fields.map((f) => (
          <Field key={f.name} field={f} value={state[f.name]} onChange={(v) => setField(f.name, v)} />
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SaveButton saved={saved} />
        <Link
          href={backHref}
          onClick={(e) => {
            if (dirty && !window.confirm("Discard unsaved changes?")) e.preventDefault();
          }}
          className="btn-ae-outline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
