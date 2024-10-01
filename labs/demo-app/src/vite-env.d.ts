/// <reference types="vite/client" />
/// <reference types="mdx" />
import "react";

// #region Custom `import.meta.env` type augmentation.
//
// - See https://vitejs.dev/guide/env-and-mode.html
// - Go to definition of `ImportMetaEnv` to see the base type.
//
interface ImportMetaEnv {
  readonly VITE_STRICTMODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
// #endregion

// interface Window {
//   yada: Yada;
// }

declare module "react" {
  interface CSSProperties {
    /**
     * Allow CSS Variables
     * - https://stackoverflow.com/questions/52005083/how-to-define-css-variables-in-style-attribute-in-react-and-typescript/70398145#70398145
     */
    [key: `--${string}`]: string | number;
  }
}
