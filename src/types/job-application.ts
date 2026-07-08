// src/types/job-application.ts
// Shared shape for the public online job application form — mirrors the
// paper "ใบสมัครงาน" (APPLICATION FOR EMPLOYMENT) used by Safecon & Highcon.
// Used by both the public form (src/app/apply/[company]) and the
// submission API route (src/app/api/public/job-applications).

export interface EducationRow {
  level:       string  // fixed label e.g. 'มัธยมศึกษาตอนปลาย'
  institution: string
  major:       string
  from:        string
  to:          string
}

export const EDUCATION_LEVELS = [
  'มัธยมศึกษาตอนปลาย',
  'ปวช.',
  'ปวท. / ปวส.',
  'ปริญญาตรี',
  'สูงกว่าปริญญาตรี',
  'อื่นๆ',
] as const

export interface WorkExperienceRow {
  company:          string
  from:             string
  to:               string
  position:         string
  job_description:  string
  salary:           string
  reason:           string
}

export interface SiblingRow {
  name:       string
  age:        string
  occupation: string
}

export interface ReferenceRow {
  name:       string
  address:    string
  phone:      string
  occupation: string
}

export type LangLevel = '' | 'good' | 'fair' | 'poor'

export interface LanguageSkill {
  speak: LangLevel
  write: LangLevel
  read:  LangLevel
}

export interface LanguageAbility {
  thai:    LanguageSkill
  english: LanguageSkill
  japanese: LanguageSkill
  other: LanguageSkill & { name: string }
}

export const EMPTY_LANGUAGE_SKILL: LanguageSkill = { speak: '', write: '', read: '' }

export interface JobApplicationPayload {
  // Position
  position_applied_1: string
  position_applied_2: string
  salary_expected:    string

  // Personal information
  full_name_th:         string
  address_no:            string
  address_moo:            string
  address_road:            string
  address_sub_district:    string
  address_district:         string
  address_province:          string
  address_postal_code:        string
  phone:                       string
  mobile:                      string
  email:                       string
  living_with:                 '' | 'parent' | 'own_home' | 'hired_house' | 'hired_flat'
  birth_date:                  string
  race:                        string
  nationality:                 string
  religion:                    string
  id_card_no:                  string
  id_card_expiry:              string
  height_cm:                   string
  weight_kg:                   string
  military_status:             '' | 'exempted' | 'served' | 'not_yet_served'
  marital_status:               '' | 'single' | 'married' | 'widowed' | 'separated'
  gender:                        '' | 'male' | 'female'

  // Family
  father_name:        string
  father_age:          string
  father_occupation:    string
  father_alive:          boolean
  mother_name:            string
  mother_age:              string
  mother_occupation:        string
  mother_alive:              boolean
  spouse_name:                string
  spouse_workplace:            string
  spouse_position:              string
  children_count:                string
  siblings_total:                  string
  siblings_male:                    string
  siblings_female:                   string
  birth_order:                        string
  siblings:                            SiblingRow[]

  education:       EducationRow[]
  work_experience: WorkExperienceRow[]

  language_ability: LanguageAbility

  typing_thai_wpm:      string
  typing_english_wpm:    string
  computer_skill:         string
  driving_license_no:      string
  office_machine_skill:     string
  hobbies:                   string
  favourite_sport:            string
  special_knowledge:           string
  other_ability:                 string
  can_work_upcountry:              '' | 'yes' | 'no'
  can_work_upcountry_note:           string

  emergency_contact_name:      string
  emergency_contact_relation:   string
  emergency_contact_address:     string
  emergency_contact_phone:        string

  source_of_info:            string
  had_serious_illness:        '' | 'yes' | 'no'
  serious_illness_detail:      string
  applied_before:                '' | 'yes' | 'no'
  applied_before_when:            string
  known_relatives_friends:          string
  reference_contacts:                ReferenceRow[]
  self_introduction:                  string

  consent_confirmed: boolean
  signature_data_url: string
}

export const emptyJobApplicationPayload = (): JobApplicationPayload => ({
  position_applied_1: '', position_applied_2: '', salary_expected: '',
  full_name_th: '', address_no: '', address_moo: '', address_road: '',
  address_sub_district: '', address_district: '', address_province: '', address_postal_code: '',
  phone: '', mobile: '', email: '', living_with: '', birth_date: '', race: '', nationality: 'ไทย',
  religion: '', id_card_no: '', id_card_expiry: '', height_cm: '', weight_kg: '',
  military_status: '', marital_status: '', gender: '',
  father_name: '', father_age: '', father_occupation: '', father_alive: true,
  mother_name: '', mother_age: '', mother_occupation: '', mother_alive: true,
  spouse_name: '', spouse_workplace: '', spouse_position: '',
  children_count: '', siblings_total: '', siblings_male: '', siblings_female: '', birth_order: '',
  siblings: [],
  education: EDUCATION_LEVELS.map(level => ({ level, institution: '', major: '', from: '', to: '' })),
  work_experience: [{ company: '', from: '', to: '', position: '', job_description: '', salary: '', reason: '' }],
  language_ability: {
    thai: { ...EMPTY_LANGUAGE_SKILL }, english: { ...EMPTY_LANGUAGE_SKILL },
    japanese: { ...EMPTY_LANGUAGE_SKILL }, other: { ...EMPTY_LANGUAGE_SKILL, name: '' },
  },
  typing_thai_wpm: '', typing_english_wpm: '', computer_skill: '', driving_license_no: '',
  office_machine_skill: '', hobbies: '', favourite_sport: '', special_knowledge: '', other_ability: '',
  can_work_upcountry: '', can_work_upcountry_note: '',
  emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_address: '', emergency_contact_phone: '',
  source_of_info: '', had_serious_illness: '', serious_illness_detail: '',
  applied_before: '', applied_before_when: '', known_relatives_friends: '',
  reference_contacts: [{ name: '', address: '', phone: '', occupation: '' }, { name: '', address: '', phone: '', occupation: '' }],
  self_introduction: '',
  consent_confirmed: false, signature_data_url: '',
})

export const LIVING_WITH_LABEL: Record<string, string> = {
  parent: 'อาศัยกับครอบครัว', own_home: 'บ้านตัวเอง', hired_house: 'บ้านเช่า', hired_flat: 'หอพัก',
}
export const MILITARY_STATUS_LABEL: Record<string, string> = {
  exempted: 'ได้รับการยกเว้น', served: 'ปลดเป็นทหารกองหนุน', not_yet_served: 'ยังไม่ได้รับการเกณฑ์',
}
export const MARITAL_STATUS_LABEL: Record<string, string> = {
  single: 'โสด', married: 'แต่งงาน', widowed: 'หม้าย', separated: 'แยกกัน',
}
export const GENDER_LABEL: Record<string, string> = { male: 'ชาย', female: 'หญิง' }
export const LANG_LEVEL_LABEL: Record<string, string> = { good: 'ดี', fair: 'ปานกลาง', poor: 'พอใช้' }

export const JOB_APPLICATION_STATUS_LABEL: Record<string, string> = {
  new: 'ใหม่', reviewing: 'กำลังพิจารณา', interview: 'นัดสัมภาษณ์', hired: 'รับเข้าทำงาน', rejected: 'ไม่ผ่าน',
}
export const JOB_APPLICATION_STATUS_COLOR: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700', reviewing: 'bg-amber-100 text-amber-700',
  interview: 'bg-purple-100 text-purple-700', hired: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}
