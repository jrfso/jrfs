import type { TSchema } from "@sinclair/typebox";
import { TypeCheck, TypeCompiler } from "@sinclair/typebox/compiler";
// Local
import type { FileType, FileTypeInfo, FileTypes } from "@jrfs/core";
import { FileTypeProvider } from "@jrfs/core";

export class TypeboxFileTypes<
  FT extends FileTypes<FT>,
> extends FileTypeProvider<FT> {
  /** Map of file type key to compiled TypeBox schema validator. */
  #compiled = new Map<keyof FT & string, TypeCheck<TSchema>>();
  /** Map of file type key to file type details. */
  #types = new Map<keyof FT & string, FileType<FT>>();

  /**
   * Returns the first {@link FileType<FT>} where {@link FileTypeInfo.end}
   * matches the end of the given `nameOrPath`.
   * @param nameOrPath File name or path.
   */
  fromPath(nameOrPath: string): FileType<FT> | undefined {
    const types = this.#types;
    const keys = types.keys();
    // CONSIDER: Cache results with an LRU cache keyed by nameOrPath.
    for (const key of keys) {
      const fileType = types.get(key)!;
      if (nameOrPath.endsWith(fileType.end)) {
        return fileType;
      }
    }
    // CONSIDER: We could also check for other patterns such as parent dir name,
    // exact path, etc. but we need to register those in a new map, not #types.
    return undefined;
  }
  /** Gets file type info by name. */
  get<K extends keyof FT & string>(
    typeName: K,
  ): FileType<FT, FT[K]["meta"]> | undefined {
    const types = this.#types;
    return types.get(typeName) as FileType<FT, FT[K]["meta"]> | undefined;
  }
  /** Sets file type info by name. */
  set(typesByName: {
    [P in keyof FT]?: FileTypeInfo<FT[P]["meta"]>;
  }): this {
    const types = this.#types;
    for (const name in typesByName) {
      const info = typesByName[name];
      if (info) {
        types.set(name, {
          name,
          ...info,
        });
      }
    }
    return this;
  }
  /** Sets a single file type info by name. */
  setOne<K extends keyof FT & string>(
    typeName: K,
    info: FileTypeInfo<FT[K]["meta"]>,
  ): this {
    const types = this.#types;
    types.set(typeName, {
      name: typeName,
      ...info,
    });
    return this;
  }
  /**
   * Validates if `value` matches type name `TN` schema registered in the
   * repository-typemap `FT`.
   * @template TN Type name.
   */
  validate<TN extends keyof FT & string>(
    typeName: TN,
    value: unknown,
  ): value is FT[TN]["data"] {
    const types = this.#types;
    const compiled = this.#compiled;
    let compiler = compiled.get(typeName);
    if (!compiler) {
      // Compile and store
      const entry = types.get(typeName);
      if (!entry) {
        return false;
      }
      const { schema } = entry;
      if (!schema) {
        return false;
      }
      compiler = TypeCompiler.Compile(schema);
      compiled.set(typeName, compiler);
    }
    return compiler.Check(value);
  }
}
