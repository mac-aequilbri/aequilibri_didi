// FormData → plain object for recordWriter's Zod typecast layer.
// Skips Next's internal $ACTION_* fields and file inputs.

export function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v === "string") obj[k] = v;
  }
  return obj;
}
