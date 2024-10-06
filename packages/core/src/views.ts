import { Entry, FileTypes } from "@/types";

export interface RepositoryViewOptions<
  FT extends FileTypes<FT> = FileTypes<any>,
> {
  /** Delay in milliseconds to load matching file data when `load:"delay"`. */
  delay?: number;
  /** Proactively load matching file data after a `delay` or on `open`. */
  load?: "delay" | "open";
  /** Path pattern with wildcards or matching function. */
  match?: string | ((entry: unknown) => boolean);
  /** Registered JSON file type to match. */
  type?: FT;
  /**
   * Refresh view when `all` matching file data is available, whenever `any`
   * matching file data becomes available OR whenever the matching file
   * `listing` changes.
   */
  when: "all" | "any" | "listing";
}
/** Function to generate data from file or listing data. */
export interface RepositoryView<
  RV extends keyof RepositoryViews = keyof RepositoryViews,
  FT extends FileTypes<FT> = FileTypes<any>,
> {
  (
    matches: Array<{
      entry: Entry;
      data: unknown;
    }>,
  ): RepositoryViews[RV] | Promise<RepositoryViews[RV]>;
}

/** Interface to declare RespositoryView data types onto. */
export interface RepositoryViews {
  // e.g. files: number;
  // or designs: [{id:"f123",name:"standard.dsgn.json"},{...}]
  // or targets: {standard:"f123",modern:"f234",legacy:"f345"}
  test: string;
}

export function registerRepositoryView<
  RV extends keyof RepositoryViews = keyof RepositoryViews,
  FT extends FileTypes<FT> = FileTypes<any>,
>(
  name: RV,
  view: RepositoryView<RV>,
  options?: Partial<RepositoryViewOptions<FT>>,
) {
  // TODO: Register the view with the repository and call it when it matches...
  return {
    name,
    view,
    options: {
      when: options?.when ?? "any",
      ...options,
    } satisfies RepositoryViewOptions<FT>,
  };
}
