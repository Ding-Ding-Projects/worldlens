# Local Ollama model workspace

The Ollama surface talks only to the local Ollama HTTP daemon. It checks runtime health, lists
installed models, refreshes the bounded model catalogue, queues model pulls with limited
parallelism, and keeps chat sessions locally. A chat stream is considered complete when Ollama
reports `done: true`; the transport also accepts a final JSON line without a trailing newline.

The new main-process integration keeps this same contract while adding an explicit loopback allowlist. Requests are restricted to `http://127.0.0.1`, `http://localhost` or `http://[::1]`, reject redirects, enforce response bounds and use timeouts. No cloud account, payment or arbitrary shell command is involved.

## Configuration

The default endpoint is Ollama's documented local address, `http://127.0.0.1:11434`. The app does
not silently substitute a hosted model service. Chat sessions are stored in browser storage under
the app's private key; installed models and the catalogue are re-read from Ollama rather than
pretending a stale cache is authoritative.

## Runtime and recovery

The application reports whether it is using a bundled runtime, a verified user-scoped managed runtime, or an unavailable runtime with an in-app automatic acquisition route. It never sends a user to a manual installation page. A runtime acquisition implementation must verify its pinned official source, digest, cancellation and post-install health probe before switching the active origin.

Progress and chat streams are cancelled when their terminal state is received or when the user presses Stop. An unreachable, slow, malformed, oversized, or cancelled request becomes a visible result with a recovery message rather than an unhandled rejection. A stalled stream is abandoned after its bounded per-chunk timeout. Prompts, model names, responses, and downloaded weights stay on the local endpoint. The transport does not log response bodies, does not send data to a cloud fallback, and bounds response growth. Deleting a model or chat is protected by the app's native super-confirmation flow.

## Failure modes

A malformed newline-delimited progress record is skipped so one bad heartbeat does not erase an
otherwise valid pull. A completed chat is not held hostage by a daemon that forgets to close its
connection. The original browser-storage cell remains available when saved state is corrupt or
too large, rather than being replaced with an empty value.

## Security considerations

Prompts, model names, responses, and downloaded weights stay on the local endpoint. The transport
does not log response bodies, does not send data to a cloud fallback, and bounds response growth.
Deleting a model or chat is protected by the app's native super-confirmation flow.

## Catalog and hardware fit

Catalog refresh follows every page, records page count, revision and timestamp, merges local installed tags and reports stale or offline state. A curated page is never presented as exhaustive. Hardware fit is evidence-backed: RAM, VRAM, free storage, blob size, context and backend are named beside one of Runs well, Runs with limits, Unlikely or Unknown.

## Models, chat and harnesses

The local surface supports health, version, installed and running tags, model metadata, pulls, deletes, copies, generation and streamed chat. Harness profiles use semantic executable and folder pickers, an allowlist, an explicit preview, a snapshot before mutation and rollback after a failed readiness check. Arguments reject shell syntax, and environment values are represented only by redacted key names.

Saved chat state is validated and bounded before it reaches the reactive screen. If the cell is
corrupt or too large, the app shows the read failure and refuses to write an empty replacement over
it; the original browser-storage cell remains available for recovery.

## Verification

`src/main/ollama/ollama.test.ts` proves exhaustive pagination, conservative hardware evidence, shell-syntax refusal and missing-runtime copy. `completeness.test.ts` deliberately removes rollback and page-following rows and verifies the negative regressions turn red before the complete inventory turns green. Existing UI tests prove already-aborted requests do not call fetch, final unterminated pull records are delivered, `done: true` stops a non-closing chat stream, oversized bodies are refused before reading, and malformed or oversized saved sessions fail closed.

Run the focused suite from `design/` with:

```text
pnpm exec vitest run packages/ui/src/components/ollama/ollamaApi.test.ts
```

Suggested articles: [Automatic updates](./automatic-updates.md), [Notification centre](./notification-centre.md), and [Local version history](./config-history.md).
