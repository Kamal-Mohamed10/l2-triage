import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Node loader hook: appends `.js` to relative specifiers that omit an
 * extension, mirroring Vite's resolution so the same source runs in both.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    const parentURL = context.parentURL ?? pathToFileURL(process.cwd() + '/').href
    const candidate = new URL(specifier + '.js', parentURL)
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate.href, shortCircuit: true, format: 'module' }
    }
  }
  return nextResolve(specifier, context)
}
