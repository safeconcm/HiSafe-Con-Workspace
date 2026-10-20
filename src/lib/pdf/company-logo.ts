// src/lib/pdf/company-logo.ts
// Inlines static PDF header assets (company logo, and the leave
// official-form's scanned background) as base64 data: URIs instead of
// having each template build an http(s) URL (${appUrl}/logos/...,
// ${appUrl}/forms/...) for headless Chromium to fetch over the network
// during page.setContent.
//
// That self-fetch — src/lib/pdf/render.ts's Chromium instance calling back
// out, over the public internet, to this same deployment's own URL — added
// a real network round trip to every single PDF render, on top of the
// Chromium cold-start cost already described in render.ts. Diagnosed
// 2026-10-20 ("ทำไมกด create PDF ทุกอย่างมันโหลดช้าจัง"): a data: URI never
// triggers a network request at all, so page.setContent's `networkidle0`
// wait has one fewer thing to wait on.
//
// Like render.ts's chromium-bin/, these files have to actually be present on
// disk inside the PDF routes' serverless function bundle — Vercel does not
// ship public/ into function bundles by default — so next.config.ts's
// outputFileTracingIncludes explicitly lists them for '/api/pdf/**'.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Cached per warm serverless instance (module-level Map survives across
// invocations on the same instance, same as any other module singleton) —
// these files never change at runtime, so there's no reason to re-read and
// re-encode them on every request. Each is under 150KB, so the memory cost
// of caching every variant is negligible.
const cache = new Map<string, string>()

function dataUri(relativePath: string): string {
  const cached = cache.get(relativePath)
  if (cached) return cached

  const bytes = readFileSync(join(process.cwd(), 'public', relativePath))
  const uri = `data:image/png;base64,${bytes.toString('base64')}`
  cache.set(relativePath, uri)
  return uri
}

export function companyLogoDataUri(companyCode: string | null | undefined): string {
  return dataUri(companyCode === 'HIGHCON' ? 'logos/highcon.png' : 'logos/safecon.png')
}

export function leaveFormBackgroundDataUri(): string {
  return dataUri('forms/leave-form-bg.png')
}
