// src/lib/pdf/render.ts
// Shared PDF renderer for Vercel serverless functions.
//
// Previously, the leave/timesheet PDF routes tried to POST HTML to a
// "WORKER_SERVICE_URL" microservice that was designed but never actually
// deployed (no such env var was ever set on Vercel — confirmed by checking
// the project's Environment Variables). Every request silently fell through
// to returning raw HTML instead of a real PDF.
//
// This replaces that with an in-process renderer using puppeteer-core +
// @sparticuz/chromium-min, the combination Vercel's own guide recommends for
// running headless Chrome inside a serverless function without blowing past
// the function bundle size limit:
// https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel
//
// The "-min" package doesn't bundle the ~50MB Chromium binary, so it has to
// come from somewhere else at runtime. This went through three attempts:
//   1. A hardcoded old external release (v123.0.1, Sparticuz's GitHub) —
//      failed with "libnss3.so: cannot open shared object file". That build
//      predates changes to Vercel's Node.js runtime base image.
//   2. Self-hosting the pack at public/chromium-pack.tar and fetching it
//      from this deployment's own URL at runtime (Vercel's own template
//      pattern: https://github.com/gabenunez/puppeteer-on-vercel) — failed
//      because this project has Vercel Deployment Protection enabled, and
//      the HTTP client @sparticuz/chromium-min uses internally
//      (follow-redirects) doesn't retain the protection-bypass cookie across
//      the redirect Vercel's bypass flow issues. Confirmed via Vercel's own
//      request logs: every attempt got a 303, on both the ephemeral
//      per-deployment URL and the stable git-branch alias, while the exact
//      same URL worked fine from a browser or mcp__workspace__web_fetch
//      (which do retain cookies across redirects).
//   3. (Current) Skip the network fetch entirely. scripts/postinstall-
//      chromium.mjs copies the actual installed @sparticuz/chromium
//      version's binary into chromium-bin/ at install time, and
//      next.config.ts's outputFileTracingIncludes ships that directory
//      inside the PDF routes' own function bundle. chromium.executablePath()
//      is given a local directory path (not a URL), which
//      @sparticuz/chromium-min inflates straight from disk — no network
//      call, no redirect, no protection interaction, and the binary always
//      matches the pinned package version on every environment.

import { join } from 'node:path'
import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'

// process.cwd() at runtime on Vercel is the function's own bundle root,
// which is where outputFileTracingIncludes places chromium-bin/.
const CHROMIUM_BIN_DIR = join(process.cwd(), 'chromium-bin')

// Returns a plain Uint8Array rather than Node's Buffer — Buffer is a
// structurally different generic type in this Next.js/TS setup and isn't
// accepted as a NextResponse BodyInit ("Type 'Buffer<ArrayBufferLike>' is
// missing the following properties from type 'URLSearchParams'..."), which
// broke the Vercel type-check step. A plain Uint8Array is a valid BodyInit.
// 2026-07-14: optional per-call margin override, added for the new
// "official form" leave PDF (src/lib/pdf/leave-official-form-template.ts),
// which overlays filled-in text on top of a scanned company form at exact
// pixel/point coordinates — any nonzero page margin would shift the overlay
// off the background image. Defaults to the original hardcoded 10mm on all
// sides, so every existing caller (leave, timesheet, ...) is unaffected.
export async function renderPdfFromHtml(
  html: string,
  opts?: { margin?: { top: string; bottom: string; left: string; right: string } }
): Promise<Uint8Array> {
  // @sparticuz/chromium-min v141's Chromium class dropped the
  // `defaultViewport` and `headless` static getters that older versions
  // (like the v123 we started with) exposed — confirmed by reading the
  // published v141 source and Vercel's own current template, which now just
  // passes `headless: true` directly. `args`/`executablePath` are unchanged.
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(CHROMIUM_BIN_DIR),
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: opts?.margin ?? { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    })
    return new Uint8Array(pdf)
  } finally {
    // Always close, even on error — a leaked browser process on a serverless
    // instance that gets reused can exhaust memory across invocations.
    await browser.close()
  }
}
