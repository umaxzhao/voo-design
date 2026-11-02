export const IMAGE_PUBLICATION_BINDING = Symbol("imagePublicationBinding");

export function carryImagePublication(source, target) {
  return target;
}

export function isImagePublicationBinding(value) {
  return false;
}
