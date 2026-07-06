# 🚀 คู่มือ Deploy HiSafe-CON WorkSpace
## Supabase + GitHub + Vercel (ฉบับสมบูรณ์ ทำตามทีละขั้น)

---

## ภาพรวม (5 ขั้นตอนใหญ่)

```
[1] Supabase  →  [2] GitHub  →  [3] Vercel  →  [4] สร้าง Admin  →  [5] ทดสอบ
```

ใช้เวลาประมาณ **30-45 นาที**

---

## ขั้นที่ 1 — ตั้งค่า Supabase (ฐานข้อมูล)

### 1.1 สร้าง Project ใหม่

1. เปิด **https://supabase.com** → Sign In
2. คลิก **"New project"** (ปุ่มสีเขียว)
3. กรอกข้อมูล:

| ช่อง | ค่าที่กรอก |
|------|-----------|
| **Name** | `hisafe-con` |
| **Database Password** | ตั้งเอง เช่น `HiSafe2024!` (จดไว้!) |
| **Region** | `Southeast Asia (Singapore)` |
| **Plan** | `Free` |

4. คลิก **"Create new project"**
5. รอ **2-3 นาที** (มีแถบโหลด)

---

### 1.2 รัน SQL ตั้งค่าฐานข้อมูล

เมนูซ้าย → คลิก **"SQL Editor"** (ไอคอนโค้ด `<>`)

**วิธีที่ 1: รันไฟล์เดียวจบ** (แนะนำสำหรับ DB ใหม่)
1. คลิก **"New query"**
2. เปิดไฟล์ `migrations/000_run_all.sql` จากโฟลเดอร์โปรเจกต์
3. คัดลอกทั้งหมด (Ctrl+A → Ctrl+C)
4. วางในกล่อง SQL Editor
5. คลิกปุ่ม **"Run"** สีเขียว มุมขวาล่าง
6. รอจนเห็น ✅ "Success"

> ⚠️ ถ้าเกิด Error "already exists" → รันแต่ละไฟล์ทีละไฟล์ตามลำดับ 001-021 แทน

---

### 1.3 เก็บ API Keys

เมนูซ้าย → คลิก **"Project Settings"** (ไอคอนฟันเฟือง ล่างสุด) → **"API"**

```
จดค่า 3 อย่างนี้:

URL:           https://xxxxxxxxxxxx.supabase.co
anon public:   eyJhbGci...  (ยาว ~200 ตัว)
service_role:  eyJhbGci...  (ยาว ~200 ตัว — ห้ามเผยแพร่!)
```

---

### 1.4 เปิด Google OAuth (ถ้าต้องการ Login ด้วย Google)

เมนูซ้าย → **"Authentication"** → **"Providers"** → **"Google"**

1. เปิด **Enable** 
2. ไปที่ **https://console.cloud.google.com**
3. สร้าง OAuth 2.0 Client ID
4. Authorized redirect URIs: `https://xxxxxxxxxxxx.supabase.co/auth/v1/callback`
5. Copy Client ID + Secret → ใส่ใน Supabase

---

## ขั้นที่ 2 — อัปโหลดโค้ดขึ้น GitHub

### 2.1 สร้าง Repository

1. ไปที่ **https://github.com** → Sign In
2. คลิก **"+"** → **"New repository"**
3. กรอก:
   - Repository name: `hisafe-con`
   - เลือก **Private**
4. คลิก **"Create repository"**

### 2.2 อัปโหลดไฟล์

**วิธีง่ายที่สุด (ไม่ต้องใช้ Git command):**

1. ในหน้า Repository → คลิก **"uploading an existing file"**
2. แตก ZIP โปรเจกต์ออกมาก่อน
3. **เลือกไฟล์ทั้งหมด** ในโฟลเดอร์ `hisafe-con` ยกเว้น:
   - ❌ โฟลเดอร์ `node_modules`
   - ❌ โฟลเดอร์ `.next`
   - ❌ ไฟล์ `.env.local` (ถ้ามี)
4. ลากทั้งหมดใส่กล่อง → รอ Upload
5. คลิก **"Commit changes"**

> 💡 ถ้าไฟล์เยอะเกิน 100 ไฟล์ GitHub อาจไม่รับ drag & drop → ใช้ GitHub Desktop แทน

**หรือใช้ GitHub Desktop (ง่ายกว่า):**
1. ดาวน์โหลด: https://desktop.github.com
2. Sign In → Add Existing Repository → เลือกโฟลเดอร์ → Publish

---

## ขั้นที่ 3 — Deploy บน Vercel

### 3.1 สมัคร Vercel

1. ไปที่ **https://vercel.com**
2. คลิก **"Sign Up"** → **"Continue with GitHub"**
3. Authorize Vercel

### 3.2 Import โปรเจกต์

1. Dashboard → คลิก **"Add New..."** → **"Project"**
2. คลิก **"Import"** ข้างชื่อ `hisafe-con`
3. Vercel ตรวจพบ Next.js อัตโนมัติ

### 3.3 ตั้งค่า Environment Variables

**สำคัญมาก!** ก่อนกด Deploy ต้องใส่ค่าทุกตัวนี้:

คลิก **"Environment Variables"** แล้วเพิ่มทีละตัว:

| Variable Name | ค่า |
|--------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | URL จาก Supabase ขั้น 1.3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `NEXT_PUBLIC_APP_URL` | `https://hisafe-con.vercel.app` (ใส่ชั่วคราวก่อน) |
| `NEXT_PUBLIC_APP_NAME` | `HiSafe-CON WorkSpace` |

**ค่า Optional (ตั้งทีหลังได้):**

| Variable Name | ค่า |
|--------------|-----|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | อีเมล Gmail |
| `SMTP_PASSWORD` | App Password 16 หลัก |
| `SMTP_FROM` | อีเมล Gmail |
| `SMTP_FROM_NAME` | `HiSafe-CON WorkSpace` |
| `LINE_LOGIN_CHANNEL_ID` | จาก LINE Developers |
| `LINE_LOGIN_CHANNEL_SECRET` | จาก LINE Developers |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE OA Messaging API |
| `LINE_CHANNEL_SECRET` | LINE OA Messaging API |

### 3.4 Deploy!

1. คลิก **"Deploy"**
2. รอ **3-5 นาที**
3. จะได้ URL เช่น `https://hisafe-con-abc123.vercel.app`

### 3.5 อัปเดต URL จริง

หลัง Deploy เสร็จ:
1. Vercel → Project → **Settings** → **Environment Variables**
2. แก้ `NEXT_PUBLIC_APP_URL` เป็น URL จริง
3. คลิก **"Redeploy"** → **"Redeploy"** (ไม่ต้องแก้โค้ด)

---

## ขั้นที่ 4 — สร้าง Admin User คนแรก

### 4.1 สร้าง User ใน Supabase Auth

กลับไปที่ Supabase:
1. เมนูซ้าย → **"Authentication"** → **"Users"**
2. คลิก **"Add user"** → **"Create new user"**
3. กรอก:
   - Email: `admin@safecon.co.th`
   - Password: ตั้งรหัสแข็งแกร่ง
   - **เปิด "Auto Confirm User"**
4. คลิก **"Create user"**
5. **Copy UUID** ที่ปรากฏในคอลัมน์ "UID" (รูปแบบ: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### 4.2 เชื่อม Auth User กับ Profile ใน DB

เมนูซ้าย → **"SQL Editor"** → รัน SQL นี้:

```sql
-- แทน UUID ด้วยค่าที่ Copy มา
UPDATE users
SET auth_user_id = 'PASTE-UUID-HERE'
WHERE email = 'admin@safecon.co.th';

-- ตรวจสอบ
SELECT id, email, role, status, auth_user_id 
FROM users 
WHERE email = 'admin@safecon.co.th';
```

ถ้าเห็น `auth_user_id` มีค่า = สำเร็จ ✅

---

## ขั้นที่ 5 — ทดสอบระบบ

1. เปิด URL Vercel ของคุณ
2. Login ด้วย `admin@safecon.co.th` + รหัสผ่าน
3. เข้า Dashboard ได้ = ระบบพร้อมใช้ ✅

**ทดสอบ Feature หลัก:**
- ✅ Login → Dashboard โหลดได้
- ✅ ยื่นใบลา → เลือกประเภทลา → Submit
- ✅ Timesheet → กรอกชั่วโมง → บันทึก
- ✅ Admin → จัดการ Users

---

## ขั้นตอนเพิ่มเติม (ทำทีหลังได้)

### เพิ่มพนักงาน Highcon

```sql
-- สร้าง Auth user สำหรับ Highcon admin แล้วรัน:
UPDATE users
SET auth_user_id = 'HIGHCON-ADMIN-UUID'
WHERE email = 'admin@highcon.co.th';
```

### Import พนักงานเดิม

1. Dashboard → Admin → **"Import CSV"**
2. ดาวน์โหลด Template → กรอกข้อมูล → Upload

### ตั้งค่า Email (Gmail)

1. ไปที่ https://myaccount.google.com → Security
2. **2-Step Verification** → เปิดก่อน
3. **App passwords** → Generate → ได้รหัส 16 หลัก
4. ใส่ใน Vercel ENV ตามด้านบน → Redeploy

---

## ❓ แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|-------|--------|---------|
| หน้าขาว / Error 500 | ENV ขาด | ตรวจ Environment Variables ครบไหม |
| Login ไม่ผ่าน | auth_user_id ยังไม่ได้ set | รัน SQL ขั้น 4.2 |
| "no profile found" | email ไม่ตรง | ตรวจ email ตรงกันใน Auth กับ users table |
| Build failed | TypeScript error | ดู Vercel build log |
| SQL Error ตอนรัน | ลำดับผิด | รันไฟล์ใหม่ตั้งแต่ 001 ตามลำดับ |
| Google Login ไม่ทำงาน | ยังไม่ set OAuth | ทำขั้น 1.4 |
| LINE Login ไม่ทำงาน | ขาด env | ใส่ LINE_LOGIN_CHANNEL_ID + SECRET |

---

## 🔑 สรุป Environment Variables ทั้งหมด

```bash
# จำเป็นต้องมี (ไม่มีไม่ได้)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=

# Optional แต่แนะนำ
NEXT_PUBLIC_APP_NAME=HiSafe-CON WorkSpace
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_FROM_NAME=HiSafe-CON WorkSpace

# Social Login
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
```

---

*HiSafe-CON WorkSpace v6 · Safecon & Highcon · Deploy Guide*
