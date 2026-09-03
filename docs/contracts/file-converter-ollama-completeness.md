# File converter and Ollama completeness inventory

This is a hand-written inventory for the desktop surface. It is deliberately not generated from the features already discovered.

| Contract | Implementation | Focused proof | Evidence state |
| --- | --- | --- | --- |
| Eight converter categories | `packages/app/src/main/converter/registry.ts` and `packages/ui/src/components/converter/ConverterScreen.vue` | `registry.test.ts`, `ConverterScreen.test.ts` | verified by focused tests, built-artifact capture pending |
| Byte-signature detection | `registry.ts` | `registry.test.ts` | verified by focused tests |
| Disabled exact adapter reasons | `registry.ts` and converter screen | `registry.test.ts` | verified by focused tests |
| Durable bounded queue | `queue.ts` and converter screen | `queue.test.ts` | verified by focused tests |
| PDF operations | `operations.ts`, bundled `pdf-lib` | `operations.test.ts` | verified by focused tests and package dependency |
| Local Ollama API | `packages/app/src/main/ollama/client.ts` and `ipc.ts`, `packages/ui/src/components/ollama/OllamaScreen.vue` | `ollama.test.ts`, existing UI API tests | typed main bridge and packaged renderer built, live service smoke pending |
| Exhaustive catalog facts | `catalog.ts` | `ollama.test.ts` and `completeness.test.ts` | verified by paginated fixture, official catalog refresh pending |
| Evidence-backed fit | `hardwareFit.ts` | `ollama.test.ts` | verified by focused tests |
| Allowlisted harness and rollback inventory | `harness.ts` | `completeness.test.ts` | negative regression verified |
| Inline adjustable result controls | palette control model plus converter/Ollama surface | UI build and headless smoke | pending parent integration smoke |
| Narrow/high-scale and accessibility | converter screen responsive styles and Vuetify controls | UI smoke matrix | pending parent integration smoke |
