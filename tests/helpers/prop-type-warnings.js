import { format } from "node:util";

/** Keep React contract failures visible and fail the test that emitted them. */
export function watchPropTypeWarnings(consoleTarget = console) {
  const originalError = consoleTarget.error;
  const warnings = [];
  const error = (...args) => {
    const message = format(...args);
    if (message.startsWith("Warning: Failed prop type:")) warnings.push(message);
    originalError.apply(consoleTarget, args);
  };
  consoleTarget.error = error;
  return {
    takeWarnings: () => warnings.splice(0),
    restore: () => { consoleTarget.error = originalError; },
  };
}
