// [WHY] API 测试脚本 - 验证所有 API 接口是否正常工作
// [WHAT] 在浏览器控制台中运行测试

import { 
  fetchFundStyle, 
  fetchIndexValuations, 
  fetchHolderStructure, 
  fetchFundRankInfo,
  fetchFundRating,
  fetchHotThemes,
  fetchMarketOverview,
  fetchSectorFunds,
  fetchFinanceNews,
  fetchFundScale,
  isTradingTime,
  getTradingSession,
  hasMarketOpenedToday
} from '@/api/tiantianApi'

import {
  fetchFundEstimate,
  searchFund,
  fetchNetValueHistory,
  fetchStockHoldings,
  fetchMarketIndices,
  fetchFundDetailInfo,
  fetchFundManagerInfo
} from '@/api/fund'

import {
  fetchFundEstimateFast,
  fetchSimpleKLineData,
  fetchGlobalIndices,
  fetchIndustryAllocation,
  fetchAssetAllocation
} from '@/api/fundFast'

interface TestResult {
  name: string
  success: boolean
  data?: unknown
  error?: string
  time: number
}

const results: TestResult[] = []

async function testApi(name: string, fn: () => Promise<unknown>): Promise<void> {
  const start = Date.now()
  try {
    const data = await fn()
    const time = Date.now() - start
    results.push({ name, success: true, data, time })
    console.log(`✅ ${name} (${time}ms)`, data)
  } catch (error) {
    const time = Date.now() - start
    const errorMsg = error instanceof Error ? error.message : String(error)
    results.push({ name, success: false, error: errorMsg, time })
    console.error(`❌ ${name} (${time}ms)`, errorMsg)
  }
}

/**
 * 运行所有 API 测试
 * [HOW] 在浏览器控制台执行: import('@/utils/apiTest').then(m => m.runAllTests())
 */
export async function runAllTests(): Promise<TestResult[]> {
  results.length = 0
  const testCode = '519915' // 交银新成长混合作为测试基金
  
  console.log('========== 开始 API 测试 ==========')
  console.log(`测试基金代码: ${testCode}`)
  console.log(`当前时间: ${new Date().toLocaleString()}`)
  console.log(`交易时段: ${getTradingSession()}`)
  console.log(`是否交易时间: ${isTradingTime()}`)
  console.log(`今日是否已开盘: ${hasMarketOpenedToday()}`)
  console.log('')

  // ========== 基础 API ==========
  console.log('--- 基础 API ---')
  await testApi('搜索基金', () => searchFund('白酒', 5))
  await testApi('基金估值', () => fetchFundEstimate(testCode))
  await testApi('基金估值(快速)', () => fetchFundEstimateFast(testCode))
  await testApi('历史净值', () => fetchNetValueHistory(testCode, 30))
  await testApi('K线数据', () => fetchSimpleKLineData(testCode, 30))
  
  // ========== 基金详情 API ==========
  console.log('')
  console.log('--- 基金详情 API ---')
  await testApi('基金详情', () => fetchFundDetailInfo(testCode))
  await testApi('基金规模', () => fetchFundScale(testCode))
  await testApi('基金评级', () => fetchFundRating(testCode))
  await testApi('基金风格', () => fetchFundStyle(testCode))
  await testApi('持有人结构', () => fetchHolderStructure(testCode))
  await testApi('同类排名', () => fetchFundRankInfo(testCode))
  await testApi('重仓股票', () => fetchStockHoldings(testCode))
  await testApi('行业配置', () => fetchIndustryAllocation(testCode))
  await testApi('资产配置', () => fetchAssetAllocation(testCode))
  await testApi('基金经理', () => fetchFundManagerInfo(testCode))
  
  // ========== 市场 API ==========
  console.log('')
  console.log('--- 市场 API ---')
  await testApi('市场指数', () => fetchMarketIndices())
  await testApi('全球指数', () => fetchGlobalIndices())
  await testApi('市场概览', () => fetchMarketOverview())
  await testApi('指数估值', () => fetchIndexValuations())
  await testApi('热门主题', () => fetchHotThemes())
  await testApi('行业板块', () => fetchSectorFunds())
  await testApi('财经资讯', () => fetchFinanceNews(5))
  
  // ========== 汇总 ==========
  console.log('')
  console.log('========== 测试结果汇总 ==========')
  const passed = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const totalTime = results.reduce((sum, r) => sum + r.time, 0)
  
  console.log(`总计: ${results.length} 个接口`)
  console.log(`通过: ${passed} ✅`)
  console.log(`失败: ${failed} ❌`)
  console.log(`总耗时: ${totalTime}ms`)
  
  if (failed > 0) {
    console.log('')
    console.log('失败的接口:')
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`)
    })
  }
  
  return results
}

/**
 * 快速测试新增的 API
 */
export async function testNewApis(): Promise<void> {
  const testCode = '519915'
  
  console.log('========== 测试新增 API ==========')
  
  await testApi('基金风格', () => fetchFundStyle(testCode))
  await testApi('指数估值', () => fetchIndexValuations())
  await testApi('持有人结构', () => fetchHolderStructure(testCode))
  await testApi('同类排名', () => fetchFundRankInfo(testCode))
  
  console.log('========== 测试完成 ==========')
}

// [WHAT] 自动导出到全局，方便控制台调用
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).testApis = runAllTests;
  (window as unknown as Record<string, unknown>).testNewApis = testNewApis
  console.log('API测试已加载。运行 testApis() 测试所有接口，或 testNewApis() 测试新接口')
}
