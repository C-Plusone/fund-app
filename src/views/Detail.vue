<script setup lang="ts">
// [WHY] 基金详情页 - 专业交易所风格
// [WHAT] 深色主题、专业K线图、实时价格面板、成交量柱状图
// [HOW] Canvas绘制专业图表，秒级数据更新

import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { useThemeStore } from '@/stores/theme'
import { fetchStockHoldings, detectShareClass } from '@/api/fund'
import { fetchFundEstimateFast } from '@/api/fundFast'
import { fetchPeriodReturnExt, fetchSimilarFunds, type PeriodReturnExt, type SimilarFund } from '@/api/tiantianApi'
import type { FundEstimate, StockHolding, FundShareClass } from '@/types/fund'
import { showToast } from 'vant'
import ProChart from '@/components/OKXChart.vue'

const route = useRoute()
const router = useRouter()
const fundStore = useFundStore()
const themeStore = useThemeStore()

// [WHAT] 基金代码
const fundCode = computed(() => route.params.code as string)

// 数据状态
const fundInfo = ref<FundEstimate | null>(null)
const stockHoldings = ref<StockHolding[]>([])
const periodReturns = ref<PeriodReturnExt[]>([])
const similarFunds = ref<SimilarFund[]>([])
const isLoading = ref(true)
const shareClass = ref<FundShareClass>('A')

// [WHAT] 实时刷新
let refreshTimer: ReturnType<typeof setInterval> | null = null
const lastUpdateTime = ref('')

// [WHAT] 24小时模拟数据（基金用昨收和估值）
const high24h = ref(0)
const low24h = ref(0)

onMounted(async () => {
  await loadFundData()
  startAutoRefresh()
})

// [WHY] 监听路由参数变化，同一组件内导航时重新加载数据
watch(fundCode, async (newCode, oldCode) => {
  if (newCode && newCode !== oldCode) {
    // [WHAT] 清空旧数据
    fundInfo.value = null
    stockHoldings.value = []
    periodReturns.value = []
    similarFunds.value = []
    isLoading.value = true
    
    // [WHAT] 重新加载数据
    await loadFundData()
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})

// [WHAT] 1秒刷新
function startAutoRefresh() {
  refreshTimer = setInterval(async () => {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const day = now.getDay()
    
    if (day === 0 || day === 6) return
    if (hour < 9 || hour > 15) return
    if (hour === 9 && minute < 30) return
    
    await refreshEstimate()
  }, 1000)
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

async function refreshEstimate() {
  try {
    const estimate = await fetchFundEstimateFast(fundCode.value)
    if (estimate) {
      const gsz = parseFloat(estimate.gsz) || 0
      
      // [WHAT] 更新最高最低
      if (gsz > 0) {
        if (high24h.value === 0 || gsz > high24h.value) high24h.value = gsz
        if (low24h.value === 0 || gsz < low24h.value) low24h.value = gsz
      }
      
      fundInfo.value = estimate
      const now = new Date()
      lastUpdateTime.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    }
  } catch {
    // 静默失败
  }
}

async function loadFundData() {
  isLoading.value = true
  
  try {
    // [WHY] 估值数据优先加载，不等待重仓股（重仓股较慢）
    const estimate = await fetchFundEstimateFast(fundCode.value).catch((err) => {
      console.warn('估值获取失败:', err)
      return null
    })
    
    console.log('估值数据:', estimate)
    fundInfo.value = estimate
    
    if (estimate) {
      shareClass.value = detectShareClass(fundCode.value, estimate.name)
      const gsz = parseFloat(estimate.gsz) || 0
      // [WHY] 今日最高/最低只基于当前估值，不包含昨收
      // [WHY] 如果估值为0（非交易时间），显示昨收作为参考
      if (gsz > 0) {
        high24h.value = gsz
        low24h.value = gsz
      } else {
        // 非交易时间，显示昨收作为参考值
        const dwjz = parseFloat(estimate.dwjz) || 0
        high24h.value = dwjz
        low24h.value = dwjz
      }
    } else {
      shareClass.value = fundCode.value.endsWith('1') || fundCode.value.endsWith('3') ? 'C' : 'A'
      console.warn('未获取到估值数据，可能是非交易时间或网络问题')
    }
    
    const now = new Date()
    lastUpdateTime.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    
    // [WHY] 重仓股后台加载，不阻塞页面显示
    fetchStockHoldings(fundCode.value)
      .then(holdings => {
        console.log('重仓股:', holdings)
        stockHoldings.value = holdings
      })
      .catch(err => {
        console.warn('重仓股获取失败:', err)
      })
    
    // [WHY] 阶段涨幅后台加载
    fetchPeriodReturnExt(fundCode.value)
      .then(returns => {
        periodReturns.value = returns
      })
      .catch(() => {})
    
    // [WHY] 同类基金后台加载
    fetchSimilarFunds(fundCode.value)
      .then(funds => {
        similarFunds.value = funds
      })
      .catch(() => {})
      
  } catch (err) {
    console.error('加载失败:', err)
    showToast('加载失败，请下拉刷新重试')
  } finally {
    isLoading.value = false
  }
}

// [WHAT] 计算涨跌
const priceChange = computed(() => {
  if (!fundInfo.value) return 0
  const gsz = parseFloat(fundInfo.value.gsz) || 0
  const dwjz = parseFloat(fundInfo.value.dwjz) || 0
  return gsz - dwjz
})

const priceChangePercent = computed(() => {
  return parseFloat(fundInfo.value?.gszzl || '0') || 0
})

const isUp = computed(() => priceChangePercent.value >= 0)

function goBack() {
  router.back()
}

// [WHAT] 跳转到同类基金详情
function goToSimilarFund(code: string) {
  if (!code) {
    showToast('基金代码无效')
    return
  }
  // [WHY] 如果点击的是当前基金，提示用户
  if (code === fundCode.value) {
    showToast('已在当前基金')
    return
  }
  router.push(`/detail/${code}`)
}

async function toggleWatchlist() {
  if (!fundInfo.value) return
  if (fundStore.isFundInWatchlist(fundCode.value)) {
    showToast('已在自选中')
  } else {
    await fundStore.addFund(fundCode.value, fundInfo.value.name)
    showToast('添加成功')
  }
}

// [WHAT] 跳转基金经理页
function goToManager() {
  router.push(`/manager/${fundCode.value}`)
}
</script>

<template>
  <div class="pro-detail-page">
    <!-- 顶部导航栏 -->
    <div class="pro-header">
      <div class="header-left" @click="goBack">
        <van-icon name="arrow-left" size="20" />
      </div>
      <div class="header-center">
        <span class="pair-name">{{ fundInfo?.name?.slice(0, 8) || '基金' }}</span>
        <span class="pair-tag">{{ shareClass }}类</span>
      </div>
      <div class="header-right">
        <!-- 主题切换按钮 -->
        <van-icon 
          :name="themeStore.actualTheme === 'dark' ? 'bulb-o' : 'fire-o'" 
          size="20"
          class="theme-toggle"
          @click="themeStore.toggleTheme"
        />
        <!-- 收藏按钮 -->
        <van-icon 
          :name="fundStore.isFundInWatchlist(fundCode) ? 'star' : 'star-o'" 
          size="20"
          :color="fundStore.isFundInWatchlist(fundCode) ? 'var(--color-primary)' : 'var(--text-secondary)'"
          @click="toggleWatchlist"
        />
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="page-loading">
      <van-loading vertical color="#0ecb81">
        加载中...
      </van-loading>
    </div>

    <template v-else>
      <!-- 价格信息面板 -->
      <div class="price-panel">
        <!-- 主价格 -->
        <div class="main-price" :class="isUp ? 'up' : 'down'">
          <span class="price-value">{{ fundInfo?.gsz || '--' }}</span>
          <span class="price-unit">CNY</span>
        </div>
        
        <!-- 涨跌信息 -->
        <div class="price-change" :class="isUp ? 'up' : 'down'">
          <span>{{ isUp ? '+' : '' }}{{ priceChange.toFixed(4) }}</span>
          <span>({{ isUp ? '+' : '' }}{{ priceChangePercent.toFixed(2) }}%)</span>
        </div>

        <!-- 24小时数据栏 -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">昨收净值</span>
            <span class="stat-value">{{ fundInfo?.dwjz || '--' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">今日最高</span>
            <span class="stat-value up">{{ high24h > 0 ? high24h.toFixed(4) : '--' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">今日最低</span>
            <span class="stat-value down">{{ low24h > 0 ? low24h.toFixed(4) : '--' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">更新时间</span>
            <span class="stat-value">{{ lastUpdateTime }}</span>
          </div>
        </div>
      </div>

      <!-- 专业图表 -->
      <ProChart
        :fund-code="fundCode"
        :realtime-value="fundInfo?.gsz ? parseFloat(fundInfo.gsz) : 0"
        :realtime-change="priceChangePercent"
        :last-close="fundInfo?.dwjz ? parseFloat(fundInfo.dwjz) : 0"
      />

      <!-- 重仓股票 -->
      <div class="holdings-section">
        <div class="section-header">
          <span class="section-title">重仓股票</span>
          <span class="section-tip">TOP10</span>
        </div>
        
        <div v-if="stockHoldings.length > 0" class="holdings-list">
          <div class="holdings-table-header">
            <span>股票</span>
            <span>占比</span>
            <span>变动</span>
          </div>
          <div 
            v-for="stock in stockHoldings.slice(0, 10)" 
            :key="stock.stockCode"
            class="holdings-row"
          >
            <div class="stock-cell">
              <span class="stock-name">{{ stock.stockName }}</span>
              <span class="stock-code">{{ stock.stockCode }}</span>
            </div>
            <span class="ratio-cell">{{ stock.holdingRatio.toFixed(2) }}%</span>
            <span class="change-cell" :class="stock.changeFromLast.includes('新增') ? 'new' : ''">
              {{ stock.changeFromLast || '--' }}
            </span>
          </div>
        </div>
        <div v-else class="empty-holdings">
          暂无重仓股数据
        </div>
      </div>

      <!-- 阶段涨幅排名 -->
      <div v-if="periodReturns.length > 0" class="period-section">
        <div class="section-header">
          <span class="section-title">阶段涨幅</span>
          <span class="section-tip">同类排名</span>
        </div>
        <div class="period-grid">
          <div 
            v-for="item in periodReturns.slice(0, 6)" 
            :key="item.period"
            class="period-item"
          >
            <div class="period-label">{{ item.label }}</div>
            <div class="period-return" :class="item.fundReturn >= 0 ? 'up' : 'down'">
              {{ item.fundReturn >= 0 ? '+' : '' }}{{ item.fundReturn.toFixed(2) }}%
            </div>
            <div class="period-rank" v-if="item.rank > 0">
              <span class="rank-num">{{ item.rank }}</span>
              <span class="rank-total">/{{ item.totalCount }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 同类基金对比 -->
      <div v-if="similarFunds.length > 0" class="similar-section">
        <div class="section-header">
          <span class="section-title">同类基金</span>
          <span class="section-tip">年涨幅TOP5</span>
        </div>
        <div class="similar-list">
          <div 
            v-for="fund in similarFunds" 
            :key="fund.code"
            class="similar-item"
            @click="goToSimilarFund(fund.code)"
          >
            <div class="similar-info">
              <div class="similar-name">{{ fund.name }}</div>
              <div class="similar-code">{{ fund.code }}</div>
            </div>
            <div class="similar-return" :class="fund.yearReturn >= 0 ? 'up' : 'down'">
              {{ fund.yearReturn >= 0 ? '+' : '' }}{{ fund.yearReturn.toFixed(2) }}%
            </div>
            <van-icon name="arrow" class="similar-arrow" />
          </div>
        </div>
      </div>

      <!-- 基金信息 -->
      <div class="info-section">
        <div class="section-header">
          <span class="section-title">基金信息</span>
        </div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">基金代码</span>
            <span class="info-value">{{ fundCode }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">基金类型</span>
            <span class="info-value">{{ shareClass }}类份额</span>
          </div>
          <div class="info-item">
            <span class="info-label">估值时间</span>
            <span class="info-value">{{ fundInfo?.gztime || '--' }}</span>
          </div>
        </div>
        
        <!-- 基金经理入口 -->
        <div class="manager-entry" @click="goToManager">
          <div class="entry-left">
            <van-icon name="manager-o" size="20" />
            <span>基金经理</span>
          </div>
          <van-icon name="arrow" size="16" color="var(--text-muted)" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ========== 移动端APP适配 + 主题支持 ========== */
/* [WHY] 使用CSS变量实现黑白主题切换 */

.pro-detail-page {
  min-height: 100vh;
  min-height: -webkit-fill-available;
  background: var(--bg-primary);
  color: var(--text-primary);
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  transition: background-color 0.3s, color 0.3s;
}

/* 顶部导航 */
.pro-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
  transition: background-color 0.3s;
}

.header-left, .header-right {
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
}

.header-left:active, .header-right:active {
  background: var(--bg-hover);
}

.header-center {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: center;
  min-width: 0;
}

.pair-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.pair-tag {
  padding: 3px 8px;
  font-size: 11px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.theme-toggle {
  color: var(--color-primary);
}

.page-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 70px);
  background: var(--bg-primary);
}

/* 价格面板 */
.price-panel {
  padding: 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid #1e2329;
}

.main-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 6px;
}

.price-value {
  /* [WHY] 使用vw实现响应式字体 */
  font-size: clamp(28px, 8vw, 36px);
  font-weight: 700;
  font-family: -apple-system, 'SF Mono', 'Roboto Mono', monospace;
  /* [WHY] 数字等宽对齐 */
  font-variant-numeric: tabular-nums;
}

.price-unit {
  font-size: 14px;
  color: var(--text-secondary);
}

/* [WHY] 红涨绿跌 */
.main-price.up .price-value { color: var(--color-up); }
.main-price.down .price-value { color: var(--color-down); }

.price-change {
  display: flex;
  gap: 12px;
  font-size: 15px;
  font-family: -apple-system, 'SF Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
  margin-bottom: 16px;
}

/* [WHY] 红涨绿跌 */
.price-change.up { color: var(--color-up); }
.price-change.down { color: var(--color-down); }

/* 统计栏 */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 14px;
  font-family: -apple-system, 'SF Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

/* [WHY] 红涨绿跌 */
.stat-value.up { color: var(--color-up); }
.stat-value.down { color: var(--color-down); }

/* 重仓股票区域 */
.holdings-section, .info-section {
  margin: 12px;
  background: var(--bg-secondary);
  border-radius: 12px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-tip {
  font-size: 12px;
  color: var(--text-secondary);
}

.holdings-list {
  padding: 0 16px 16px;
}

.holdings-table-header {
  display: grid;
  grid-template-columns: 1fr minmax(60px, 80px) minmax(60px, 80px);
  padding: 12px 0;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.holdings-row {
  display: grid;
  grid-template-columns: 1fr minmax(60px, 80px) minmax(60px, 80px);
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  align-items: center;
  -webkit-tap-highlight-color: transparent;
}

.holdings-row:last-child {
  border-bottom: none;
}

.holdings-row:active {
  background: var(--bg-hover);
}

.stock-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.stock-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stock-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.ratio-cell {
  font-size: 14px;
  font-family: -apple-system, 'SF Mono', 'Roboto Mono', monospace;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  text-align: right;
}

.change-cell {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: right;
}

.change-cell.new {
  color: var(--color-down);
}

.empty-holdings {
  padding: 48px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

/* 阶段涨幅 */
.period-section {
  background: var(--bg-secondary);
  margin-bottom: 12px;
}

.period-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 12px 16px;
  gap: 12px;
}

.period-item {
  text-align: center;
  padding: 12px 8px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.period-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.period-return {
  font-size: 16px;
  font-weight: 600;
  font-family: -apple-system, 'SF Mono', monospace;
  font-variant-numeric: tabular-nums;
  margin-bottom: 4px;
}

.period-return.up { color: var(--color-up); }
.period-return.down { color: var(--color-down); }

.period-rank {
  font-size: 11px;
  color: var(--text-secondary);
}

.period-rank .rank-num {
  color: var(--color-primary);
  font-weight: 500;
}

/* 同类对比 */
.similar-section {
  background: var(--bg-secondary);
  margin-bottom: 12px;
}

.similar-list {
  padding: 8px 16px;
}

.similar-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 8px;
  margin: 0 -8px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.similar-item:active {
  background: var(--bg-card-hover);
}

.similar-item:last-child {
  border-bottom: none;
}

.similar-info {
  flex: 1;
  overflow: hidden;
  margin-right: 12px;
}

.similar-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.similar-code {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.similar-return {
  font-size: 14px;
  font-weight: 600;
  font-family: -apple-system, 'SF Mono', monospace;
  font-variant-numeric: tabular-nums;
}

.similar-return.up { color: var(--color-up); }
.similar-return.down { color: var(--color-down); }

.similar-arrow {
  color: var(--text-muted);
  margin-left: 8px;
  font-size: 14px;
}

/* 基金信息 */
.info-grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.info-value {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 基金经理入口 */
.manager-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-top: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.manager-entry:active {
  background: var(--bg-tertiary);
}

.entry-left {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  font-size: 15px;
}

/* ========== 响应式适配 ========== */
@media screen and (max-width: 375px) {
  /* 小屏手机 */
  .price-value {
    font-size: 26px;
  }
  
  .stats-bar {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .holdings-table-header,
  .holdings-row {
    grid-template-columns: 1fr 60px 60px;
  }
}

/* [WHY] 底部安全区域（iPhone底部横条） */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .info-section:last-child {
    margin-bottom: calc(12px + env(safe-area-inset-bottom));
  }
}
</style>
