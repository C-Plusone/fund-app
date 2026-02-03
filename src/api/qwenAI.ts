/**
 * 通义千问 AI 日报服务
 * [WHY] 调用千问大模型生成专业的每日基金市场分析日报
 * [WHAT] 基于持仓数据和市场行情生成个性化投资分析
 */

// [WHAT] 千问 API 配置
const QWEN_API_KEY = 'sk-bad0f1e88ad9498ea9144856618fd483'
const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

/** 日报内容结构 */
export interface DailyReport {
  date: string
  marketSummary: string      // 市场概况
  holdingAnalysis: string    // 持仓分析
  hotSectors: string         // 热门板块
  riskWarning: string        // 风险提示
  suggestion: string         // 操作建议
  fullContent: string        // 完整内容
  generatedAt: string
}

/** 持仓摘要（用于AI分析） */
export interface HoldingSummaryForAI {
  totalValue: number
  totalProfit: number
  profitRate: number
  todayProfit: number
  holdings: {
    name: string
    code: string
    marketValue: number
    profitRate: number
    todayChange: string
  }[]
}

/** 市场数据（用于AI分析） */
export interface MarketDataForAI {
  indices: {
    name: string
    value: number
    change: number
  }[]
  hotSectors?: string[]
}

/**
 * 生成每日日报
 * [WHY] 结合用户持仓和市场数据，生成个性化的投资分析报告
 */
export async function generateDailyReport(
  holdingSummary: HoldingSummaryForAI,
  marketData: MarketDataForAI
): Promise<DailyReport> {
  const today = new Date().toISOString().split('T')[0]
  
  // [WHAT] 构建提示词
  const prompt = buildReportPrompt(holdingSummary, marketData)
  
  try {
    const response = await fetch(QWEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QWEN_API_KEY}`
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一位专业的基金投资分析师，擅长市场分析和投资建议。
请根据用户的持仓数据和当日市场行情，生成一份专业、简洁的每日投资日报。
要求：
1. 语言专业但易懂
2. 分析要有数据支撑
3. 建议要具体可操作
4. 风险提示要到位
5. 控制在500字以内`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    })
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    
    // [WHAT] 解析AI返回的内容
    return parseReportContent(content, today)
    
  } catch (error) {
    console.error('[AI日报] 生成失败:', error)
    // [EDGE] 失败时返回默认日报
    return generateFallbackReport(holdingSummary, today)
  }
}

/**
 * 构建报告提示词
 */
function buildReportPrompt(
  holding: HoldingSummaryForAI,
  market: MarketDataForAI
): string {
  const holdingList = holding.holdings
    .slice(0, 10)
    .map(h => `- ${h.name}(${h.code}): 市值${formatMoney(h.marketValue)}，收益率${h.profitRate.toFixed(2)}%，今日${h.todayChange}`)
    .join('\n')
  
  const indexList = market.indices
    .map(i => `- ${i.name}: ${i.value.toFixed(2)}，涨跌${i.change >= 0 ? '+' : ''}${i.change.toFixed(2)}%`)
    .join('\n')
  
  return `
## 今日市场行情
${indexList}

## 我的持仓概况
- 总资产: ${formatMoney(holding.totalValue)}
- 总收益: ${formatMoney(holding.totalProfit)}（${holding.profitRate.toFixed(2)}%）
- 今日收益: ${formatMoney(holding.todayProfit)}

## 持仓明细
${holdingList}

请根据以上数据生成今日投资日报，包含：
1. 【市场概况】今日大盘走势分析
2. 【持仓分析】我的持仓表现点评
3. 【热点追踪】当前市场热点板块
4. 【风险提示】需要注意的风险
5. 【操作建议】接下来的操作策略
`
}

/**
 * 解析AI返回的内容
 */
function parseReportContent(content: string, date: string): DailyReport {
  // [WHAT] 尝试按标题分割内容
  const sections: Record<string, string> = {}
  const patterns = [
    { key: 'marketSummary', regex: /【市场概况】([\s\S]*?)(?=【|$)/ },
    { key: 'holdingAnalysis', regex: /【持仓分析】([\s\S]*?)(?=【|$)/ },
    { key: 'hotSectors', regex: /【热点追踪】([\s\S]*?)(?=【|$)/ },
    { key: 'riskWarning', regex: /【风险提示】([\s\S]*?)(?=【|$)/ },
    { key: 'suggestion', regex: /【操作建议】([\s\S]*?)(?=【|$)/ }
  ]
  
  for (const { key, regex } of patterns) {
    const match = content.match(regex)
    sections[key] = match ? match[1].trim() : ''
  }
  
  return {
    date,
    marketSummary: sections['marketSummary'] || '暂无数据',
    holdingAnalysis: sections['holdingAnalysis'] || '暂无数据',
    hotSectors: sections['hotSectors'] || '暂无数据',
    riskWarning: sections['riskWarning'] || '投资有风险，入市需谨慎',
    suggestion: sections['suggestion'] || '建议持仓观望',
    fullContent: content,
    generatedAt: new Date().toISOString()
  }
}

/**
 * 生成备用日报（API失败时）
 */
function generateFallbackReport(holding: HoldingSummaryForAI, date: string): DailyReport {
  const profitStatus = holding.todayProfit >= 0 ? '盈利' : '亏损'
  const profitAmount = Math.abs(holding.todayProfit).toFixed(2)
  
  return {
    date,
    marketSummary: '今日市场波动，请关注大盘走势。',
    holdingAnalysis: `您的持仓今日${profitStatus}${profitAmount}元，整体收益率${holding.profitRate.toFixed(2)}%。`,
    hotSectors: '请关注市场热点板块轮动。',
    riskWarning: '市场有风险，投资需谨慎。建议分散投资，控制仓位。',
    suggestion: '建议保持关注，根据市场变化适时调整。',
    fullContent: `今日投资日报\n\n您的持仓今日${profitStatus}${profitAmount}元。\n\n投资有风险，入市需谨慎。`,
    generatedAt: new Date().toISOString()
  }
}

/**
 * 格式化金额
 */
function formatMoney(value: number): string {
  if (Math.abs(value) >= 10000) {
    return (value / 10000).toFixed(2) + '万'
  }
  return value.toFixed(2) + '元'
}

/**
 * 获取缓存的日报（避免重复调用API）
 */
export function getCachedReport(): DailyReport | null {
  try {
    const cached = localStorage.getItem('daily_report')
    if (!cached) return null
    
    const report = JSON.parse(cached) as DailyReport
    const today = new Date().toISOString().split('T')[0]
    
    // [WHAT] 只返回当天的缓存
    if (report.date === today) {
      return report
    }
    return null
  } catch {
    return null
  }
}

/**
 * 检查今天是否已生成过日报
 * [WHY] 限制每天只能生成一次，节省API调用
 */
export function hasGeneratedToday(): boolean {
  const cached = getCachedReport()
  return cached !== null
}

/**
 * 缓存日报
 */
export function cacheReport(report: DailyReport): void {
  try {
    localStorage.setItem('daily_report', JSON.stringify(report))
  } catch {
    // 忽略存储错误
  }
}
