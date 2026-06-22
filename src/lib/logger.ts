// Minimal structured logger. Today it emits JSON lines to the console; swap the
// `emit` sink for Sentry/Datadog/etc. without touching any call site. Keeping
// one chokepoint is the point — observability wiring becomes a one-file change.

type Level = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

function emit(level: Level, message: string, fields?: LogFields) {
  const line = JSON.stringify({ level, message, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
};

/** Normalise an unknown thrown value into structured log fields. */
export function errMeta(err: unknown): LogFields {
  if (err instanceof Error) return { error: err.message, stack: err.stack };
  return { error: String(err) };
}
