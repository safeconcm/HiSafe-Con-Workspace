// src/lib/xlsx-export.ts
// Minimal, dependency-free XLSX/CSV builders shared by export routes.
// Extracted verbatim from src/app/api/export/route.ts (which is left
// untouched and still has its own copy) so new export routes — like the
// per-employee timesheet export — can reuse the exact same, already-proven
// serialization logic without touching that existing, working route.

// Pre-compute CRC32 table once at module level
const CRC32_TABLE = (() => {
  const t: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32Global(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xFF]
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// Simple XLSX builder — no npm package needed
export function buildXLSX(headers: (string | number | null)[], rows: (string | number | null)[][]): Buffer {
  const xmlRows = [headers, ...rows].map((row, ri) => {
    const cells = row.map((val, ci) => {
      const colLetter = String.fromCharCode(65 + ci)
      const cellRef   = `${colLetter}${ri + 1}`
      if (val === null || val === undefined) return `<c r="${cellRef}"/>`
      if (typeof val === 'number') return `<c r="${cellRef}" t="n"><v>${val}</v></c>`
      // String — use shared strings index workaround: inline string
      const escaped = String(val)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      return `<c r="${cellRef}" t="inlineStr"><is><t>${escaped}</t></is></c>`
    }).join('')
    return `<row r="${ri + 1}">${cells}</row>`
  }).join('')

  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${xmlRows}</sheetData>
</worksheet>`

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml"  ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const _rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  // Build ZIP manually (XLSX = ZIP)
  function zipEntry(name: string, data: Buffer): Buffer {
    const nameBytes  = Buffer.from(name, 'utf8')
    const crc        = crc32Global(data)
    const compressed = data // Store uncompressed (method=0) for simplicity
    const local = Buffer.alloc(30 + nameBytes.length)
    local.writeUInt32LE(0x04034b50, 0)  // signature
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(0, 6)           // flags
    local.writeUInt16LE(0, 8)           // compression (store)
    local.writeUInt16LE(0, 10)          // mod time
    local.writeUInt16LE(0, 12)          // mod date
    local.writeUInt32LE(crc, 14)        // crc32
    local.writeUInt32LE(data.length, 18) // compressed size
    local.writeUInt32LE(data.length, 22) // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26) // filename length
    local.writeUInt16LE(0, 28)          // extra length
    nameBytes.copy(local, 30)
    return Buffer.concat([local, compressed])
  }

  const files: { name: string; data: Buffer; offset: number }[] = []
  let offset = 0

  function addFile(name: string, content: string) {
    const data  = Buffer.from(content, 'utf8')
    const entry = zipEntry(name, data)
    files.push({ name, data, offset })
    offset += entry.length
    return entry
  }

  const parts: Buffer[] = [
    addFile('[Content_Types].xml', contentTypes),
    addFile('_rels/.rels', _rels),
    addFile('xl/workbook.xml', workbook),
    addFile('xl/_rels/workbook.xml.rels', rels),
    addFile('xl/worksheets/sheet1.xml', sheet),
  ]

  // Central directory
  const cdEntries = files.map(({ name, data, offset: off }) => {
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32Global(data)
    const cd = Buffer.alloc(46 + nameBytes.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10)
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBytes.length, 28)
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38); cd.writeUInt32LE(off, 42)
    nameBytes.copy(cd, 46)
    return cd
  })

  const cdSize   = cdEntries.reduce((s, b) => s + b.length, 0)
  const cdOffset = offset
  const eocd     = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...parts, ...cdEntries, eocd])
}

export function buildCSV(headers: (string | number | null)[], rows: (string | number | null)[][]): string {
  const BOM = '﻿'
  const all  = [headers, ...rows]
  return BOM + all.map(row =>
    row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n')
}
