export function consumeImagePublication() {
  return () => {};
}

export function settleImagePublication() {
  return Promise.resolve();
}

export function configureImagePublication() {}

export function withImagePublicationWrite(entries, writer) {
  return typeof writer === "function" ? writer() : Promise.resolve();
}
