import type { FileTypeInfo } from "jrfs/core";

/** File-types extended via `declare module` + */
export interface ProjectFileTypes {
  // myft: MyDesignFile;
}
/** A collection of registered project file-type specification objects. */
export const ProjectFileTypes: {
  [P in keyof ProjectFileTypes]: FileTypeInfo<ProjectFileTypes[P]["meta"]>;
} = {} as any;
