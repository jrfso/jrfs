import { customAlphabet } from "nanoid";
/**
 * Generates a short (9 char) id for use in a JavaScript {@link Map}.
 *
 * **See**:
 * - https://zelark.github.io/nano-id-cc/
 * - https://github.com/ai/nanoid#custom-alphabet-or-size
 *
 * **Notes**:
 * - Simply re-generate on collision, by checking if `ourMap.has(newId)`.
 */
export const createShortId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  9,
);
