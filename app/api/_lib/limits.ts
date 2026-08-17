// See MF-V-01-DUZELTME-PLANI-1.0.9.md 1.7. server.mjs already caps total
// request body size at 1MB; this covers the specific data: URI fields
// (settings.logo, profile.avatar) that are the largest single values a
// user can submit.
const MAX_IMAGE_BYTES = 512 * 1024;
const DATA_URI_PATTERN = /^data:image\/(png|jpeg|webp|svg\+xml);base64,([a-zA-Z0-9+/]+={0,2})$/;

export function isDataUriWithinLimit(value: string, maxBytes: number = MAX_IMAGE_BYTES): boolean {
  const match = DATA_URI_PATTERN.exec(value);
  if (!match) return false;
  const base64 = match[2];
  // Decoded byte length from base64 length, without actually decoding.
  const decodedBytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  return decodedBytes <= maxBytes;
}
