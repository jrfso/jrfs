# JRFS Demo App

JRFS demo frontend app.

## React + TypeScript + Vite

This package was created with [Vite](https://vitejs.dev/).

Of the available official plugins, we are using `@vitejs/plugin-react`:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md)
  uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc)
  uses [SWC](https://swc.rs/) for Fast Refresh

### Expanding the ESLint configuration

If you are developing a production application, we recommend updating the
configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default {
  // other rules...
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: ["./tsconfig.json", "./tsconfig.node.json"],
    tsconfigRootDir: __dirname,
  },
};
```

- Replace `plugin:@typescript-eslint/recommended` to
  `plugin:@typescript-eslint/recommended-type-checked` or
  `plugin:@typescript-eslint/strict-type-checked`
- Optionally add `plugin:@typescript-eslint/stylistic-type-checked`
- Install
  [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and
  add `plugin:react/recommended` & `plugin:react/jsx-runtime` to the `extends`
  list

## Using [MDX](https://mdxjs.com/)

See:

- [What is MDX?](https://mdxjs.com/docs/what-is-mdx/)
- [github.com/mdx-js/mdx](https://github.com/mdx-js/mdx/)
- [Getting started with Vite](https://mdxjs.com/docs/getting-started/#vite)
  - Install [@mdx-js/rollup](https://www.npmjs.com/package/@mdx-js/rollup) and
    configure in `vite.config.ts`, e.g.
    `plugins: [{ enforce: "pre", ...mdx() }, react(),]`
  - Missing steps! Here they are:
    - Install `@types/mdx`
    - Add `/// <reference types="mdx" />` to the top of your `vite-env.d.ts`.
- [Install the VS Code MDX Extension](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx)
  - Added recommended settings to local project `.vscode/settings.json`,
    commenting out the `.md` and `markdown` extension and validate entries.
- Integrate with eslint
  - Install [eslint-plugin-mdx](https://www.npmjs.com/package/eslint-plugin-mdx)
  - Add the following overrides [0] to your eslint config. See:
    - [github docs](https://github.com/mdx-js/eslint-mdx?tab=readme-ov-file#classic)

<details>
  <summary>[0] ESLint overrides.</summary>
```js
overrides: [
  {
    files: ["**/*.{md,mdx}"],
    extends: ["plugin:mdx/recommended"],
    parser: "eslint-mdx",
    parserOptions: {
      project: "./tsconfig.json",
      ecmaFeatures: {
        jsx: true,
      },
      ecmaVersion: 12,
      sourceType: "module",
      extraFileExtensions: [".mdx"],
      extensions: [".mdx"],
    },
    // optional, if you want to lint code blocks at the same time
    settings: {
      "mdx/code-blocks": true,
      // optional, if you want to disable language mapper, set it to `false`
      // if you want to override the default language mapper inside, you can provide your own
      "mdx/language-mapper": {},
    },
  },
],
```
</details>

### Advanced MDX examples and notes

- [A Vite and react setup to generate blog pages from MDX files](https://github.com/cm-ayf/vite-mdx)
  - Demonstrates using Vite's `import.meta.glob` to import files dynamically.
  - Check out the frontmatter system that it's also using....
    - https://github.com/remarkjs/remark-frontmatter
    - https://github.com/remcohaszing/remark-mdx-frontmatter

## Using [Unified.js](https://unifiedjs.com/) tools

[github.com/unifiedjs/unified](https://github.com/unifiedjs/unified#readme)

Tools based on unified

- Markdown - [Remark](https://github.com/remarkjs/remark)
- HTML - [Rehype](https://github.com/rehypejs/rehype)
- Text - [Retext](https://github.com/retextjs/retext)

Ways to use them

- [Remark Plugins](https://github.com/remarkjs/remark/blob/main/doc/plugins.md#list-of-plugins)
- [Rehype React](https://github.com/rehypejs/rehype-react)
  - [Custom plugin example](https://github.com/rehypejs/rehype-external-links)
- [React Remark](https://github.com/remarkjs/react-remark)
- [React Markdown](https://github.com/remarkjs/react-markdown#readme)
