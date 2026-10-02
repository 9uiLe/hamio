# hamio 0.2.0 — release notes draft

**Draft only. 0.2.0 has not been published.**

hamio now accepts semantic Presentation Protocol v2 from Shell, AI agents, and applications. It renders the same Presentation State to a live Terminal and self-contained HTML. Completed runs can be recorded as accepted Events and replayed into an HTML Report. Form remains an independent Interaction capability.

## Changes

- `hamio presentation static`, `live`, and `capabilities` provide an explicit cross-language v2 entry point. The producer owns business results; hamio owns presentation and validation.
- Terminal output handles TTY and pipes, width, no color, and motion policy. HTML includes responsive Light/Dark representation, native structure, reduced motion, print, and forced-colors support.
- `presentation live --record FILE` saves accepted Events in Recording v1. `presentation report --input FILE --output FILE` replays with the same Session and writes one self-contained HTML file. Recording complete/partial/invalid is independent of Run success/failure/cancellation.
- `hamio form` remains available with Form `apiVersion: 1`.

## Breaking changes from v0.1.0

The v1 `render`, `stream`, and root `capabilities` commands and their Block/DisplayDefinition JSON are removed. There is no automatic compatibility translation. Use the [migration guide](migration-v1-to-presentation-v2.md) to convert commands and semantics. Presentation `protocolVersion: 2`, Recording `recordingVersion: 1`, and Form `apiVersion: 1` are independent of product 0.2.0.

## Candidate environments and limits

The intended release assets target macOS 15 arm64 and Ubuntu 24.04 x64/arm64 (glibc), with Bun bundled. Older OS versions, Intel Mac, Windows, musl, and every terminal/browser combination are not covered. The candidate's actual verification and remaining risks are recorded in [0.2.0 readiness](release-readiness-v0.2.0.md). This draft does not claim that release publication or consumer install verification has occurred.
