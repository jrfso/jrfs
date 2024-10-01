# JRFS Labs

JRFS labs are where we cook up various scenarios to apply JRFS.

Each lab can be an NPM package and/or a folder containing sample files to edit.

## Contributing

### NPM Workspace

Packages in this folder are workspaces in the root NPM package. Their
dependencies will go into the root `node_modules/` folder unless they conflict
with a root dependency.

#### VS Code Workspace

To add your lab folder to the VS Code workspace, edit the
`/jrfs.code-workspace` file and add a new `folders` path. Please using the
common pattern for setting the `name` field, e.g. `[lab] name/path`, e.g.:

```json
{
  "name": "[lab] yada[/subpath]",
  "path": "labs/yada[/subpath]",
},
```
