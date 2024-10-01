import { Maybe, Static, Type, define } from "jrfs/typebox";

/** Directory layout type-schema + */
export const DirModel = Type.Object(
  {
    /**
     * Map of path pattern to file type name, e.g. `"tables/*": "db-table"`.
     */
    of: Maybe(Type.Record(Type.String(), Type.String())),
  },
  define("DirModel"),
);

/** Directory layout type for any directory in a project. */
export interface DirModel extends Static<typeof DirModel> {}

export const DirDesign = Type.Object(
  {
    dir: DirModel,

    // CONSIDER: We can extend the design file here with more info beyond the
    // model itself. For instance, think designer state and other states.
  },
  define("DirDesign"),
);
export interface DirDesign extends Static<typeof DirDesign> {}

// NOTE: DirDesignMeta looks like DirModel RIGHT NOW, but it will be different.

/** Directory layout meta-type for any directory in a project. */
export interface DirDesignMeta {
  of?: Record<string, string>;
}
