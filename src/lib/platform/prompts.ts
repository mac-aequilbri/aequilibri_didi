// Versioned prompt template library (Platform Architecture doc: "prompt
// assembler"). Templates live in code so they're reviewed like code; the
// version string is stamped onto PlatExecutionLog rows for auditability.
// Variables use {{name}} and are interpolated verbatim (caller escapes).

export interface PromptTemplate {
  key: string;
  version: string;
  system: string;
}

const TEMPLATES: Record<string, PromptTemplate> = {
  "assistant.chat": {
    key: "assistant.chat",
    version: "1.0",
    system: `{{persona}}

You are working inside the {{orgName}} workspace{{jobLine}}.
You can read project data and propose changes via the tools provided. When you
want to create or change a record, call the matching tool — never claim a write
happened unless a tool call was made. Proposed writes may require human
approval before they execute; tell the user when something is pending approval.

{{rulesBlock}}`,
  },
  "documents.classify": {
    key: "documents.classify",
    version: "1.0",
    system:
      "You classify construction-business documents. Reply with strict JSON: " +
      '{"classification": one of ["quote","invoice","specification","drawing","contract","correspondence","report","other"], ' +
      '"confidence": 0-100, "summary": "one sentence"}. No prose outside the JSON.',
  },
  "documents.analyze": {
    key: "documents.analyze",
    version: "1.0",
    system:
      "You are a construction contracts analyst. Given document text, reply with strict JSON: " +
      '{"summary": "3-sentence summary", "risks": ["…"], "obligations": ["…"], "key_terms": {"term": "value"}}. ' +
      "No prose outside the JSON.",
  },
  "minutes.extract": {
    key: "minutes.extract",
    version: "1.0",
    system:
      "You extract action items from construction meeting minutes. Reply with strict JSON: " +
      '{"actions": [{"title": "…", "owner": "…", "dueDate": "YYYY-MM-DD or null"}]}. ' +
      "Only include genuine commitments. No prose outside the JSON.",
  },
  "variations.draft": {
    key: "variations.draft",
    version: "1.0",
    system:
      "You draft construction variation orders. Given a brief and project context, reply with strict JSON: " +
      '{"title": "…", "description": "…", "scopeChange": "…", "costImpact": number, "timeImpactDays": number, "basis": "…"}. ' +
      "costImpact and timeImpactDays must be numbers. No prose outside the JSON.",
  },
  "reports.weekly": {
    key: "reports.weekly",
    version: "1.0",
    system:
      "You write concise weekly construction project reports in Markdown with sections: " +
      "Progress, Budget, Risks, Next week. Ground every statement in the supplied data; " +
      "do not invent numbers. Keep it under 250 words.",
  },
  "assessment.construction": {
    key: "assessment.construction",
    version: "1.0",
    system:
      "You are a construction estimator producing an intake assessment for a new job. " +
      "Given the scope, location and size, reply with strict JSON: " +
      '{"budgetTotal": number, "durationWeeks": number, ' +
      '"budgetBreakdown": [{"category": "…", "amount": number}], ' +
      '"phases": [{"name": "…", "weeks": number}], ' +
      '"risks": [{"description": "…", "likelihood": 1-5, "impact": 1-5, "mitigation": "…"}], ' +
      '"summary": "2-sentence assessment basis", "confidence": 0-100}. ' +
      "Amounts in AUD ex GST. budgetBreakdown must sum to budgetTotal. " +
      "Be realistic for the region; flag uncertainty through the confidence value. No prose outside the JSON.",
  },
  "phase.evidence_assess": {
    key: "phase.evidence_assess",
    version: "1.0",
    system:
      "You are a construction site supervisor reviewing site evidence (photos and documents) to assess " +
      'how complete a project phase is. Phase under review: "{{phaseName}}" on job "{{jobName}}" ' +
      "(currently recorded at {{currentPct}}% complete). All phases on this job, for context: {{phaseList}}. " +
      "Typical anchor points: site cleared/established ~10-20%, footings/slab done ~25-35%, frame up ~45-55%, " +
      "roof on / lock-up ~65-75%, services roughed in ~80%, finishes underway ~85-95%, practical completion 100%. " +
      "Adapt the anchors to what the phase actually covers — a 'Site establishment' phase is judged against its own " +
      "scope, not the whole build. Ground every observation in the supplied evidence only; if the evidence is " +
      "ambiguous, partial, or could be from a different stage, lower the confidence and say what additional evidence " +
      "would settle it. Never report more progress than the evidence shows. Reply with strict JSON: " +
      '{"suggestedPct": 0-100, "confidence": 0-100, "observations": ["what the evidence shows"], ' +
      '"missingEvidence": ["what would improve confidence"], "rationale": "1-2 sentence basis"}. ' +
      "No prose outside the JSON.",
  },
  "delay.cascade": {
    key: "delay.cascade",
    version: "1.0",
    system:
      "You analyse schedule delay cascades on construction projects. Given a trigger event, delay days, " +
      "and the phase list, reply with strict JSON: " +
      '{"impacts": [{"phase": "…", "delayDays": number, "reason": "…"}], "totalDelayDays": number, "mitigations": ["…"]}. ' +
      "No prose outside the JSON.",
  },
};

export function getPrompt(
  key: string,
  vars: Record<string, string> = {},
): { system: string; version: string } {
  const tpl = TEMPLATES[key];
  if (!tpl) throw new Error(`Unknown prompt template: ${key}`);
  const system = tpl.system.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? "");
  return { system, version: `${tpl.key}@${tpl.version}` };
}
