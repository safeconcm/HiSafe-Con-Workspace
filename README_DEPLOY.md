# คู่มือ Deploy HiSafe-CON WorkSpace
## Supabase + Netlify (ฉบับสมบูรณ์)

---

## ขั้นตอนที่ 1 — Supabase (ฐานข้อมูล)

### 1.1 สร้าง Project ใหม่
1. ไปที่ https://supabase.com → Sign In
2. คลิกปุ่ม **"New project"** (สีเขียว มุมขวาบน)
3. กรอก:
   - **Name:** `hisafe-con`
   - **Database Password:** ตั้งรหัสแข็งแกร่ง เช่น `HiSafe@2024!` (จดไว้)
   - **Region:** `Southeast Asia (Singapore)`
4. คลิก **"Create new project"** → รอ 2-3 นาที

### 1.2 รัน SQL Database (ทำตามลำดับ)
1. เมนูซ้าย คลิก **"SQL Editor"** (ไอคอนหน้าต่างโค้ด `<>`)
2. คลิก **"New query"** (มุมซ้ายบน)
3. เปิดโฟลเดอร์ `migrations/` ในโปรเจกต์
4. รันไฟล์ทีละไฟล์ตามลำดับ:

```
เปิดไฟล์ → คัดลอกทั้งหมด (Ctrl+A, Ctrl+C)
→ วางในกล่อง SQL Editor (Ctrl+V)
→ คลิกปุ่ม "Run" (มุมขวาล่าง สีเขียว)
→ รอเห็น "Success" → ทำไฟล์ถัดไป
```

ลำดับไฟล์:
- `001_companies.sql`
- `002_users.sql`
- `003_user_line_accounts.sql`
- `004_organization_nodes.sql`
- `005_holidays.sql`
- `006_leave_policies.sql`
- `007_leave_balances.sql`
- `008_leave_requests.sql`
- `009_leave_approvals.sql`
- `010_jobs.sql`
- `011_timesheets.sql`
- `012_timesheet_lines.sql`
- `013_timesheet_approvals.sql`
- `014_notifications.sql`
- `015_audit_logs.sql`
- `016_functions.sql`
- `017_rls_policies.sql`
- `018_seed_companies.sql`  ← รันสุดท้าย

### 1.3 เก็บ API Keys
1. เมนูซ้าย คลิก **"Project Settings"** (ไอคอนฟันเฟือง ล่างสุด)
2. คลิก **"API"**
3. Copy ค่าเหล่านี้ไปวางใน Notepad:

```
Project URL    → ช่อง "URL"
anon public    → ช่อง "anon public" ใต้ "Project API keys"
service_role   → ช่อง "service_role" (กด Reveal เพื่อดู)
```

### 1.4 สร้าง Admin User แรก
1. เมนูซ้าย คลิก **"Authentication"** (ไอคอนรูปคน)
2. คลิกแท็บ **"Users"**
3. คลิปปุ่ม **"Add user"** → **"Create new user"**
4. กรอก:
   - Email: `admin@safecon.co.th`
   - Password: ตั้งรหัสผ่าน
5. คลิก **"Create user"**
6. **Copy UUID** ของ user ที่เพิ่งสร้าง (คอลัมน์ "UID" ยาวๆ)

7. กลับไปที่ **SQL Editor** → รัน SQL นี้:
```sql
UPDATE users
SET auth_user_id = 'PASTE-UUID-HERE'
WHERE email = 'admin@safecon.co.th';
```
แทน `PASTE-UUID-HERE` ด้วย UUID ที่ Copy มา

### 1.5 ทำซ้ำสำหรับ Highcon (ถ้าต้องการ)
```sql
-- สร้าง Auth User สำหรับ Highcon แล้วรัน:
UPDATE users
SET auth_user_id = 'PASTE-HIGHCON-ADMIN-UUID'
WHERE email = 'admin@highcon.co.th';
```

---

## ขั้นตอนที่ 2 — GitHub (เก็บโค้ด)

### 2.1 สมัคร / Login GitHub
ไปที่ https://github.com → Sign up หรือ Sign in

### 2.2 สร้าง Repository
1. คลิก **"+"** มุมขวาบน → **"New repository"**
2. กรอก:
   - **Repository name:** `hisafe-con`
   - เลือก **"Private"**
3. คลิก **"Create repository"**

### 2.3 อัปโหลดไฟล์โปรเจกต์
1. ในหน้า Repository ใหม่ คลิก **"uploading an existing file"**
2. **แตกไฟล์ ZIP** ของโปรเจกต์ก่อน
3. **ลาก folder `hisafe-con`** ทั้งโฟลเดอร์ (ยกเว้น `node_modules`) ใส่กล่อง
4. รอ Upload เสร็จ → คลิก **"Commit changes"**

---

## ขั้นตอนที่ 3 — Netlify (Deploy เว็บ)

### 3.1 สมัคร Netlify
ไปที่ https://netlify.com → คลิก **"Sign up"** → **"Sign up with GitHub"**

### 3.2 Connect GitHub Repository
1. หน้า Dashboard → คลิก **"Add new site"**
2. เลือก **"Import an existing project"**
3. คลิก **"Deploy with GitHub"**
4. เลือก Repository `hisafe-con`

### 3.3 ตั้งค่า Build
Netlify จะตรวจพบอัตโนมัติ ตรวจสอบให้ถูกต้อง:
```
Build command:  npm run build
Publish directory: .next
```

### 3.4 ใส่ Environment Variables (สำคัญมาก)
ก่อนกด Deploy → คลิก **"Add environment variables"**

เพิ่มทีละบรรทัด:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL จาก Supabase ขั้น 1.3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `NEXT_PUBLIC_APP_URL` | `https://ชื่อไซต์.netlify.app` (ใส่ชั่วคราวก่อน) |
| `NEXT_PUBLIC_APP_NAME` | `HiSafe-CON WorkSpace` |

### 3.5 Deploy
คลิก **"Deploy site"** → รอ 3-5 นาที

### 3.6 อัปเดต URL จริง
หลัง Deploy เสร็จ จะได้ URL เช่น `https://amazing-name-123.netlify.app`
1. ไปที่ **Site settings** → **Environment variables**
2. แก้ไข `NEXT_PUBLIC_APP_URL` ให้ตรงกับ URL จริง
3. คลิก **"Trigger deploy"** → **"Deploy site"** อีกครั้ง

---

## ขั้นตอนที่ 4 — ตั้งค่า Email (Gmail)

### 4.1 เปิด App Password
1. ไปที่ https://myaccount.google.com
2. คลิก **"Security"** (ความปลอดภัย)
3. หา **"2-Step Verification"** → เปิดใช้งานก่อน (ถ้ายังไม่ได้เปิด)
4. กลับหน้า Security → หา **"App passwords"**
5. ในช่อง "Select app" → เลือก **"Mail"**
6. ในช่อง "Select device" → เลือก **"Other"** → พิมพ์ว่า "HiSafe-CON"
7. คลิก **"Generate"** → จะได้รหัส 16 หลัก เช่น `abcd efgh ijkl mnop`

### 4.2 ใส่ค่าใน Netlify
ไปที่ Netlify → **Site settings** → **Environment variables** → เพิ่ม:

| Key | Value |
|-----|-------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `youremail@gmail.com` |
| `SMTP_PASSWORD` | รหัส 16 หลักที่ได้ (ไม่ต้องมีช่องว่าง) |
| `SMTP_FROM` | `youremail@gmail.com` |
| `SMTP_FROM_NAME` | `HiSafe-CON WorkSpace` |

→ Redeploy อีกครั้ง

---

## ขั้นตอนที่ 5 — ทดสอบ

1. เปิด URL ที่ได้จาก Netlify
2. Login ด้วย `admin@safecon.co.th` และรหัสผ่านที่ตั้งไว้
3. ถ้าเข้าได้ → ระบบพร้อมใช้งาน ✅

---

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
|-------|--------|---------|
| หน้าขาว / Error | Environment Variables ขาด | ตรวจสอบครบทุกตัว |
| Login ไม่ได้ | ยังไม่ได้ UPDATE auth_user_id | รัน SQL ขั้น 1.4 |
| Build failed | Plugin ขาด | ตรวจว่า netlify.toml อยู่ใน root |
| "no_profile" | User ใน DB ไม่ match | ตรวจ email ตรงกันไหม |
| SQL Error | รันไม่ตามลำดับ | รันใหม่ตั้งแต่ต้นตามลำดับ |

---

## Supabase Dashboard — ภาษาอังกฤษ แปลให้

| ที่เห็นในเว็บ | คืออะไร |
|--------------|---------|
| SQL Editor | ที่รัน SQL สร้างตาราง |
| Authentication > Users | จัดการบัญชีผู้ใช้ |
| Project Settings > API | เก็บ URL และ Keys |
| Table Editor | ดูข้อมูลในตาราง เหมือน Excel |
| Logs | ดู Error ต่างๆ |
| Storage | เก็บไฟล์/รูปภาพ |

---

*HiSafe-CON WorkSpace — Deploy Guide*
