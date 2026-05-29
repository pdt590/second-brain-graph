# Second Brain Windows Product Package

This is the offline Windows product package layout.

## Start

Double-click:

```text
Start-SecondBrain.cmd
```

It starts the bundled Node.js runtime, launches the bundled Hermes runtime, waits for the local server to become ready, and opens:

```text
http://127.0.0.1:3030
```

The first launch can take longer because the bundled Hermes runtime initializes its offline Python dependencies from `runtime\hermes\wheelhouse`.

If the launcher exits before the browser opens, check:

```text
launcher.log
logs\server.log
logs\hermes.log
```

## Stop

Double-click:

```text
Stop-SecondBrain.cmd
```

## Runtime Isolation

This package uses only local product directories:

```text
runtime/hermes
runtime/llm-wiki
config/product.env
data
logs
```

It does not use the user's existing Hermes installation or global `~/.hermes` configuration.

## Cloud Model

Hermes is bundled. The model still runs in the cloud, so cloud model credentials must be configured in the product-private Hermes config.
