/**
 * Newsreader for the Friday letter (17) only: a letter is read, not scanned.
 * Loaded once, by group a: Turbopack fails the build when the same Google font
 * is loaded from two modules with different options.
 */
export { aNewsreader as letterSerif } from "../a/fonts"
