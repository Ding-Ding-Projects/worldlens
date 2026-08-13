# Local Ollama model workspace

## Behaviour

The Ollama surface talks only to the local Ollama HTTP daemon. It checks runtime health, lists
installed models, refreshes the bounded model catalogue, queues model pulls with limited
parallelism, and keeps chat sessions locally. A chat stream is considered complete when Ollama
reports `done: true`; the transport also accepts a final JSON line without a trailing newline.

Every request has a timeout and a response-size ceiling. A caller that has already cancelled a
request never opens the request at all. Progress and chat streams are cancelled when their
terminal state is received or when the user presses Stop.

## Configuration

The default endpoint is Ollama's documented local address, `http://127.0.0.1:11434`. The app does
not silently substitute a hosted model service. Chat sessions are stored in browser storage under
the app's private key; installed models and the catalogue are re-read from Ollama rather than
pretending a stale cache is authoritative.

Saved chat state is validated and bounded before it reaches the reactive screen. If the cell is
corrupt or too large, the app shows the read failure and refuses to write an empty replacement over
it; the original browser-storage cell remains available for recovery.

## Failure modes

An unreachable, slow, malformed, oversized, or cancelled request becomes a visible result with a
recovery message rather than an unhandled rejection. A stalled stream is abandoned after its
bounded per-chunk timeout. A malformed newline-delimited progress record is skipped so one bad
heartbeat does not erase an otherwise valid pull; a completed chat is not held hostage by a daemon
that forgets to close its connection.

## Security considerations

Prompts, model names, responses, and downloaded weights stay on the local endpoint. The transport
does not log response bodies, does not send data to a cloud fallback, and bounds response growth.
Deleting a model or chat is protected by the app's native super-confirmation flow.

## Verification

`ollamaApi.test.ts` proves already-aborted requests do not call the fetch implementation, final
unterminated pull records are delivered, `done: true` stops a non-closing chat stream, and an
advertised oversized body is refused before reading. `ollamaStore.test.ts` proves malformed and
oversized saved sessions fail closed while a complete session still reloads. Run the focused suite
from `design/` with:

```text
pnpm exec vitest run packages/ui/src/components/ollama/ollamaApi.test.ts
```

Suggested articles: [Automatic updates](./automatic-updates.md), [Notification centre](./notification-centre.md),
and [Local version history](./config-history.md).
