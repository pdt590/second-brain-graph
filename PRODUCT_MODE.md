# Product Mode

Product mode turns Second Brain into an isolated bundled product runtime.

It is intended for the standard offline installer shape:

```text
SecondBrain/
├─ app/
├─ runtime/
│  ├─ hermes/
│  └─ llm-wiki/
├─ config/
│  └─ product.env
├─ data/
└─ logs/
```

The installer can include Hermes and the initial `llm-wiki` directory in the package.
Installation does not need to download Hermes from the network. Network access is only needed at runtime when Hermes calls the configured cloud model provider.

The `runtime/` and `release/` directories are intentionally gitignored. Keep bundled Node, Hermes, Python wheels, and generated zips out of source control, then publish the generated zip as a GitHub Release artifact.

## Isolation

Set:

```env
SECOND_BRAIN_PRODUCT_MODE=1
SECOND_BRAIN_EMBEDDED_HERMES=1
```

In product mode the app:

- does not read the user's `~/.hermes/.env`
- does not parse the user's Hermes logs
- does not scan the user's default Hermes ports
- uses a private Hermes home
- uses a private `llm-wiki`
- stores auth and chat history under the product home

This keeps the bundled product separate from any Hermes installation already present on the machine.

## Private Paths

Unless overridden, product data lives in the platform app-data location:

- Windows: `%LOCALAPPDATA%\SecondBrain`
- macOS: `~/Library/Application Support/SecondBrain`
- Linux: `$XDG_DATA_HOME/second-brain` or `~/.local/share/second-brain`

Useful overrides:

```env
SECOND_BRAIN_PRODUCT_HOME=/absolute/path/to/SecondBrain
SECOND_BRAIN_RUNTIME_DIR=/absolute/path/to/runtime
SECOND_BRAIN_CONFIG_DIR=/absolute/path/to/config
SECOND_BRAIN_DATA_DIR=/absolute/path/to/data
SECOND_BRAIN_LOG_DIR=/absolute/path/to/logs
SECOND_BRAIN_WIKI_DIR=/absolute/path/to/llm-wiki
SECOND_BRAIN_HERMES_HOME=/absolute/path/to/hermes
```

## Bundled Hermes

By default the server looks for Hermes at:

```text
runtime/hermes/bin/hermes
runtime/hermes/bin/hermes.cmd
runtime/hermes/hermes
runtime/hermes/hermes/bin/hermes
```

On Windows native builds it checks the same paths with `hermes.exe`, `hermes.cmd`, and `hermes.bat`.

If the bundled layout is different:

```env
SECOND_BRAIN_HERMES_COMMAND=/absolute/path/to/hermes
SECOND_BRAIN_HERMES_ARGS=gateway run
```

The default private target is:

```env
HERMES_API_TARGET=http://127.0.0.1:18643
```

The first product-mode launch creates `config/product.env` under the product home and generates a private `API_SERVER_KEY` if one does not exist.

## Cloud Model Credentials

Hermes is bundled, but the model still runs in the cloud. The first-run UI or installer should write the user's model provider settings into the product-private Hermes config, not into the user's global `~/.hermes` directory.

## Windows Product Package

The Windows package is created with:

```bash
npm run package:windows-product
```

That command expects these offline runtime files to already exist:

```text
runtime/node/.../node.exe
runtime/hermes/bin/hermes.exe or runtime/hermes/bin/hermes.cmd
```

For development previews before the real runtime files are added:

```bash
node scripts/create-windows-product-package.mjs --allow-missing-runtime
```

The generated package is:

```text
release/second-brain-product-windows.zip
```

That zip is the artifact to attach to a GitHub Release. It should not be committed back into the repository.

The user-facing entrypoints inside the package are:

```text
Start-SecondBrain.cmd
Stop-SecondBrain.cmd
```
