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
// The "-min" package doesn't bundle the ~50MB Chromium binary. First attempt
// pointed this at a hardcoded old external release (v123.0.1, Sparticuz's
// GitHub) and it failed at runtime with "libnss3.so: cannot open shared
// object file" — that binary predates changes to Vercel's Node.js runtime
// base image and its shared-library expectations no longer match.
//
// Fixed by following Vercel's own official template
// (https://github.com/gabenunez/puppeteer-on-vercel): self-host the pack
// instead. scripts/postinstall-chromium.mjs packages the *actual* installed
// @sparticuz/chromium version into public/chromium-pack.tar at install time,
// and at runtime we fetch it from this same deployment's own URL — so the
// binary always matches the pinned package version and this Vercel runtime,
// on every environment (staging preview, production) automatically.

import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'

function chromiumPackUrl(): string {
  // VERCEL_URL is auto-populated by Vercel to this exact deployment's own
  // hostname (preview or production) — no manual config needed, and it
  // can't drift out of sync the way a hardcoded external URL did.
  const host = process.env.VERCEL_URL ?? process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '')
  if (!host) throw new Error('Cannot resolve chromium-pack.tar URL: VERCEL_URL and NEXT_PUBLIC_APP_URL are both unset')

  // This project has Vercel Authentication (Deployment Protection) enabled
  // on preview deployments — confirmed by a self-fetch of /chromium-pack.tar
  // getting redirected to Vercel's own login page (verified via
  // mcp__workspace__web_fetch, which has no session cookie) and, from inside
  // the actual serverless function, failing with "Invalid tar header" for
  // the same reason (it received the login page's HTML instead of the tar).
  // VERCEL_AUTOMATION_BYPASS_SECRET is Vercel's documented mechanism for a
  // deployment to call its own protected endpoints: a project-level secret
  // set as a system env var (Settings -> Deployment Protection -> Protection
  // Bypass for Automation), sent as the x-vercel-protection-bypass query
  // param/header to skip the auth wall for just this request.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const query = bypass ? `?x-vercel-protection-bypass=${bypass}` : ''
  return `https://${host}/chromium-pack.tar${query}`
}

// Returns a plain Uint8Array rather than Node's Buffer — Buffer is a
// structurally different generic type in this Next.js/TS setup and isn't
// accepted as a NextResponse BodyInit ("Type 'Buffer<ArrayBufferLike>' is
// missing the following properties from type 'URLSearchParams'..."), which
// broke the Vercel type-check step. A plain Uint8Array is a valid BodyInit.
export async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  // @sparticuz/chromium-min v141's Chromium class dropped the
  // `defaultViewport` and `headless` static getters that older versions
  // (like the v123 we started with) exposed — confirmed by reading the
  // published v141 source and Vercel's own current template, which now just
  // passes `headless: true` directly. `args`/`executablePath` are unchanged.
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(chromiumPackUrl()),
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    })
    return new Uint8Array(pdf)
  } finally {
    // Always close, even on error — a leaked browser process on a serverless
    // instance that gets reused can exhaust memory across invocations.
    await browser.close()
  }
}
