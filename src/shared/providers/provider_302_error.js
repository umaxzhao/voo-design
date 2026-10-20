export class ProviderError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "ProviderError";
    this.code = code;
  }
}
