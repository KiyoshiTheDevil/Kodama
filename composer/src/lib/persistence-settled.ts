// -- Boot-time settled signals ------------------------------------------------
//
// Module-scoped promises that resolve once boot-time writers finish their async
// work. URL-driven import hooks await `persistenceSettled` before mutating the
// project/audio stores, so persistence's restore never clobbers their writes.
//
// `hashImportSettled` mirrors the pattern for `useImportFromHash`: it resolves
// after `runImport` returns (success, failure, or skip). Tests await it to read
// the final stable state without arbitrary delays.
//
// Tests reset the singletons via the `__reset*` helpers so each test starts
// with a fresh pending promise.

let _markPersistenceSettled: () => void = () => {};
let persistenceSettled: Promise<void> = new Promise<void>((resolve) => {
  _markPersistenceSettled = resolve;
});

let _markHashImportSettled: () => void = () => {};
let hashImportSettled: Promise<void> = new Promise<void>((resolve) => {
  _markHashImportSettled = resolve;
});

function getPersistenceSettled(): Promise<void> {
  return persistenceSettled;
}

function markPersistenceSettled(): void {
  _markPersistenceSettled();
}

function getHashImportSettled(): Promise<void> {
  return hashImportSettled;
}

function markHashImportSettled(): void {
  _markHashImportSettled();
}

function __resetPersistenceSettledForTests(): void {
  persistenceSettled = new Promise<void>((resolve) => {
    _markPersistenceSettled = resolve;
  });
  hashImportSettled = new Promise<void>((resolve) => {
    _markHashImportSettled = resolve;
  });
}

// -- Exports ------------------------------------------------------------------

export {
  getPersistenceSettled,
  markPersistenceSettled,
  getHashImportSettled,
  markHashImportSettled,
  __resetPersistenceSettledForTests,
};
