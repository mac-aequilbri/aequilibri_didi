// Submit buttons for the assessment screens. Both server actions take a few
// seconds (run: geocode → AI → learning rules; accept: job + phases + budget +
// risks + corrections), so while the form is pending the button disables and
// the card is overlaid with a construction-themed loader — a house assembling
// itself (slab → brick courses → roof → window → door) — plus cycling status
// lines that mirror the real pipeline.
"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

// One appear-offset (% of the cycle) per house part, in build order.
const PART_OFFSETS = [2, 14, 26, 40, 54, 64];
const CYCLE = "4.2s";
const PART_KEYFRAMES = PART_OFFSETS.map(
  (p, i) =>
    `@keyframes ae-bp-${i}{0%,${p}%{opacity:0;transform:translateY(-7px)}${p + 6}%,88%{opacity:1;transform:translateY(0)}96%,100%{opacity:0;transform:translateY(0)}}`,
).join("\n");

function part(i: number): React.CSSProperties {
  return { animation: `ae-bp-${i} ${CYCLE} ease-out infinite`, opacity: 0 };
}

function HouseBuildLoader() {
  return (
    <svg viewBox="0 0 120 100" className="w-28 h-24" aria-hidden="true">
      <style>{PART_KEYFRAMES}</style>
      {/* ground */}
      <line x1="12" y1="90" x2="108" y2="90" stroke="#d4d4d4" strokeWidth="2" />
      {/* slab */}
      <rect x="30" y="84" width="60" height="6" rx="1" fill="#9ca3af" style={part(0)} />
      {/* brick courses */}
      <rect x="33" y="71" width="54" height="13" fill="#d8b59c" style={part(1)} />
      <rect x="33" y="58" width="54" height="13" fill="#cfa183" style={part(2)} />
      {/* roof */}
      <polygon points="28,58 92,58 60,34" fill="var(--ae-space, #b06b4f)" style={part(3)} />
      {/* window */}
      <rect x="40" y="63" width="11" height="9" rx="1" fill="#fff" stroke="#8c6750" style={part(4)} />
      {/* door */}
      <rect x="62" y="67" width="12" height="17" rx="1" fill="#8c6750" style={part(5)} />
    </svg>
  );
}

function StageTicker({ stages }: { stages: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % stages.length), 2200);
    return () => clearInterval(t);
  }, [stages.length]);
  return (
    <p className="text-sm text-neutral-600 mt-1" aria-live="polite">
      {stages[i]}
    </p>
  );
}

// Submit button + pending overlay. The overlay is position:absolute, so it
// fills the nearest positioned ancestor — give the form (or its card) the
// `relative` class. Exported so other slow server-action forms (e.g. customer
// provisioning, which creates an Airtable base) reuse the same loader.
export function PendingSubmitButton({
  label,
  pendingTitle,
  stages,
}: {
  label: string;
  pendingTitle: string;
  stages: string[];
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" disabled={pending} className="btn-ae disabled:opacity-50">
        {pending ? `${pendingTitle}…` : label}
      </button>
      {pending && (
        <div className="absolute inset-0 z-10 rounded-[inherit] bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center">
          <HouseBuildLoader />
          <p className="font-semibold text-sm mt-2">{pendingTitle}</p>
          <StageTicker stages={stages} />
        </div>
      )}
    </>
  );
}

export function RunAssessmentButton() {
  return (
    <PendingSubmitButton
      label="Run assessment"
      pendingTitle="Running assessment"
      stages={[
        "Surveying the site…",
        "Walking the source cascade…",
        "Estimating budget & duration…",
        "Sequencing the phases…",
        "Applying learning rules…",
        "Compiling the assessment…",
      ]}
    />
  );
}

export function GenerateProposalButton() {
  return (
    <PendingSubmitButton
      label="Generate proposal"
      pendingTitle="Generating proposal"
      stages={[
        "Pricing the scope…",
        "Drafting the line items…",
        "Totalling the proposal…",
        "Preparing it to send…",
      ]}
    />
  );
}
