/** Error whose `code` is the stable string the agent panel and tests match. */
export function codedError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
