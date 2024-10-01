import { Maybe, Static, StringEnum, Type, define } from "@jrfs/typebox";
import type { FileOf, FileTypeInfo } from "@jrfs/core";
import { ProjectFileTypes } from "@/platform/project";
import { DirDesignMeta } from "@/platform/project/dir";
import { DbModelMysql } from "./mysql";

export const DbModelDialect = StringEnum(["mssql", "mysql", "pg", "sqlite"]);

export type DbModelDialect = Static<typeof DbModelDialect>;
/** Database model type-schema + */
export const DbModel = Type.Object(
  {
    name: Type.String(),
    dialect: Maybe(DbModelDialect),
    mysql: Maybe(DbModelMysql),
  },
  define("DbModel"),
);
/** Database model type. */
export interface DbModel extends Static<typeof DbModel> {}
/** Database design type-schema + */
export const DbDesign = Type.Object(
  {
    db: DbModel,

    // CONSIDER: We can extend the design file here with more info beyond the
    // model itself. For instance, think designer state and other states.
  },
  define("DbDesign"),
);
/** Database design type. */
export interface DbDesign extends Static<typeof DbDesign> {}

// #region File Type

/** Metadata of the DbDesign file type. */
export interface DbDesignFileMeta {
  /** Directory layout rules. */
  dir: DirDesignMeta;
}
/** DbDesign file type-spec + */
export const DbDesignFile: FileTypeInfo<DbDesignFileMeta> = {
  schema: DbDesign,
  desc: "Database design",
  end: ".db.json",
  meta: {
    dir: {
      of: {
        "tables/*": "db-table",
      },
    },
  },
};
/** DbDesign file-type data and file-type wide metadata type declaration. */
export type DbDesignFile = FileOf<DbDesign, DbDesignFileMeta>;

declare module "@/platform/project" {
  interface ProjectFileTypes {
    db: DbDesignFile;
  }
}
// Add our design file-type specifications to the global collection.
ProjectFileTypes.db = DbDesignFile;

// #endregion
