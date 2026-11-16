import { vi } from "vitest"

/**
 * The suite runs with `isolate: false`: test files share a worker's module
 * registry. A file that `vi.mock`s a module and then imports its subject would
 * otherwise get the subject an earlier file already loaded, wired to that
 * file's mock (or to the real module). Clearing the registry before each file
 * gives every file the fresh graph isolation used to give it, without paying
 * for a new worker per file.
 */
vi.resetModules()
