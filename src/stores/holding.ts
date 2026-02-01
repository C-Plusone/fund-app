// [WHY] 持仓数据状态管理，计算收益和汇总统计
// [WHAT] 管理用户录入的持仓信息，结合实时估值计算浮动盈亏
// [WHAT] 支持 A类/C类基金费用计算
// [DEPS] 依赖 fund store 获取实时估值，依赖 storage 持久化数据

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HoldingRecord, HoldingSummary, FundEstimate } from '@/types/fund'
import {
  getHoldings,
  upsertHolding,
  removeHolding as removeFromStorage
} from '@/utils/storage'
import { fetchFundEstimateFast } from '@/api/fundFast'
import { calculateDailyServiceFee } from '@/api/fund'

/** 持仓项（包含实时估值和收益计算） */
export interface HoldingWithProfit extends HoldingRecord {
  /** 当前估值（净值） */
  currentValue?: number
  /** 当前市值 */
  marketValue?: number
  /** 持有收益金额 */
  profit?: number
  /** 持有收益率 */
  profitRate?: number
  /** 当日涨跌幅 */
  todayChange?: string
  /** 当日收益金额 */
  todayProfit?: number
  /** 是否加载中 */
  loading?: boolean
}

export const useHoldingStore = defineStore('holding', () => {
  // ========== State ==========
  
  /** 持仓列表（包含收益计算） */
  const holdings = ref<HoldingWithProfit[]>([])
  
  /** 是否正在刷新 */
  const isRefreshing = ref(false)

  // ========== Getters ==========

  /** 持仓汇总统计 */
  const summary = computed<HoldingSummary>(() => {
    let totalValue = 0
    let totalCost = 0
    let todayProfit = 0

    holdings.value.forEach((h) => {
      if (h.marketValue !== undefined) {
        totalValue += h.marketValue
      }
      totalCost += h.amount // 持仓成本就是买入金额
      if (h.todayProfit !== undefined) {
        todayProfit += h.todayProfit
      }
    })

    const totalProfit = totalValue - totalCost
    const totalProfitRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0

    return {
      totalValue,
      totalCost,
      totalProfit,
      totalProfitRate,
      todayProfit
    }
  })

  /** 持仓基金代码列表 */
  const holdingCodes = computed(() => holdings.value.map((h) => h.code))

  // ========== Actions ==========

  /**
   * 初始化持仓列表
   * [WHY] APP 启动时从本地存储恢复数据
   */
  function initHoldings() {
    const records = getHoldings()
    holdings.value = records.map((r) => ({
      ...r,
      loading: true
    }))
    // 初始化后立即刷新估值
    if (records.length > 0) {
      refreshEstimates()
    }
  }

  /**
   * 刷新所有持仓的估值和收益
   */
  async function refreshEstimates() {
    if (holdings.value.length === 0) {
      // [EDGE] 没有持仓时也需要重置刷新状态
      isRefreshing.value = false
      return
    }

    isRefreshing.value = true
    const codes = holdings.value.map((h) => h.code)

    try {
      // [WHAT] 并发请求所有基金估值
      const results = await Promise.all(
        codes.map(code => fetchFundEstimateFast(code).catch(() => null))
      )
      
      results.forEach((data, index) => {
        if (data) {
          updateHoldingWithEstimate(codes[index], data)
        } else {
          // [EDGE] 请求失败时标记加载完成
          const item = holdings.value.find((h) => h.code === codes[index])
          if (item) {
            item.loading = false
          }
        }
      })
    } finally {
      isRefreshing.value = false
    }
  }

  /**
   * 更新单只持仓的估值和收益
   * [WHAT] 根据实时估值计算市值和浮动盈亏
   * [WHAT] 考虑 A类买入手续费和 C类销售服务费
   */
  function updateHoldingWithEstimate(code: string, data: FundEstimate) {
    const index = holdings.value.findIndex((h) => h.code === code)
    if (index === -1) return

    const holding = holdings.value[index]
    const estimateValue = parseFloat(data.gsz) || 0
    const lastValue = parseFloat(data.dwjz) || 0
    
    // [EDGE] 如果估值为0（非交易时间），使用昨收净值计算市值
    const currentValue = estimateValue > 0 ? estimateValue : lastValue
    
    // [EDGE] 如果净值都无效，跳过计算
    if (currentValue <= 0) {
      holdings.value[index] = {
        ...holding,
        name: data.name || holding.name,
        loading: false
      }
      return
    }
    
    // [EDGE] 如果份额无效或为0，根据买入金额和当前净值重新计算
    let shares = holding.shares
    if (!shares || shares <= 0) {
      // 使用买入净值计算，如果买入净值也无效则用当前净值
      const buyNav = holding.buyNetValue > 0 ? holding.buyNetValue : currentValue
      shares = holding.amount / buyNav
    }
    
    // [WHAT] 计算市值
    const marketValue = shares * currentValue
    
    // [WHAT] 计算成本（考虑 A类手续费）
    let cost = holding.amount
    // C类：计算累计销售服务费
    let totalServiceFee = 0
    if (holding.shareClass === 'C' && holding.serviceFeeRate) {
      // [WHAT] 计算从买入日到现在的累计销售服务费
      const days = holding.holdingDays || 0
      if (days > 0) {
        const dailyFee = calculateDailyServiceFee(shares, currentValue, holding.serviceFeeRate)
        totalServiceFee = dailyFee * days
      }
    }
    
    // [WHAT] 计算收益（C类需要扣除累计服务费）
    const profit = marketValue - cost - totalServiceFee
    const profitRate = cost > 0 ? (profit / cost) * 100 : 0
    
    // [WHAT] 计算当日收益 = 持有份额 × (当前估值 - 昨日净值) - 当日服务费
    // [WHY] 如果今天休市（估值时间不是今天），当日收益应该为 0
    let todayProfit = 0
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const gzDate = data.gztime?.split(' ')[0] || '' // 从 "2024-01-01 15:00" 提取日期
    const isTradingDay = gzDate === today
    
    if (isTradingDay) {
      // [WHAT] 今天是交易日，正常计算当日收益
      todayProfit = shares * (currentValue - lastValue)
      if (holding.shareClass === 'C' && holding.serviceFeeRate) {
        const dailyFee = calculateDailyServiceFee(shares, currentValue, holding.serviceFeeRate)
        todayProfit -= dailyFee
      }
    }
    // [ELSE] 休市日当日收益为 0，不计算

    holdings.value[index] = {
      ...holding,
      name: data.name || holding.name,
      currentValue,
      marketValue,
      profit,
      profitRate,
      // [WHY] 休市日当日涨跌幅显示为 0
      todayChange: isTradingDay ? data.gszzl : '0.00',
      todayProfit,
      loading: false,
      // [WHAT] 更新份额（如果原来无效）
      shares: shares,
      // [WHAT] 更新 C类累计服务费
      serviceFeeDeducted: holding.shareClass === 'C' ? totalServiceFee : undefined
    }
  }

  /**
   * 添加或更新持仓
   * @param record 持仓记录
   */
  async function addOrUpdateHolding(record: HoldingRecord) {
    upsertHolding(record)
    
    // [WHAT] 更新内存中的数据
    const index = holdings.value.findIndex((h) => h.code === record.code)
    if (index > -1) {
      holdings.value[index] = {
        ...holdings.value[index],
        ...record
      }
    } else {
      holdings.value.push({
        ...record,
        loading: true
      })
    }
    
    // 刷新估值
    await refreshEstimates()
  }

  /**
   * 删除持仓
   */
  function removeHolding(code: string) {
    removeFromStorage(code)
    const index = holdings.value.findIndex((h) => h.code === code)
    if (index > -1) {
      holdings.value.splice(index, 1)
    }
  }

  /**
   * 检查是否有该基金的持仓
   */
  function hasHolding(code: string): boolean {
    return holdingCodes.value.includes(code)
  }

  /**
   * 获取单个持仓
   */
  function getHoldingByCode(code: string): HoldingWithProfit | undefined {
    return holdings.value.find((h) => h.code === code)
  }

  /**
   * 更新持仓天数
   * [WHY] 每次刷新时更新持仓天数
   */
  function updateHoldingDays() {
    const today = new Date()
    holdings.value.forEach((h) => {
      if (h.buyDate) {
        const buyDate = new Date(h.buyDate)
        const diffTime = today.getTime() - buyDate.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        h.holdingDays = diffDays
      }
    })
  }

  return {
    // State
    holdings,
    isRefreshing,
    // Getters
    summary,
    holdingCodes,
    // Actions
    initHoldings,
    refreshEstimates,
    addOrUpdateHolding,
    removeHolding,
    hasHolding,
    getHoldingByCode,
    updateHoldingDays
  }
})
