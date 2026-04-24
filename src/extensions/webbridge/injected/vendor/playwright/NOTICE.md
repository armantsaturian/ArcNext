# Playwright — vendored injected scripts

Files in this directory originate from the [Playwright](https://github.com/microsoft/playwright) project,
© Microsoft Corporation, released under the Apache License, Version 2.0.

Source commit: `main` (fetched 2026-04-24)
Upstream paths:
- `ariaSnapshot.ts` → `packages/injected/src/ariaSnapshot.ts`
- `roleUtils.ts` → `packages/injected/src/roleUtils.ts`
- `domUtils.ts` → `packages/injected/src/domUtils.ts`
- `yaml.ts` → `packages/injected/src/yaml.ts`
- `ariaTypes.ts` → `packages/isomorphic/ariaSnapshot.ts` (trimmed: dropped YAML-dependent
  `parseAriaSnapshot`, `KeyParser`, `ParserError` — not needed for tree generation)
- `stringUtils.ts` → `packages/isomorphic/stringUtils.ts`
- `cssTokenizer.ts` → `packages/isomorphic/cssTokenizer.ts`

Modifications:
- Rewrote `@isomorphic/...` imports as relative paths
- Removed YAML parser support (we consume snapshots, not parse templates)
- Otherwise byte-for-byte copies; upstream license headers retained per file

License: Apache-2.0 (see LICENSE in this directory)
