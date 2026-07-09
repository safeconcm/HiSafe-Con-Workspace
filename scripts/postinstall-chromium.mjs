// scripts/postinstall-chromium.mjs
// Packages the Chromium binary (from the full @sparticuz/chromium devDependency,
// resolved at THIS build's install time) into public/chromium-pack.tar.
//
// Why: src/lib/pdf/render.ts uses @sparticuz/chromium-min at runtime, which
// downloads a pre-built Chromium tar instead of bundling the ~50MB binary in
// the function (Vercel's 250MB bundle limit). The first attempt at this
// pointed at a hardcoded old release (v123.0.1) hosted on Sparticuz's GitHub,
// which failed at runtime with "libnss3.so: cannot open shared object file" —
// Vercel's Node.js runtime base image has moved on since Chromium 123 was
// built, and the old binary's shared-library expectations no longer match.
//
// The fix (matching Vercel's own official template,
// https://github.com/gabenunez/puppeteer-on-vercel): self-host the pack by
// building it fresh on every install, from whatever @sparticuz/chromium
// version is actually pinned in package.json. That guarantees the binary
// always matches the version puppeteer-core expects, instead of drifting
// from an old external URL.
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = dirname(__dirname)

async function main() {
  try {
    console.log('[postinstall-chromium] resolving @sparticuz/chromium...')

    const chromiumResolvedPath = import.meta.resolve('@sparticuz/chromium')
    const chromiumPath = chromiumResolvedPath.replace(/^file:\/\//, '')
    // Package root is 3 levels up from build/esm/index.js
    const chromiumDir = dirname(dirname(dirname(chromiumPath)))
    const binDir = join(chromiumDir, 'bin')

    if (!existsSync(binDir)) {
      console.log('[postinstall-chromium] bin dir not found, skipping (fine for local dev without the devDependency installed)')
      return
    }

    const publicDir = join(projectRoot, 'public')
    const outputPath = join(publicDir, 'chromium-pack.tar')

    console.log('[postinstall-chromium] packaging', binDir, '->', outputPath)
    execSync(`mkdir -p "${publicDir}" && tar -cf "${outputPath}" -C "${binDir}" .`, {
      stdio: 'inherit',
      cwd: projectRoot,
    })

    console.log('[postinstall-chromium] done')
  } catch (err) {
    console.error('[postinstall-chromium] failed:', err.message)
    // Never fail the install over this — PDF generation would fall back to
    // the HTML response instead, which is degraded but not a hard outage.
    process.exit(0)
  }
}

main()
