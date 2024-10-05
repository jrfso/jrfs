import { apply as applyPatch, rawReturn, makeCreator } from "mutative";

// #region Mutative

export { applyPatch, rawReturn };
/**
 * Creates patches to apply to a JS object. Creates new state from a base state.
 *
 * See [mutative.js](https://mutative.js.org/docs/api-reference/create)
 *
 * ```ts
 * createPatch(baseState,
 *   (draft) => unknown | Promise<unknown>
 * ) => unknown | Promise<unknown>;
 * ```
 *
 * ## Example
 *
 * ```ts
 * import { createPatch, rawReturn } from '@jrfs/core';
 *
 * const baseState = { foo: { bar: 'str' }, arr: [] };
 * const state = create(
 *   baseState,
 *   (draft) => {
 *     draft.foo.bar = 'str2';
 *     // or return { ...draft, foo:{bar:'str2'} };
 *     // or return rawReturn({ foo:{bar:'str2'}, arr:[] });
 *   },
 * );
 *
 * expect(state).toEqual({ foo: { bar: 'str2' }, arr: [] });
 * expect(state).not.toBe(baseState);
 * expect(state.foo).not.toBe(baseState.foo);
 * expect(state.arr).toBe(baseState.arr);
 * ```
 */
export const createPatch = makeCreator({
  enableAutoFreeze: true,
  enablePatches: true,
  strict: process.env.NODE_ENV === "development",
});
// #endregion
// #region createShortId

const ALPHANUMLOWER = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Default short id generator. Generates a short (9 char) id for use in a
 * JavaScript {@link Map}. Always check for collision with `yourMap.has(newId)`.
 * @example
 * // Create your own with nanoid and apply to
 * // Repository constructor options.
 * // - https://zelark.github.io/nano-id-cc/
 * // - https://github.com/ai/nanoid#custom-alphabet-or-size
 * import { customAlphabet } from "nanoid";
 * export const createShortId = customAlphabet(
 *   "0123456789abcdefghijklmnopqrstuvwxyz",
 *   9,
 * );
 */
export function createShortId(length: number = 9): string {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHANUMLOWER[Math.floor(Math.random() * ALPHANUMLOWER.length)];
  }
  return id;
}
export type CreateShortIdFunction = typeof createShortId;

// #endregion

/**
 * Deep `Object.freeze()`, works with Map and Set. From
 * [deep-freeze-es6](https://github.com/christophehurpeau/deep-freeze-es6)
 * and altered with speed enhancements. See comments for alterations.
 * @returns Returns the given value after freezing it. **When given
 * `undefined|null` (already frozen, built-in values) the same is returned.**
 *
 * - Removed function freezing behavior. NOTE: Add option for it if necessary.
 * - Added generic signature with readonly return type.
 */
export function deepFreeze<T = unknown>(
  obj: T,
  // CONSIDER: optFreezeFunctions = false,
): Readonly<T> {
  //
  // Freeze self
  //
  // - Change: Check if the root obj is frozen before freezing it.
  // - Change: Don't stop recursing frozen obj, descend into non-frozen props.
  // - Change: Early exit for frozen non-object/array types.
  //
  const unfrozen = !Object.isFrozen(obj);
  if (unfrozen) {
    if (obj instanceof Map) {
      obj.clear =
        obj.delete =
        obj.set =
          function () {
            throw new Error("map is read-only");
          };
    } else if (obj instanceof Set) {
      obj.add =
        obj.clear =
        obj.delete =
          function () {
            throw new Error("set is read-only");
          };
    }
    Object.freeze(obj);
  } else if (typeof obj !== "object") {
    // Early exit for frozen non-object/array types.
    return obj;
  }
  // Freeze props
  //
  // - Use for...in instead of Object.getOwnPropertyNames(obj).forEach(name=>
  // for a ~25% performance increase. No security needed for Object prototype
  // pollution since we're not setting properties with untrusted data here.
  //
  // - If the parent `obj` is `unfrozen`, descend recursively away! Otherwise,
  // check if the prop itself is unfrozen first. This is a good compromise
  // between descending infinitely into frozen objects vs not descending at all.
  // If we hit a frozen obj, we'll check it's direct children and stop if
  // they're all frozen already.
  //
  for (const name in obj) {
    const prop = obj[name];
    const type = typeof prop;
    if (
      // (type === "object" || (optFreezeFunctions && type === "function")) &&
      type === "object" &&
      (unfrozen || !Object.isFrozen(prop))
    ) {
      deepFreeze(prop /*, optFreezeFunctions*/);
    }
  }
  return obj;
}
