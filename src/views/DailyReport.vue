<script setup lang="ts">
// [WHY] AI智能日报页面 - 展示千问AI生成的每日投资分析
// [WHAT] 调用AI生成个性化的市场分析和投资建议

import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useHoldingStore } from '@/stores/holding'
import { showToast } from 'vant'
import { 
  generateDailyReport, getCachedReport, cacheReport, hasGeneratedToday,
  type DailyReport, type HoldingSummaryForAI, type MarketDataForAI
} from '@/api/qwenAI'
import { fetchMarketIndicesFast } from '@/api/fundFast'

const router = useRouter()
const holdingStore = useHoldingStore()

// [WHAT] 状态
const isLoading = ref(false)
const report = ref<DailyReport | null>(null)
const error = ref('')
const alreadyGenerated = ref(false)  // [WHAT] 标记今天是否已生成

// [WHAT] 当前日期
const today = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
})

// [WHAT] 初始化
onMounted(async () => {
  // 先尝试读取缓存
  const cached = getCachedReport()
  if (cached) {
    report.value = cached
    alreadyGenerated.value = true  // [WHAT] 今天已生成过
    return
  }
  
  // 没有缓存则生成新日报
  await generateReport()
})

// [WHAT] 生成日报
async function generateReport() {
  isLoading.value = true
  error.value = ''
  
  try {
    // [WHAT] 准备持仓数据
    await holdingStore.initHoldings()
    await holdingStore.refreshEstimates()
    
    const holdingSummary: HoldingSummaryForAI = {
      totalValue: holdingStore.summary.totalValue,
      totalProfit: holdingStore.summary.totalProfit,
      profitRate: holdingStore.summary.totalProfitRate,
      todayProfit: holdingStore.summary.todayProfit,
      holdings: holdingStore.holdings.map(h => ({
        name: h.name,
        code: h.code,
        marketValue: h.marketValue || h.amount,
        profitRate: h.profitRate || 0,
        todayChange: h.todayChange || '0.00'
      }))
    }
    
    // [WHAT] 获取市场指数
    let marketData: MarketDataForAI = { indices: [] }
    try {
      const indices = await fetchMarketIndicesFast()
      marketData.indices = indices.map(i => ({
        name: i.name,
        value: i.current,
        change: i.changePercent
      }))
    } catch {
      // 使用默认指数
      marketData.indices = [
        { name: '上证指数', value: 3200, change: 0 },
        { name: '深证成指', value: 10500, change: 0 }
      ]
    }
    
    // [WHAT] 调用AI生成日报
    const newReport = await generateDailyReport(holdingSummary, marketData)
    report.value = newReport
    cacheReport(newReport)
    alreadyGenerated.value = true  // [WHAT] 标记今天已生成
    
    showToast('日报生成成功')
    
  } catch (e) {
    error.value = '日报生成失败，请稍后重试'
    console.error('[日报] 生成失败:', e)
  } finally {
    isLoading.value = false
  }
}

// [FIX] #58 右上角刷新逻辑优化
const showRefreshConfirm = ref(false)

// [WHAT] 刷新日报
function refreshReport() {
  if (isLoading.value) return
  
  // 如果今天已生成，弹出确认对话框
  if (alreadyGenerated.value) {
    showRefreshConfirm.value = true
    return
  }
  generateReport()
}

// [FIX] #58 强制刷新
function confirmRefresh() {
  showRefreshConfirm.value = false
  alreadyGenerated.value = false
  generateReport()
}

// [FIX] #58 取消刷新
function cancelRefresh() {
  showRefreshConfirm.value = false
}

// [WHAT] 返回
function goBack() {
  router.back()
}
</script>

<template>
  <div class="report-page">
    <!-- 顶部导航 -->
    <van-nav-bar 
      title="AI智能日报" 
      left-arrow 
      @click-left="goBack"
      :safe-area-inset-top="true"
    >
      <template #right>
        <van-icon 
          name="replay" 
          size="18" 
          @click="refreshReport" 
          :class="{ spinning: isLoading, disabled: alreadyGenerated }"
        />
      </template>
    </van-nav-bar>

    <div class="report-content">
      <!-- 加载状态 -->
      <div v-if="isLoading" class="loading-container">
        <van-loading size="40" vertical>
          <div class="loading-text">AI正在分析市场...</div>
          <div class="loading-subtext">基于您的持仓生成个性化日报</div>
        </van-loading>
      </div>

      <!-- 错误状态 -->
      <van-empty v-else-if="error" :description="error">
        <van-button 
          v-if="!alreadyGenerated"
          type="primary" 
          size="small" 
          @click="generateReport"
        >
          重新生成
        </van-button>
        <div v-else class="limit-tip">今日生成次数已用完</div>
      </van-empty>

      <!-- 日报内容 -->
      <template v-else-if="report">
        <!-- 日期头部 -->
        <div class="report-header">
          <div class="report-date">{{ today }}</div>
          <div class="report-title">投资日报</div>
          <div class="report-ai-tag">
            <van-icon name="bulb-o" />
            <span>AI智能分析</span>
          </div>
        </div>

        <!-- 市场概况 -->
        <div class="report-section">
          <div class="section-header">
            <span class="section-icon">📊</span>
            <span class="section-title">市场概况</span>
          </div>
          <div class="section-content">{{ report.marketSummary }}</div>
        </div>

        <!-- 持仓分析 -->
        <div class="report-section">
          <div class="section-header">
            <span class="section-icon">💼</span>
            <span class="section-title">持仓分析</span>
          </div>
          <div class="section-content">{{ report.holdingAnalysis }}</div>
        </div>

        <!-- 热点追踪 -->
        <div class="report-section">
          <div class="section-header">
            <span class="section-icon">🔥</span>
            <span class="section-title">热点追踪</span>
          </div>
          <div class="section-content">{{ report.hotSectors }}</div>
        </div>

        <!-- 操作建议 -->
        <div class="report-section highlight">
          <div class="section-header">
            <span class="section-icon">💡</span>
            <span class="section-title">操作建议</span>
          </div>
          <div class="section-content">{{ report.suggestion }}</div>
        </div>

        <!-- 风险提示 -->
        <div class="report-section warning">
          <div class="section-header">
            <span class="section-icon">⚠️</span>
            <span class="section-title">风险提示</span>
          </div>
          <div class="section-content">{{ report.riskWarning }}</div>
        </div>

        <!-- 免责声明 -->
        <div class="disclaimer">
          <van-icon name="info-o" />
          <span>以上内容由AI生成，仅供参考，不构成投资建议。投资有风险，入市需谨慎。</span>
        </div>
      </template>
    </div>

    <!-- [FIX] #58 刷新确认对话框 -->
    <van-dialog
      v-model:show="showRefreshConfirm"
      title="重新生成日报"
      show-cancel-button
      confirm-button-text="确认刷新"
      cancel-button-text="取消"
      @confirm="confirmRefresh"
      @cancel="cancelRefresh"
    >
      <div class="refresh-dialog-content">
        <p>今日日报已生成过，确定要重新生成吗？</p>
        <p class="dialog-tip">重新生成将覆盖当前日报内容</p>
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
.report-page {
  height: 100%;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

.report-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.loading-text {
  margin-top: 12px;
  font-size: 16px;
  color: var(--text-primary);
}

.loading-subtext {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.spinning {
  animation: spin 1s linear infinite;
}

.disabled {
  opacity: 0.3;
  pointer-events: none;
}

.limit-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 日报头部 */
.report-header {
  text-align: center;
  padding: 20px 0;
  margin-bottom: 16px;
}

.report-date {
  font-size: 14px;
  color: var(--text-secondary);
}

.report-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--text-primary);
  margin: 8px 0;
}

.report-ai-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 20px;
  font-size: 12px;
}

/* 报告区块 */
.report-section {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.report-section.highlight {
  background: linear-gradient(135deg, rgba(25, 137, 250, 0.1) 0%, rgba(7, 193, 96, 0.1) 100%);
  border: 1px solid rgba(25, 137, 250, 0.2);
}

.report-section.warning {
  background: rgba(255, 151, 106, 0.1);
  border: 1px solid rgba(255, 151, 106, 0.2);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-icon {
  font-size: 18px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-content {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
}

/* 免责声明 */
.disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 16px;
}

.disclaimer .van-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

/* [FIX] #58 刷新确认对话框 */
.refresh-dialog-content {
  padding: 16px;
  text-align: center;
}

.refresh-dialog-content p {
  margin: 0;
  color: var(--text-primary);
}

.refresh-dialog-content .dialog-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
