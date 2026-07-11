// src/lib/pdf/company-letterhead.ts
// Shared helper for the extra letterhead lines (address / tax id / phone /
// email) that go under the company name in every PDF document's header —
// timesheet, leave, certificate, contract, employee-summary. Added per
// conversation 2026-07-11 ("ที่ต้องใส่ในหัวกระดาษเอกสารต่าง ทุกเอกสาร ของระบบทั้ง2บริษัท").
//
// Company legal/contact info now lives on the `companies` row
// (legal_name_th, address_th, tax_id, phone, contact_email — see migration
// add_company_letterhead_fields) rather than being hardcoded per company
// code like the logo path, so HR can update it later (e.g. address change)
// without a code deploy.

export interface CompanyLetterheadInfo {
  name_th: string
  name_en?: string | null
  legal_name_th?: string | null
  address_th?: string | null
  tax_id?: string | null
  phone?: string | null
  contact_email?: string | null
}

// The name to show as the big <h1> — prefer the full registered legal name
// ("บริษัท เซฟคอน จำกัด") over the short display name ("เซฟคอน") used
// elsewhere in the app's UI, since a document letterhead conventionally
// shows the full name.
export function letterheadName(company: CompanyLetterheadInfo): string {
  return company.legal_name_th || company.name_th
}

// Returns the extra <p class="meta"> lines (address, then tax id/phone/
// email combined) to render under the company name/English-name lines
// already in each template — empty string for any piece that isn't set, so
// a company row missing some fields doesn't leave a stray "· ·" or blank line.
export function letterheadMetaHTML(company: CompanyLetterheadInfo): string {
  const lines: string[] = []

  if (company.address_th) {
    lines.push(`<p class="meta">${company.address_th}</p>`)
  }

  const contactParts = [
    company.tax_id        ? `เลขประจำตัวผู้เสียภาษี ${company.tax_id}` : '',
    company.phone         ? `โทร. ${company.phone}`                    : '',
    company.contact_email ? `อีเมล ${company.contact_email}`           : '',
  ].filter(Boolean)

  if (contactParts.length) {
    lines.push(`<p class="meta">${contactParts.join(' · ')}</p>`)
  }

  return lines.join('\n')
}
