// Local
import type {
  FileDataType,
  FileMetaType,
  FileTypeEntry,
  FileTypeInfo,
} from "./types";

export abstract class FileTypeProvider<FT> {
  /**
   * Returns the first {@link FileTypeEntry<FT>} where {@link FileTypeInfo.end}
   * matches the end of the given `nameOrPath`.
   * @param nameOrPath File name or path.
   */
  abstract fromPath(nameOrPath: string): FileTypeEntry<FT> | undefined;
  /** Gets file type info by name. */
  abstract get<T extends keyof FT & string>(
    typeName: T,
  ): FileTypeEntry<FT, T> | undefined;
  /** Sets file type info by name. */
  abstract set(typesByName: {
    [T in keyof FT]?: FileTypeInfo<FileMetaType<FT, T>>;
  }): this;
  /** Sets a single file type info by name. */
  abstract setOne<T extends keyof FT & string>(
    typeName: T,
    info: FileTypeInfo<FileMetaType<FT, T>>,
  ): this;
  /**
   * Validates if `value` matches type name `T` schema registered in the
   * repository-typemap `FT`.
   * @template T Type name.
   */
  abstract validate<T extends keyof FT & string>(
    typeName: T,
    value: unknown,
  ): value is FileDataType<FT, T>;
}
