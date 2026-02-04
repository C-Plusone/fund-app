// [WHY] OCR 识别服务 - 用于从截图中识别基金持仓信息
// [WHAT] 使用 Tesseract.js 进行本地文字识别，无需外部 API
// [DEPS] 依赖 tesseract.js 库

import Tesseract from 'tesseract.js'

/**
 * 识别结果中的持仓项
 */
export interface RecognizedHolding {
  /** 基金代码（6位数字），可能为空（需要通过名称搜索） */
  code: string
  /** 基金名称 */
  name: string
  /** 持仓金额（元） */
  amount: number
  /** 持有份额（可选） */
  shares?: number
  /** 识别置信度（0-1） */
  confidence: number
  /** 是否需要手动匹配代码（名称识别但无代码） */
  needsCodeMatch?: boolean
}

/**
 * OCR 识别进度回调
 */
export type OcrProgressCallback = (progress: number, status: string) => void

/**
 * 从图片中识别文字
 * [WHY] 使用 Tesseract.js 进行本地 OCR，支持中英文混合识别
 * [WHAT] 返回识别出的原始文字
 * @param imageSource 图片来源（File 对象、URL 或 Base64）
 * @param onProgress 进度回调
 */
export async function recognizeText(
  imageSource: File | string,
  onProgress?: OcrProgressCallback
): Promise<string> {
  const worker = await Tesseract.createWorker('chi_sim+eng', undefined, {
    logger: (m) => {
      if (onProgress && m.status) {
        const progress = m.progress || 0
        const statusMap: Record<string, string> = {
          'loading tesseract core': '加载识别引擎...',
          'initializing tesseract': '初始化引擎...',
          'loading language traineddata': '加载语言包...',
          'initializing api': '准备识别...',
          'recognizing text': '识别文字中...'
        }
        onProgress(progress, statusMap[m.status] || m.status)
      }
    }
  })

  try {
    const result = await worker.recognize(imageSource)
    return result.data.text
  } finally {
    await worker.terminate()
  }
}

/**
 * 从识别文字中解析持仓信息
 * [WHY] 不同平台的截图格式不同，需要灵活解析
 * [WHAT] 尝试多种模式匹配，提取基金代码、名称、金额等信息
 */
export function parseHoldingText(text: string): RecognizedHolding[] {
  const holdings: RecognizedHolding[] = []
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  
  // [WHAT] 预处理：合并相邻行（有些平台名称和代码在不同行）
  const processedLines = preprocessLines(lines)
  
  // [WHAT] 解析每一行，尝试提取持仓信息
  for (const line of processedLines) {
    const holding = parseSingleLine(line)
    if (holding) {
      holdings.push(holding)
    }
  }
  
  // [WHAT] 如果单行解析失败，尝试多行组合解析
  if (holdings.length === 0) {
    const multiLineHoldings = parseMultiLine(lines)
    holdings.push(...multiLineHoldings)
  }
  
  // [NEW] 如果仍然没有结果，尝试支付宝格式解析（只有名称没有代码）
  if (holdings.length === 0) {
    const alipayHoldings = parseAlipayFormat(lines)
    holdings.push(...alipayHoldings)
  }
  
  // [NEW] 对于有代码的结果，也尝试补充支付宝格式解析的结果
  // 因为可能部分有代码部分没有
  if (holdings.length > 0 && holdings.every(h => h.code)) {
    const alipayHoldings = parseAlipayFormat(lines)
    // 只添加名称不重复的
    for (const ah of alipayHoldings) {
      const exists = holdings.some(h => 
        h.name === ah.name || 
        (h.name && ah.name && h.name.includes(ah.name.substring(0, 4)))
      )
      if (!exists) {
        holdings.push(ah)
      }
    }
  }
  
  return holdings
}

/**
 * 预处理文本行
 * [WHY] 有些 OCR 结果会把基金名称和代码分到不同行
 */
function preprocessLines(lines: string[]): string[] {
  const result: string[] = []
  let buffer = ''
  
  for (const line of lines) {
    // [WHAT] 如果当前行只有基金代码，与前一行合并
    if (/^\d{6}$/.test(line) && buffer) {
      result.push(`${buffer} ${line}`)
      buffer = ''
    } else if (/^[A-Za-z\u4e00-\u9fa5]+[A-Za-z0-9\u4e00-\u9fa5]*$/.test(line) && !containsNumber(line)) {
      // [WHAT] 纯文字行可能是基金名称，暂存
      buffer = line
    } else {
      if (buffer) {
        result.push(`${buffer} ${line}`)
        buffer = ''
      } else {
        result.push(line)
      }
    }
  }
  
  if (buffer) {
    result.push(buffer)
  }
  
  return result
}

/**
 * 检查字符串是否包含数字
 */
function containsNumber(str: string): boolean {
  return /\d/.test(str)
}

/**
 * 解析单行文本
 * [WHY] 单行可能包含完整的持仓信息
 */
function parseSingleLine(line: string): RecognizedHolding | null {
  // [WHAT] 模式1：基金代码（6位数字）+ 基金名称 + 金额
  // 例如：000001 华夏成长 10,000.00
  const pattern1 = /(\d{6})\s*([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5]*)\s+([\d,]+\.?\d*)/
  const match1 = line.match(pattern1)
  if (match1) {
    return {
      code: match1[1],
      name: cleanFundName(match1[2]),
      amount: parseAmount(match1[3]),
      confidence: 0.9
    }
  }
  
  // [WHAT] 模式2：基金名称 + 基金代码 + 金额
  // 例如：华夏成长 000001 10,000.00
  const pattern2 = /([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5]*)\s*(\d{6})\s+([\d,]+\.?\d*)/
  const match2 = line.match(pattern2)
  if (match2) {
    return {
      code: match2[2],
      name: cleanFundName(match2[1]),
      amount: parseAmount(match2[3]),
      confidence: 0.9
    }
  }
  
  // [WHAT] 模式3：只有基金代码和金额
  // 例如：000001 10,000.00
  const pattern3 = /(\d{6})\s+([\d,]+\.?\d*)/
  const match3 = line.match(pattern3)
  if (match3) {
    return {
      code: match3[1],
      name: '', // 名称后续通过 API 获取
      amount: parseAmount(match3[2]),
      confidence: 0.7
    }
  }
  
  // [WHAT] 模式4：支付宝/天天基金格式 - 名称在前，金额较大
  // 例如：华夏成长混合A 持有金额 ¥10,000.00
  const pattern4 = /([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5]{2,})\s*.*?[¥￥]?\s*([\d,]+\.?\d{2})/
  const match4 = line.match(pattern4)
  if (match4 && parseAmount(match4[2]) >= 100) { // 金额至少100元
    // [WHAT] 尝试从名称中提取基金代码
    const codeMatch = line.match(/\d{6}/)
    return {
      code: codeMatch ? codeMatch[0] : '',
      name: cleanFundName(match4[1]),
      amount: parseAmount(match4[2]),
      confidence: codeMatch ? 0.6 : 0.5,
      needsCodeMatch: !codeMatch // [NEW] 标记需要手动匹配代码
    }
  }
  
  return null
}

/**
 * 解析支付宝持仓截图格式（只有名称没有代码）
 * [WHY] 支付宝持仓页面不显示基金代码，只显示名称和金额
 * [WHAT] 专门解析 "基金名称" + "金额" 的格式
 */
function parseAlipayFormat(lines: string[]): RecognizedHolding[] {
  const holdings: RecognizedHolding[] = []
  
  // [WHAT] 支付宝常见的基金名称关键词
  const fundKeywords = ['混合', 'ETF', '联接', '指数', '债券', '股票', '增强', 'LOF', 'QDII', '主题', '精选', '成长', '价值', '量化', '稳健', '纯债', '短债', '定开', '创新', '科技', '消费', '医药', '新能源', '半导体', '智选', '优选', '龙头', '增利']
  
  // [WHAT] 需要排除的非基金名称关键词
  const excludeKeywords = ['持有', '收益', '金额', '份额', '净值', '估值', '日收益', '持有收益', '累计收益', '我的', '全部', '偏股', '偏债', '黄金', '排序', '名称', '添加', '管理']
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    // [WHAT] 检查是否包含基金名称关键词
    const isFundName = fundKeywords.some(kw => line.includes(kw))
    const isExcluded = excludeKeywords.some(kw => line.includes(kw) && !fundKeywords.some(fkw => line.includes(fkw)))
    
    if (isFundName && !isExcluded && line.length >= 4 && line.length <= 30) {
      // [WHAT] 尝试从当前行或附近行提取金额
      let amount = 0
      
      // 检查当前行是否包含金额
      const amountInLine = line.match(/[\d,]+\.\d{2}/)
      if (amountInLine) {
        amount = parseAmount(amountInLine[0])
      }
      
      // 检查下几行是否有金额
      if (amount === 0) {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLine = lines[j].trim()
          const amountMatch = nextLine.match(/^[¥￥]?\s*([\d,]+\.\d{2})/)
          if (amountMatch) {
            amount = parseAmount(amountMatch[1])
            break
          }
        }
      }
      
      // [WHAT] 清理基金名称
      const cleanedName = cleanFundName(line.replace(/[\d,]+\.\d{2}/, '').trim())
      
      if (cleanedName.length >= 3 && amount >= 10) {
        // [WHAT] 检查是否已添加相同名称
        const exists = holdings.some(h => h.name === cleanedName)
        if (!exists) {
          holdings.push({
            code: '',
            name: cleanedName,
            amount,
            confidence: 0.5,
            needsCodeMatch: true // [WHAT] 标记需要手动匹配代码
          })
        }
      }
    }
  }
  
  return holdings
}

/**
 * 多行组合解析
 * [WHY] 有些截图格式中，基金信息分散在多行
 */
function parseMultiLine(lines: string[]): RecognizedHolding[] {
  const holdings: RecognizedHolding[] = []
  
  // [WHAT] 查找所有基金代码
  const codePattern = /\d{6}/g
  const amountPattern = /[\d,]+\.\d{2}/g
  
  const codes: string[] = []
  const amounts: number[] = []
  
  for (const line of lines) {
    // [WHAT] 提取基金代码
    const codeMatches = line.match(codePattern)
    if (codeMatches) {
      codes.push(...codeMatches.filter(c => isValidFundCode(c)))
    }
    
    // [WHAT] 提取金额（大于100的数字）
    const amountMatches = line.match(amountPattern)
    if (amountMatches) {
      for (const m of amountMatches) {
        const amount = parseAmount(m)
        if (amount >= 100) {
          amounts.push(amount)
        }
      }
    }
  }
  
  // [WHAT] 如果代码和金额数量匹配，尝试配对
  if (codes.length > 0 && codes.length === amounts.length) {
    for (let i = 0; i < codes.length; i++) {
      holdings.push({
        code: codes[i],
        name: '',
        amount: amounts[i],
        confidence: 0.5
      })
    }
  } else if (codes.length > 0) {
    // [WHAT] 只有代码没有金额，也返回（用户可以手动填写金额）
    for (const code of codes) {
      holdings.push({
        code,
        name: '',
        amount: 0,
        confidence: 0.3
      })
    }
  }
  
  return holdings
}

/**
 * 验证基金代码是否合法
 * [WHY] 过滤掉明显不是基金代码的6位数字（如日期、时间等）
 */
function isValidFundCode(code: string): boolean {
  // [EDGE] 排除常见的非基金代码模式
  // 日期格式：202401、202312等
  if (/^20[0-9]{4}$/.test(code)) return false
  // 时间格式：开头为1-2的6位数可能是时间
  if (/^[0-2]\d{5}$/.test(code) && parseInt(code.slice(0, 2)) <= 24) {
    // 进一步检查是否像时间 HHMMSS
    const hh = parseInt(code.slice(0, 2))
    const mm = parseInt(code.slice(2, 4))
    const ss = parseInt(code.slice(4, 6))
    if (hh <= 23 && mm <= 59 && ss <= 59) return false
  }
  return true
}

/**
 * 清理基金名称
 * [WHY] 去除名称中的噪音字符
 */
function cleanFundName(name: string): string {
  return name
    .replace(/持有|金额|收益|份额|净值|估值/g, '')
    .replace(/[¥￥%]/g, '')
    .trim()
}

/**
 * 解析金额字符串
 * [WHY] 处理各种金额格式（带逗号、带货币符号等）
 */
function parseAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/[,¥￥\s]/g, '')
  const amount = parseFloat(cleaned)
  return isNaN(amount) ? 0 : amount
}

/**
 * 从图片识别并解析持仓信息
 * [WHY] 一站式接口，图片 -> 持仓列表
 */
export async function recognizeHoldings(
  imageSource: File | string,
  onProgress?: OcrProgressCallback
): Promise<RecognizedHolding[]> {
  // [WHAT] 第一步：OCR 识别文字
  const text = await recognizeText(imageSource, onProgress)
  
  // [WHAT] 第二步：解析持仓信息
  const holdings = parseHoldingText(text)
  
  return holdings
}
