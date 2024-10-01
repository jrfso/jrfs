/** @type {import("eslint").Linter.BaseConfig} */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["/dist/", "/tmp/", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    "prefer-const": "warn",
    "@typescript-eslint/ban-types": [
      "warn",
      {
        // See https://github.com/typescript-eslint/typescript-eslint/issues/2063#issuecomment-675156492
        extendDefaults: true,
        types: {
          "{}": false,
        },
      },
    ],
    "@typescript-eslint/explicit-function-return-type": "off",
    // "@typescript-eslint/naming-convention": "warn",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-namespace": "off",
    // "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-use-before-define": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        /** Allow all unused args. */
        argsIgnorePattern: ".",
        /** Allow unused vars that start with an underscore. */
        varsIgnorePattern: "^_",
      },
    ],
    // "@typescript-eslint/no-var-requires": "off",
    // "react-hooks/exhaustive-deps": "off",
    // "react-hooks/exhaustive-deps": [
    // //
    // // See the following issues
    // // - https://github.com/facebook/react/issues/29786
    // // - https://github.com/facebook/react/issues/14920#issuecomment-471070149
    // // - https://github.com/facebook/react/issues/16873
    // //
    //   "warn",
    //   {
    //     additionalHooks: "(useThing|useYada)",
    //   },
    // ],
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
  },
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
};
