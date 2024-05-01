# AnalogJS Language Tools

This is the AnalogJS Language Tools extension for VSCode, powered by [Volar](https://volarjs.dev). This project is in active development.

## Features

This extension provides an improved editing experience for Analog SFCs, including:

* Syntax highlighting
* Auto-importing (Future)
* Completions lists (Future)
* Quick info (Future)

## Supporting Analog

- Star the [GitHub Repo](https://github.com/analogjs/analog)
- Join the [Discord](https://chat.analogjs.org)
- Follow us on [Twitter](https://twitter.com/analogjs)
- Become a [Sponsor](https://analogjs.org/docs/sponsoring)

## Local Development

- Run `pnpm install` in this folder. This installs all necessary npm modules in both the client and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to compile the client and server.
- Switch to the Debug viewlet.
- Select `Launch Client` from the drop down.
- Run the launch config.
- If you want to debug the server as well use the launch configuration `Attach to Server`
- In the [Extension Development Host] instance of VSCode, open a `test.analog`
  - Type `<d|` to try HTML completion
  - Type `<style>.foo { c| }</style>` to try CSS completion
  - Have `<style>.foo { }</style>` to see CSS Diagnostics

## Build .vsix

- Run `pnpm run pack` in this folder
- `packages/vscode/vscode-analog-x.x.x.vsix` will be created, and you can manually install it to VSCode.

## References

- https://github.com/volarjs/starter
- https://code.visualstudio.com/api/language-extensions/embedded-languages
- https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-embedded-language-service
