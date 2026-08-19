# JavaScript and ESM add-ons — issue #71

**Status: open; implementation and verification are not yet complete.**

This record defines the work required before Worldlens can make a JavaScript or ESM add-on
system a public integration surface. It is a planning and evidence document, not an API promise.
The current application has Java adapter JARs that load Java add-ons. It does not yet expose an
equivalent JavaScript/ESM add-on runtime for the TypeScript application. This status is inherited
from the imported `material-bluemap` history and its recovered continuation plan; the provenance
is context for the gap, not evidence that a runtime was ever shipped here.

## Current evidence

- `README.md` describes Java add-ons as being loaded by adapter JARs and identifies a JavaScript/
  ESM equivalent as planned.
- `packages/cli/src/config.ts` records the add-on system as a gap rather than a shipped feature.
- Issue #60 is already closed with its compatibility records and existing evidence. Those records
  classify JavaScript package entrypoints as stable only when explicitly exported; an add-on
  promise does not exist implicitly for internal source modules. Issue #71 is the separate,
  still-open implementation lane for the JavaScript/ESM add-on runtime.
- No packaged runtime evidence currently proves add-on discovery, installation, execution,
  capability consent, rollback, or failure isolation.

## Required public contract

Before implementation can be called complete, the project must publish a versioned add-on API
with named entrypoints and types, lifecycle hooks, declared capabilities, compatibility and
deprecation rules, and a clear distinction between stable, experimental, and internal surfaces.
The contract must specify how API versions are negotiated and how an incompatible add-on is
reported without weakening the host application.

## Runtime and management requirements

The add-on manager must provide a searchable local inventory and guided paths to discover,
install, enable, disable, update, and remove add-ons. Each record must retain package metadata,
the exact source/provenance, declared API version, requested capabilities, dependencies, and
current state. A user must be able to inspect the data and actions an add-on can reach before
granting consent.

Untrusted add-ons must execute in an isolated, least-privilege boundary. They must not receive
Electron/main-process privilege, arbitrary filesystem or network access, or credentials by
default. Capability consent must be explicit, reviewable, revocable, and enforced by the runtime,
not merely displayed by the manager.

Loading must be deterministic. The runtime needs dependency and conflict resolution, a documented
load order, per-add-on failure isolation, safe mode, rollback, and diagnostics for invalid
metadata, crashes, hangs, incompatible API versions, denied capabilities, and interrupted
upgrades. Typed hooks for renderer, server, commands, and markers may be exposed only where the
versioned contract remains stable.

## Evidence still required

The following evidence is intentionally **open** and is not claimed by this record:

| Evidence | State | Required proof |
| --- | --- | --- |
| API schema, types, lifecycle and compatibility reference | Not implemented | Versioned public entrypoint, types, migration and deprecation rules |
| Add-on manager | Not implemented | Built application can search and manage real local package records |
| Isolation and capability consent | Not implemented | Packaged runtime denies undeclared access and records explicit consent |
| Load order and failure isolation | Not implemented | Conflicts, dependency resolution, crashes, hangs, safe mode and rollback |
| Security and malformed-package handling | Not implemented | Invalid metadata/signatures, malicious package and credential-boundary cases |
| Offline and upgrade behavior | Not implemented | Offline management, update interruption and recovery evidence |
| Developer documentation and examples | Not implemented | Schema/types, packaging guidance and supported examples |
| Packaged runtime proof | Not run | Genuine installed artifact exercising the complete flow |

Tests, captures, and packaged-runtime verification are deliberately not run in this
documentation-only status pass. The issue stays open until the implementation and each evidence
row above are completed and reviewed.

## Related records

- [Public 1.0 compatibility contract](./README.md)
- [Public surface matrix](./public-surface-matrix.md)
- [API and reference](./api-reference.md)
- [Issue #71](https://github.com/Ding-Ding-Projects/worldlens/issues/71)

## 廣東話

Java adapter JAR 有自己嘅 addon loader，但 TypeScript app 仲未有 JavaScript/ESM addon
runtime。呢份文件只係講清楚要補嘅合約同證據，唔係扮已經完成：公開 API、lifecycle、
capability consent、sandbox、load order、dependency/conflict、safe mode、rollback、診斷、
developer docs 同 packaged runtime proof，全部仲係 open。等真正實作同驗證落地之後，先
可以將呢個 integration surface 寫成穩定承諾。
