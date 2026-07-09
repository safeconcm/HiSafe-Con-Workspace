// scripts/postinstall-chromium.mjs
// Copies the Chromium binary (from the full @sparticuz/chromium
// devDependency, resolved at THIS build's install time) into
// chromium-bin/ at the project root.
//
// History: src/lib/pdf/render.ts uses @sparticuz/chromium-min at runtime,
// which needs the Chromium binary from somewhere other than its own npm
// package (Vercel's 250MB function bundle limit rules out the full
// @sparticuz/chromium as a production dependency). The first two attempts at
// this fetched it over HTTP from this same deployment's own
// public/chromium-pack.tar at runtime — first from a hardcoded old external
// URL (broke: Chromium too old for Vercel's current runtime libraries),
// then self-hosted (broke: this project has Vercel Deployment Protection
// enabled, and the HTTP client @sparticuz/chromium-min uses internally,
// follow-redirects, doesn't retain the protection-bypass cookie across the
// redirect Vercel's bypass flow issues — confirmed via Vercel's own request
// logs showing a 303 on every attempt, on both the ephemeral per-deployment
// URL and the stable git-branch alias, while the exact same URL worked fine
// from a browser or mcp__workspace__web_fetch, which do retain cookies
// across redirects).
//
// This sidesteps the whole class of self-fetch/redirect/cookie problems:
// instead of downloading the binary over the network at runtime, it's
// copied into chromium-bin/ at build time and shipped inside the function's
// own bundle via next.config.ts's outputFileTracingIncludes. At runtime,
// chromium.executablePath() is given a local directory path (not a URL),
// which @sparticuz/chromium-min inflates directly from disk — no network
// call, no redirect, no protection interaction at all.
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, cpSync } from 'node:fs'

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

    const outputDir = join(projectRoot, 'chromium-bin')
    console.log('[postinstall-chromium] copying', binDir, '->', outputDir)

    mkdirSync(outputDir, { recursive: true })
    cpSync(binDir, outputDir, { recursive: true })

    console.log('[postinstall-chromium] done')
  } catch (err) {
    console.error('[postinstall-chromium] failed:', err.message)
    // Never fail the install over this — PDF generation would fall back to
    // the HTML response instead, which is degraded but not a hard outage.
    process.exit(0)
  }
}

main()
