import { customAlphabet } from "nanoid";

/**
 * Custom nanoid generator for our ProjectRepo.
 * See:
 * - https://zelark.github.io/nano-id-cc/
 * - https://github.com/ai/nanoid#custom-alphabet-or-size
 */
export const createShortId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  9,
);
