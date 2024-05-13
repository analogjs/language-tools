# Installation

## Visual Studio Code

AnalogJS Language Features can be added to Visual Studio Code by installing the [plugin](https://marketplace.visualstudio.com/items?itemName=AnalogJS.vscode-analog)

## Neovim

To get the language features working in Neovim some additional configuration is required.

### Install globally

```bash
npm install -g @analogjs/language-server
```

### Configure LSP

There are different ways you can set this up, the key aspect is that you will need to supply the path to the `typescript` folder for the project. This is an example configuration with Lua:

```lua
local lspconfig = require("lspconfig")
local configs = require("lspconfig.configs")
local root_patterns = { "angular.json", "nx.json" }
local node_modules_root = vim.fs.dirname(vim.fs.find(root_patterns, { upward = true })[1])
local project_root = require("lspconfig.util").root_pattern("angular.json", "nx.json")

if node_modules_root and project_root then
  local tsdkPath = node_modules_root .. "/node_modules/typescript/lib"

  if not configs.analog then
    configs.analog = {
      default_config = {
        cmd = {
          "analog-language-server",
          "--stdio",
        },
        init_options = {
          typescript = {
            tsdk = tsdkPath,
          },
        },
        name = "analog",
        filetypes = {
          "analog",
        },
        root_dir = project_root,
      },
    }
  end
end
```

You must then call the `setup` function on the `analog` config, e.g:

```lua
require("lspconfig").analog.setup({})
```

If you were using LazyVim, you might add it to your list of servers in `plugins/lsp.lua` instead of manually calling `setup()`.

### Configure Treesitter

For syntax highlighting you will also need to configure Treesitter. Currently Analog does not have its own treesitter parser, but the `vue` treesitter parser can be used as an alternative:

```lua
vim.filetype.add({
  extension = {
    agx = "agx",
    analog = "analog",
  },
})

vim.treesitter.language.register("vue", "analog")
```
