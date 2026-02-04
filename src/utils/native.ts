/**
 * [WHY] 原生功能封装
 * [WHAT] 提供日历、通知等功能的统一接口
 * [FIX] #70, #69 添加系统日历和推送通知支持
 * [NOTE] 纯 Web 实现，不依赖 Capacitor 插件
 */

/**
 * [WHAT] 检查是否在原生环境（Android/iOS）
 * [NOTE] 简化实现：始终返回 false，使用 Web 功能
 */
export function isNativePlatform(): boolean {
  return false
}

/**
 * [WHAT] 获取当前平台
 */
export function getPlatform(): 'android' | 'ios' | 'web' {
  return 'web'
}

// ========== 日历相关功能 ==========

export interface CalendarEventData {
  title: string
  notes?: string
  startDate: Date
  endDate?: Date
  allDay?: boolean
}

/**
 * [FIX] #70 添加事件到系统日历
 * [WHAT] 通过下载 ICS 文件实现
 */
export async function addToSystemCalendar(event: CalendarEventData): Promise<boolean> {
  return downloadICSFile(event)
}

/**
 * [WHAT] 生成并下载 ICS 日历文件
 */
export function downloadICSFile(event: CalendarEventData): boolean {
  const { title, notes, startDate, endDate, allDay } = event
  const actualEndDate = endDate || new Date(startDate.getTime() + 60 * 60 * 1000)
  
  const formatDate = (date: Date, isAllDay?: boolean) => {
    if (isAllDay) {
      return date.toISOString().replace(/[-:]/g, '').split('T')[0]
    }
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  }
  
  const uid = `fund-event-${Date.now()}@fund-app`
  const dtStart = formatDate(startDate, allDay)
  const dtEnd = formatDate(actualEndDate, allDay)
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fund App//Calendar//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDate(new Date())}`,
    allDay ? `DTSTART;VALUE=DATE:${dtStart}` : `DTSTART:${dtStart}`,
    allDay ? `DTEND;VALUE=DATE:${dtEnd}` : `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    notes ? `DESCRIPTION:${notes.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n')
  
  try {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return true
  } catch (err) {
    console.error('[Calendar] ICS download failed:', err)
    return false
  }
}

// ========== 通知相关功能 ==========

export interface NotificationData {
  id: number
  title: string
  body: string
  schedule?: {
    at: Date
    repeats?: boolean
  }
}

/**
 * [FIX] #69 发送/调度本地通知
 * [WHAT] 使用 Web Notification API
 */
export async function scheduleNotification(data: NotificationData): Promise<boolean> {
  const { title, body, schedule } = data
  
  // 使用 Web Notification API
  if ('Notification' in window) {
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        if (schedule) {
          // 调度通知
          const delay = schedule.at.getTime() - Date.now()
          if (delay > 0) {
            setTimeout(() => {
              new Notification(title, { body })
            }, delay)
          }
        } else {
          new Notification(title, { body })
        }
        return true
      }
    } catch (err) {
      console.error('[Notification] Web API failed:', err)
    }
  }
  
  return false
}

/**
 * [WHAT] 取消已调度的通知
 * [NOTE] Web API 不支持取消，返回 false
 */
export async function cancelNotification(_id: number): Promise<boolean> {
  return false
}

/**
 * [WHAT] 检查通知权限状态
 */
export async function checkNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if ('Notification' in window) {
    return Notification.permission as 'granted' | 'denied' | 'prompt'
  }
  return 'denied'
}
