/**
 * @file A base for TypeBox, a runtime type builder that creates in-memory Json
 *       Schema objects which infer as TypeScript types.
 */
import { Kind, Static, TSchema, Type, TypeRegistry } from "@sinclair/typebox";
import type {
  ArrayOptions,
  BigIntOptions,
  DateOptions,
  IntegerOptions,
  IntersectOptions,
  NumberOptions,
  ObjectOptions,
  RegExpOptions,
  SchemaOptions,
  StringOptions,
  Uint8ArrayOptions,
} from "@sinclair/typebox";

export type { Static, TSchema };
export { Type };

/** Alias for {@link Type.Optional}, e.g. `myprop?: string;` */
export function Maybe<T extends TSchema>(schema: T) {
  return Type.Optional(schema);
}
/** Alias for {@link Type.Union}, e.g. `myprop: T | null;` */
export function Nullable<T extends TSchema>(schema: T) {
  return Type.Union([schema, Type.Null()]);
}
/**
 * Allows creation of string enum, see
 * https://github.com/sinclairzx81/typebox#unsafe-types
 * and
 * https://github.com/sinclairzx81/typebox/issues/563
 * @example
 * const S = StringEnum(['A', 'B', 'C'])
 * // const S = { enum: ['A', 'B', 'C'] }
 * type S = Static<typeof T>
 * // type S = 'A' | 'B' | 'C'
 */
export function StringEnum<T extends string[]>(values: [...T]) {
  return Type.Unsafe<T[number]>({
    [Kind]: "StringEnum",
    type: "string",
    enum: values,
  });
}
TypeRegistry.Set("StringEnum", (schema: any, value) =>
  schema.enum.includes(value),
);

export interface KnownSchemaTypes {
  array: ArrayOptions;
  bigint: BigIntOptions;
  date: DateOptions;
  int: IntegerOptions;
  intersect: IntersectOptions;
  num: NumberOptions;
  obj: ObjectOptions;
  regx: RegExpOptions;
  str: StringOptions;
  uint8a: Uint8ArrayOptions;
}
export type KnownSchemaType = keyof KnownSchemaTypes;

/**
 * Defines the identity for a schema type.
 * @param $id Id of the `Object` schema.
 */
export function define($id: string): SchemaOptions;
/**
 * Defines the identity and options for an `Object` schema, by default.
 * @param $id Id of the `Object` schema.
 * @param options `Object` schema options.
 */
export function define($id: string, options?: ObjectOptions): ObjectOptions;
/**
 * Defines the identity and options for a known schema type.
 * @param $id Id of the schema.
 * @param type Type of known schema.
 * @param options Known schema type options.
 */
export function define<T extends KnownSchemaType>(
  $id: string,
  type: T,
  options?: KnownSchemaTypes[T],
): KnownSchemaTypes[T];
export function define<
  T extends KnownSchemaType = "obj",
  O = KnownSchemaTypes[T],
>($id: string, typeOrOptions?: T | O, options?: O): KnownSchemaTypes[T] {
  if (typeOrOptions && typeof typeOrOptions !== "string") {
    options = typeOrOptions;
  }
  return {
    $id,
    ...options,
  };
}
