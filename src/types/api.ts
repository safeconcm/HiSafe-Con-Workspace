// src/types/api.ts
// Shared API request/response types

export interface ApiResponse<T = unknown> {
  data: T | null
  error: string | null
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

// Leave
export interface CreateLeaveRequestBody {
  leave_type: string
  start_date: string
  end_date: string
  is_half_day: boolean
  half_day_period?: 'morning' | 'afternoon'
  reason?: string
  attachment_url?: string
}

export interface ApproveLeaveBody {
  comment?: string
}

export interface RejectLeaveBody {
  rejection_reason: string
}

export interface AdjustLeaveBalanceBody {
  user_id: string
  leave_type: string
  year: number
  adjusted_days: number
  reason: string
}

// Timesheet
export interface SaveTimesheetLinesBody {
  lines: {
    work_date: string
    job_id: string
    hours: number
    remark?: string
  }[]
}

// Users
export interface CreateUserBody {
  employee_code: string
  email: string
  first_name_th: string
  last_name_th: string
  first_name_en?: string
  last_name_en?: string
  position_th?: string
  department?: string
  role: string
  hire_date: string
  phone?: string
}

export interface ImportUsersBody {
  users: (CreateUserBody & {
    annual_leave_balance?: number
    sick_leave_balance?: number
    personal_leave_balance?: number
  })[]
}
