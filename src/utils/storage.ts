// [WHY] 封装 localStorage 操作，提供类型安全的数据持久化
// [WHAT] 自选列表、持仓数据等需要在 APP 重启后保留

const STORAGE_KEYS = {
  WATCHLIST: 'fund_watchlist',
  HOLDINGS: 'fund_holdings'
} as const

/**
 * 通用存储读取函数
 * [WHY] 统一处理 JSON 解析和错误处理
 * [EDGE] 数据不存在或解析失败时返回默认值
 */
function getItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

/**
 * 通用存储写入函数
 */
function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

// ========== 自选列表 ==========

/**
 * 获取自选基金代码列表
 */
export function getWatchlist(): string[] {
  return getItem<string[]>(STORAGE_KEYS.WATCHLIST, [])
}

/**
 * 保存自选基金代码列表
 */
export function saveWatchlist(codes: string[]): void {
  setItem(STORAGE_KEYS.WATCHLIST, codes)
}

/**
 * 添加基金到自选
 * [EDGE] 已存在则不重复添加
 */
export function addToWatchlist(code: string): void {
  const list = getWatchlist()
  if (!list.includes(code)) {
    list.unshift(code) // 新添加的排在前面
    saveWatchlist(list)
  }
}

/**
 * 从自选中移除基金
 */
export function removeFromWatchlist(code: string): void {
  const list = getWatchlist()
  const index = list.indexOf(code)
  if (index > -1) {
    list.splice(index, 1)
    saveWatchlist(list)
  }
}

/**
 * 检查基金是否在自选中
 */
export function isInWatchlist(code: string): boolean {
  return getWatchlist().includes(code)
}

// ========== 持仓数据 ==========

import type { HoldingRecord } from '@/types/fund'

/**
 * 获取持仓列表
 */
export function getHoldings(): HoldingRecord[] {
  return getItem<HoldingRecord[]>(STORAGE_KEYS.HOLDINGS, [])
}

/**
 * 保存持仓列表
 */
export function saveHoldings(holdings: HoldingRecord[]): void {
  setItem(STORAGE_KEYS.HOLDINGS, holdings)
}

/**
 * 添加或更新持仓
 * [WHAT] 如果已存在同代码持仓，则更新；否则新增
 */
export function upsertHolding(holding: HoldingRecord): void {
  const list = getHoldings()
  const index = list.findIndex((h) => h.code === holding.code)
  if (index > -1) {
    list[index] = holding
  } else {
    list.push(holding)
  }
  saveHoldings(list)
}

/**
 * 删除持仓
 */
export function removeHolding(code: string): void {
  const list = getHoldings()
  const filtered = list.filter((h) => h.code !== code)
  saveHoldings(filtered)
}

/**
 * 获取单个持仓
 */
export function getHolding(code: string): HoldingRecord | undefined {
  return getHoldings().find((h) => h.code === code)
}
