# Basilisk II (WebAssembly)

This directory contains the emulator core that powers macintosh.js.

## Provenance

`BasiliskII.js` and `BasiliskII.wasm` are the unmodified Emscripten build of
Basilisk II from **[Infinite Mac](https://infinitemac.org)** by
**Mihai Parparita** (https://github.com/mihaip/infinite-mac), vendored at
commit `edc74a11b39777bbc2748cdb00730faf2adce670`. Infinite Mac is licensed
under the Apache License 2.0 — see [`LICENSE-infinite-mac`](LICENSE-infinite-mac).

That build in turn descends from **Basilisk II** by Christian Bauer et al.
(GPLv2, see [`LICENSE.txt`](LICENSE.txt)) and the original Emscripten port by
**James Friend** (https://jamesfriend.com.au).

## Adapted code

`shared-buffers.js`, `key-codes.js`, and the `workerApi` contract implemented
in `BasiliskII-worker-boot.js` are derived from Infinite Mac's
`src/emulator/common/common.ts`, `src/emulator/common/key-codes.ts`, and
`src/emulator/worker/worker.ts` respectively. Each adapted file carries an
attribution header. The Electron-specific bits (Node `fs` disk I/O, extfs
host-folder sync, IPC ethernet bridge) are macintosh.js's own.

## Updating

To pull a newer build, copy `BasiliskII.js` and `BasiliskII.wasm` from
`infinite-mac/src/emulator/worker/emscripten/` and update the commit hash
above. If the `workerApi` surface has changed (grep `workerApi.` in the new
`BasiliskII.js`), adjust `BasiliskII-worker-boot.js` to match.
