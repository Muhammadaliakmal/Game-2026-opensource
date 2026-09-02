/**
 * Match codes.
 *
 * Six characters from an alphabet with no 0/O, 1/I/L or 5/S in it: a code's
 * whole job is to survive being read aloud or typed from a screenshot, and
 * every ambiguous glyph is a match somebody cannot join.
 */
const ALPHABET = "ABCDEFGHJKMNPQRTUVWXY2346789";
export const CODE_LENGTH = 6;

export function makeMatchCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Codes are compared upper-case, so a typed lower-case one still finds the room. */
export function normalizeMatchCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

export function isMatchCode(input: string): boolean {
  const code = normalizeMatchCode(input);
  return (
    code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))
  );
}
