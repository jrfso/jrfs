// Local
import type { FileType, FileTypeInfo, FileTypes } from "./types";

export abstract class FileTypeProvider<FT extends FileTypes<FT>> {
  /**
   * Returns the first {@link FileType<FT>} where {@link FileTypeInfo.end}
   * matches the end of the given `nameOrPath`.
   * @param nameOrPath File name or path.
   */
  abstract fromPath(nameOrPath: string): FileType<FT> | undefined;
  /** Gets file type info by name. */
  abstract get<K extends keyof FT & string>(
    typeName: K,
  ): FileType<FT, FT[K]["meta"]> | undefined;
  /** Sets file type info by name. */
  abstract set(typesByName: {
    [P in keyof FT]?: FileTypeInfo<FT[P]["meta"]>;
  }): this;
  /** Sets a single file type info by name. */
  abstract setOne<K extends keyof FT & string>(
    typeName: K,
    info: FileTypeInfo<FT[K]["meta"]>,
  ): this;
  /**
   * Validates if `value` matches type name `TN` schema registered in the
   * repository-typemap `FT`.
   * @template TN Type name.
   */
  abstract validate<TN extends keyof FT & string>(
    typeName: TN,
    value: unknown,
  ): value is FT[TN]["data"];
}
