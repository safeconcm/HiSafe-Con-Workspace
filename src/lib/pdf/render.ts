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
// The "-min" package doesn't bundle the ~50MB Chromium binary — it downloads
// it once per cold start from Sparticuz's own GitHub release and caches it
// in /tmp for subsequent invocations on the same instance.

import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar'

// Returns a plain Uint8Array rather than Node's Buffer — Buffer is a
// structurally different generic type in this Next.js/TS setup and isn't
// accepted as a NextResponse BodyInit ("Type 'Buffer<ArrayBufferLike>' is
// missing the following properties from type 'URLSearchParams'..."), which
// broke the Vercel type-check step. A plain Uint8Array is a valid BodyInit.
export async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: chromium.headless,
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
