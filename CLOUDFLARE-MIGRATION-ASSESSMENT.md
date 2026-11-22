# ประเมินความเสี่ยง/ความเป็นไปได้: ย้าย CONNEX จาก Vercel ไป Cloudflare

วันที่ประเมิน: 2026-11-22
สถานะ: ร่างประเมินเบื้องต้น (ยังไม่ได้ลงมือทำ ไม่มีโค้ดใดถูกแก้)

## สรุปสั้น (TL;DR)

**ไม่แนะนำให้ย้ายทั้งระบบไป Cloudflare Workers ในตอนนี้** เหตุผลหลักคือระบบสร้าง PDF (ใบลา, Timesheet ทางการ, สัญญาจ้าง, ใบรับรอง ฯลฯ — 8 เส้นทาง API) พึ่งพา headless Chromium ผ่าน Puppeteer ที่รันไบนารีจริงบนดิสก์ ซึ่งเป็นสถาปัตยกรรมที่ตรงข้ามกับโมเดลความปลอดภัยของ Cloudflare Workers (V8 isolate ที่ไม่มี filesystem จริง ไม่สามารถรันโปรเซสภายนอกได้) โดยตรง ต้องเขียนส่วนนี้ใหม่ทั้งหมดไม่ว่าจะย้ายไปแพลตฟอร์มไหนก็ตามที่ไม่ใช่ Node.js server แบบเต็ม

ทางเลือกที่สมเหตุสมผลกว่าคือ **แบบผสม (hybrid)**: ย้ายเฉพาะหน้าเว็บ/หน้า static ไป Cloudflare (ถ้าต้องการ) แต่คงส่วน API ที่ต้องใช้ Puppeteer/Chromium กับ SMTP ไว้บน Vercel (หรือ Node.js server อื่น เช่น Render/Fly.io) — หรือถ้าจะย้ายจริงๆ ต้อง **เขียนส่วน PDF ใหม่ให้ใช้ Cloudflare Browser Run** (บริการ headless browser ของ Cloudflare เอง) และ **เขียนส่วนส่งอีเมลใหม่** (SMTP ตรงมีความเสี่ยงบน Workers)

## 1. สถาปัตยกรรมปัจจุบัน (ที่ตรวจสอบจากโค้ดจริง)

- Next.js 16.2.9 (App Router), รันเป็น Node.js serverless functions ทั้งหมด — **ตรวจสอบแล้วว่าไม่มี route ใดเลยใน 112 API routes ที่ประกาศ `export const runtime = 'edge'`** หมายความว่าทั้งระบบถูกเขียนโดยสมมติว่ามี Node.js runtime เต็มรูปแบบเสมอ
- Deploy ผ่าน Vercel, region ปักหมุดที่ `sin1` (สิงคโปร์), มี Vercel Cron (`/api/cron/daily-checks` ทุกวันตี 1) และ custom `maxDuration` (สูงสุด 60 วินาทีสำหรับ import, 30 วินาทีสำหรับ PDF)
- ฐานข้อมูล: Supabase (Postgres + Auth) — เข้าถึงผ่าน HTTPS/REST ทั้งหมด (ไม่ผูกกับ Vercel เลย ย้ายแพลตฟอร์มไหนก็ใช้ได้เหมือนเดิม)
- พบว่ามีไฟล์ `netlify.toml` และ `@netlify/plugin-nextjs` อยู่ในโปรเจกต์ (commit เดียว ไม่เคยถูกแก้ไขต่อ) — ดูเหมือนเป็นการทดลองที่ไม่ได้ใช้งานจริง ไม่ใช่ deployment คู่ขนานที่ active อยู่

## 2. ส่วนที่ย้ายได้ง่าย (ความเสี่ยงต่ำ)

- โค้ด React/Next.js หน้าเว็บทั่วไป (ไม่พึ่ง Node API เฉพาะทาง)
- การเชื่อมต่อ Supabase (`@supabase/supabase-js`, `@supabase/ssr`) — ใช้ fetch/HTTPS ล้วน ไม่มีปัญหา
- Middleware (`src/middleware.ts`) — ใช้ Supabase SSR cookie + Request/Response มาตรฐาน ซึ่งเข้ากันได้กับ edge runtime อยู่แล้ว (Next.js middleware ปกติรันบน edge runtime เสมอไม่ว่าจะ host ที่ไหน)
- `exceljs` (ใช้สร้างไฟล์ Excel export 1 จุด), `mammoth` (แกะข้อความจาก .docx 1 จุด) — เป็นไลบรารี JS ล้วน มีโอกาสสูงที่จะทำงานได้ภายใต้ Cloudflare `nodejs_compat` แต่ควรทดสอบจริงก่อนเชื่อ 100%
- `xlsx` (SheetJS) — ใช้แค่ฝั่ง client (`'use client'` components) ทั้งหมด ไม่เกี่ยวกับ server runtime เลย

## 3. ความเสี่ยงปานกลาง (ต้องแก้โค้ด แต่ไม่ใช่ตัน)

| จุด | ปัญหา | แนวทางแก้ |
|---|---|---|
| Vercel Cron (`/api/cron/daily-checks`) | Cloudflare ไม่มี "Vercel Cron" แบบเดียวกัน แต่มี Cron Triggers ของตัวเอง | ย้าย schedule ไปตั้งใน Cloudflare Workers Cron Triggers แทน ไม่ยาก แต่ต้องทำแยกจากตัวแอป Next.js |
| `node:fs` / `node:path` อ่านไฟล์โลโก้/ฟอร์ม PNG ที่ฝังไว้ตอน build (`src/lib/pdf/company-logo.ts`) | Workers ไม่มี local disk ให้ `readFileSync` จากไฟล์ที่ bundle มาแบบนี้ | ต้องเปลี่ยนเป็น import แบบ inline (เช่น base64 หรือ Workers' asset binding) แทนการอ่านไฟล์จากดิสก์ตรงๆ |
| `node:zlib` (`deflateRawSync` ใน `/api/export/route.ts`) | Workers `nodejs_compat` รองรับ zlib บางส่วน ต้องทดสอบจริง | น่าจะใช้ได้ แต่ต้องทดสอบก่อน ไม่ใช่ตัวตัน |
| `nodemailer` (ส่งอีเมล, `src/lib/mailer.ts`) ผ่าน SMTP ตรง | Cloudflare Workers เปิด raw TCP socket ได้ แต่**บล็อก port 25** และมี GitHub issue ยืนยันว่า nodemailer เองมีปัญหา build บน Workers (ต้องการโมดูล `net`/`stream` แบบไม่มี prefix `node:`) ความเข้ากันได้จริงยังไม่ชัดเจน | ทางเลือก: (1) เปลี่ยนไปใช้ port 587/เปิด TLS ผ่าน `connect()` ของ Cloudflare โดยตรง (ยังไม่ยืนยันว่า nodemailer ใช้ได้จริง), (2) เปลี่ยนไปใช้แพ็กเกจ `worker-mailer` (ออกแบบมาสำหรับ Workers โดยเฉพาะ), หรือ (3) เปลี่ยนไปใช้ HTTP Email API (เช่น Resend, Postmark) แทน SMTP ไปเลย — ตัวเลือกนี้ความเสี่ยงต่ำสุดและมักจะง่ายกว่า |
| `next/image` (6 จุด) | Cloudflare จัดการ image optimization ต่างจาก Vercel | ตั้งค่า `images.unoptimized: true` หรือใช้ Cloudflare Image Resizing (เพิ่มเติม) |
| Vercel Deployment Protection (ฟีเจอร์จำกัดการเข้าถึง deployment ที่ยังไม่ขึ้น production) | ไม่มีฟีเจอร์เดียวกันเป๊ะบน Cloudflare | มี Cloudflare Access ที่ทำหน้าที่คล้ายกันได้ แต่ตั้งค่าคนละแบบ |

## 4. จุดที่เป็นอุปสรรคใหญ่ (ต้องเขียนใหม่ทั้งหมด)

### 4.1 การสร้าง PDF ด้วย Puppeteer + Chromium (ผลกระทบสูงสุด)

พบ **8 API routes** ที่พึ่งพาตัวสร้าง PDF กลาง (`src/lib/pdf/render.ts`) ซึ่งทำงานโดย:
- รัน headless Chromium จริงผ่าน `puppeteer-core` + `@sparticuz/chromium-min`
- อ่านไบนารี Chromium จากดิสก์ในเครื่อง function (ฝังมาตอน build ผ่าน `scripts/postinstall-chromium.mjs` + `next.config.ts`'s `outputFileTracingIncludes` — เป็นวิธีแก้ปัญหาที่เคยเจอกับ Vercel Deployment Protection บล็อกการ fetch ไบนารีผ่าน HTTP มาก่อนแล้ว)

เส้นทางที่ใช้: ใบลา, ใบลา (แบบทางการ), Timesheet (แบบทางการ), สัญญาจ้าง, ใบรับรอง, สรุปพนักงาน, รายการ Job Codes, และ e-signature flow

**ทำไมถึงเป็นปัญหากับ Cloudflare Workers**: Workers รันใน V8 isolate ซึ่ง**ไม่มี local filesystem ถาวรให้ unpack ไบนารี และไม่สามารถรันโปรเซสภายนอก (เช่น Chromium) ได้เลย** — นี่คือข้อจำกัดเชิงสถาปัตยกรรม/ความปลอดภัยของ Workers โดยตรง ไม่ใช่แค่ "ยังไม่รองรับ" แล้วรอเพิ่มในอนาคต

**ทางแก้ที่มีจริง**: Cloudflare มีบริการแยกต่างหากชื่อ **Browser Run** (เดิมชื่อ Browser Rendering) ที่เป็น headless browser แบบ managed ของ Cloudflare เอง เรียกผ่าน API คล้าย Puppeteer ได้ แต่:
- คิดเงินตามเวลาที่ browser ทำงานจริง (per browser-hour) — มีโควตาฟรี 10 นาที/วันสำหรับแผน Workers Free เท่านั้น ซึ่ง**น้อยเกินไปสำหรับแอประดับองค์กรที่สร้าง PDF ทุกวัน** ต้องใช้แผนเสียเงิน
- Concurrency และ rate limit เปลี่ยนแปลงบ่อย (ข้อมูลจากเอกสารทางการขัดแย้งกันเองระหว่างหน้าต่างๆ — ควรเช็คหน้าทางการล่าสุดก่อนตัดสินใจจริง ไม่ใช่เชื่อตัวเลขจากที่ไหนที่เดียว)
- Timeout ของ browser session คือ 60 วินาที (ใกล้เคียงกับ maxDuration 30s ปัจจุบันของ Vercel แต่ต้องทดสอบกับ Timesheet/PDF ที่ซับซ้อนที่สุดจริงๆ)
- **ต้องเขียน `src/lib/pdf/render.ts` ใหม่ทั้งหมด** ให้เรียก Browser Run แทนการ spawn Chromium บนดิสก์ — นี่คือง่ายที่สุดเท่าที่จะเป็นไปได้ในบรรดาทางเลือกทั้งหมด แต่ก็ยังเป็นงานเขียนใหม่ ไม่ใช่แค่ config

### 4.2 สถานะความเป็นผู้ใหญ่ของตัวปรับ (adapter) เอง

ตัวที่ใช้พอร์ต Next.js ไปรันบน Cloudflare Workers คือ `@opennextjs/cloudflare` (OpenNext) ซึ่งจากเอกสารล่าสุดของ Cloudflare เอง:
- โปรเจกต์ยังอยู่ในสถานะ **pre-1.0 และพัฒนาอยู่ต่อเนื่อง** (ยังไม่นิ่ง)
- Cloudflare เองแนะนำเครื่องมือใหม่ชื่อ **"vinext"** สำหรับโปรเจกต์ใหม่ และวาง OpenNext ไว้สำหรับ "โปรเจกต์เดิมที่ย้ายเข้ามา" เท่านั้น — สัญญาณนี้บ่งบอกว่าแม้แต่ Cloudflare เองก็มองว่า OpenNext ยังไม่ใช่ทางที่ดีที่สุดสำหรับงานใหม่
- Node.js middleware ที่เปิดตัวใน Next.js 15.2 **ยังไม่รองรับ** บน adapter นี้
- โมดูล Node.js บางตัว (เช่น TLS/SSL, test runner) รองรับแค่บางส่วน ไม่เต็มรูปแบบ

สรุป: ความเสี่ยงไม่ได้มีแค่ "โค้ดเราเข้ากันไม่ได้" แต่ตัวเครื่องมือย้ายเองก็ยังไม่นิ่งพอสำหรับระบบที่ใช้งานจริงในองค์กร (production-critical HR/payroll system)

## 5. จุดที่ไม่น่ากังวล (เคยกลัวแต่เช็คแล้วไม่ใช่ปัญหา)

- **CPU time / duration limit**: แผน Workers Paid ให้ CPU time สูงสุด 5 นาที/request (ปรับได้จาก default 30 วินาที) และ**ไม่จำกัด/ไม่คิดเงิน wall-clock duration เลย** — เวลาที่ใช้รอ network/DB (fetch, query) ไม่นับเป็น CPU time ด้วย ดังนั้นงาน import จำนวนมาก (ที่ตอนนี้ตั้ง maxDuration 60s บน Vercel) ไม่น่าจะมีปัญหาเรื่อง timeout บน Cloudflare
- **Supabase**: เข้าถึงผ่าน HTTPS ล้วน ไม่ผูกกับ Vercel ไม่ต้องแก้อะไรเลย ย้ายไปแพลตฟอร์มไหนก็ใช้ได้เหมือนเดิม
- **region pinning**: Cloudflare Workers รันที่ edge location ทั่วโลกอัตโนมัติ (ไม่ต้องตั้ง region) ซึ่งจริงๆ ดีกว่าในแง่ latency ฝั่งผู้ใช้ แต่ต้องดูว่า latency ไปหา Supabase (ซึ่งน่าจะ host อยู่ region คงที่) จะแปรผันมากขึ้นหรือไม่ — เป็นเรื่องรองลงมา ไม่ใช่ตัวตัน

## 6. แนวทางที่แนะนำ (เรียงจากเสี่ยงน้อยไปมาก)

1. **ไม่ย้าย — อยู่ Vercel ต่อ** ถ้าไม่มีเหตุผลด้านต้นทุน/ธุรกิจที่ชัดเจนพอ เพราะระบบ PDF (หัวใจของงาน HR นี้) ทำงานเสถียรบน Vercel อยู่แล้ว การย้ายมีความเสี่ยงสูงต่อฟีเจอร์ที่สำคัญที่สุดของระบบ
2. **แบบผสม (Hybrid)**: ถ้าอยากได้ประโยชน์จาก Cloudflare (เช่น ต้นทุน, performance) ให้ย้ายเฉพาะส่วนหน้าเว็บ/งานเบาๆ ไป Cloudflare Pages/Workers แต่คง API ที่ใช้ Puppeteer/SMTP ไว้เป็น Node.js server แยกต่างหาก (Vercel เดิม หรือ Render/Fly.io/Railway ที่เป็น Node.js เต็มรูปแบบ) แล้วให้สองระบบคุยกันผ่าน HTTP — ซับซ้อนขึ้นเรื่องการดูแล 2 ระบบ แต่ความเสี่ยงต่อฟีเจอร์เดิมต่ำกว่า
3. **ย้ายทั้งหมดไป Cloudflare**: ต้องทำทั้งหมดนี้ก่อน:
   - เขียน `lib/pdf/render.ts` ใหม่ทั้งหมดให้ใช้ Cloudflare Browser Run (และต้องทดสอบว่า quota/ราคาคุ้มค่าจริงเมื่อใช้งานจริงทุกวัน)
   - เขียน `lib/mailer.ts` ใหม่ (เปลี่ยนจาก SMTP ตรงเป็น HTTP Email API หรือ `worker-mailer`)
   - ย้าย Vercel Cron ไปเป็น Cloudflare Cron Trigger แยกต่างหาก
   - แก้การอ่านไฟล์โลโก้/ฟอร์มจากดิสก์ให้เป็นแบบ inline/asset binding
   - ทดสอบทุก API route ที่เหลือ (104 จาก 112 route) ว่าทำงานถูกต้องภายใต้ `nodejs_compat` จริง (ไม่ใช่แค่ build ผ่าน)
   - รับความเสี่ยงที่ตัวเครื่องมือ OpenNext เองยังไม่นิ่ง (pre-1.0)
   - ประมาณการเวลา: งานนี้มีขนาดใหญ่ระดับ "โปรเจกต์ย่อย" ไม่ใช่งานแก้ไขเล็กน้อย ควรมีช่วงทดสอบคู่ขนาน (ทั้งสองระบบรันพร้อมกัน) ก่อนตัดสลับจริง

## 7. คำถามที่ควรตอบก่อนตัดสินใจ

- เหตุผลหลักที่อยากย้ายคืออะไร (ต้นทุน? performance? เหตุผลอื่น?) — คำตอบจะกำหนดว่าควรเลือกแบบผสมหรือย้ายทั้งหมด
- รับความเสี่ยงที่ฟีเจอร์ PDF (เอกสารสำคัญทางกฎหมาย/HR) อาจมีช่วงที่ไม่เสถียรระหว่างเปลี่ยนระบบได้แค่ไหน
- มีงบสำหรับทดสอบคู่ขนาน (รันทั้ง Vercel และ Cloudflare พร้อมกันชั่วคราว) หรือไม่

---
*เอกสารนี้เป็นการประเมินจากโค้ดจริงในโปรเจกต์ ณ วันที่ระบุด้านบน + ข้อมูลจากเอกสารทางการของ Cloudflare ที่ค้นคว้าวันเดียวกัน ตัวเลขด้าน pricing/limits ของ Cloudflare เปลี่ยนแปลงได้บ่อย ควรเช็คหน้าทางการอีกครั้งก่อนตัดสินใจจริง*
