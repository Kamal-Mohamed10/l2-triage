/**
 * Minimal Node ESM resolver hook so app source files (written for Vite, which
 * resolves extensionless imports) can be imported directly under `node --test`
 * without a bundler. Not used by the app itself.
 */
import { register } from 'node:module'

register(new URL('./extension-resolver-impl.mjs', import.meta.url))
