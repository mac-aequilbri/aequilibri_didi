"use client";

// Multi-step wrapper for one long <form>. Steps stay MOUNTED (hidden, not
// unmounted) so uncontrolled field values persist and all post on the final
// submit — no data-model or server-action changes. "Continue" runs native
// constraint validation on the current step's controls (reportValidity), so a
// user can't advance past an invalid step and the final submit can never trip
// over an invalid hidden field.

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function FormStepper({
  steps,
  submit,
}: {
  steps: { title: string; body: ReactNode }[];
  submit: ReactNode;
}) {
  const [step, setStep] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  const validate = (i: number): boolean => {
    const wrap = refs.current[i];
    if (!wrap) return true;
    const controls = wrap.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea",
    );
    for (const c of controls) {
      if (!c.checkValidity()) {
        c.reportValidity();
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validate(step)) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Form steps">
        {steps.map((s, i) => {
          const state = i === step ? "current" : i < step ? "done" : "todo";
          return (
            <li key={s.title} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                aria-current={state === "current" ? "step" : undefined}
                className={`flex items-center gap-2 ${i < step ? "cursor-pointer hover:underline" : ""}`}
              >
                <span
                  aria-hidden
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    state === "current"
                      ? "bg-ae-space text-white"
                      : state === "done"
                        ? "bg-ae-success-bg text-ae-success"
                        : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={state === "current" ? "font-semibold" : "text-neutral-500"}>
                  {s.title}
                </span>
              </button>
              {i < steps.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      {steps.map((s, i) => (
        <div
          key={s.title}
          ref={(el) => {
            refs.current[i] = el;
          }}
          hidden={i !== step}
        >
          {s.body}
        </div>
      ))}

      <div className="flex items-center gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            <span className="inline-flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back
            </span>
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button variant="primary" onClick={next}>
            <span className="inline-flex items-center gap-1">
              Continue <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          </Button>
        ) : (
          submit
        )}
      </div>
    </div>
  );
}
