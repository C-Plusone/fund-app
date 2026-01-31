<script setup lang="ts">
// [WHY] 基金对比页面 - 对比多只基金的业绩表现
// [WHAT] 支持选择2-4只基金进行收益率、波动率等指标对比

import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { fetchPeriodReturnExt, type PeriodReturnExt } from '@/api/tiantianApi'
import { fetchFundEstimateFast } from '@/api/fundFast'
import { showToast } from 'vant'
import type { FundEstimate } from '@/types/fund'

const router = useRouter()
const fundStore = useFundStore()

// [WHAT] 选中的基金列表
interface CompareFund {
  code: string
  name: string
  estimate?: FundEstimate
  periodReturns: PeriodReturnExt[]
  loading: boolean
}

const selectedFunds = ref<CompareFund[]>([])
const maxFunds = 4

// [WHAT] 对比维度
const compareDimensions = [
  { key: '1w', label: '近1周' },
  { key: '1m', label: '近1月' },
  { key: '3m', label: '近3月' },
  { key: '6m', label: '近6月' },
  { key: '1y', label: '近1年' },
  { key: '3y', label: '近3年' }
]

// [WHAT] 颜色列表
const colors = ['#2563eb', '#f56c6c', '#67c23a', '#e6a23c']

onMounted(() => {
  // 默认添加自选的前两只基金
  const watchlist = fundStore.watchlist.slice(0, 2)
  watchlist.forEach(fund => {
    addFund(fund.code, fund.name)
  })
})

// [WHAT] 添加基金
async function addFund(code: string, name: string) {
  if (selectedFunds.value.length >= maxFunds) {
    showToast(`最多对比${maxFunds}只基金`)
    return
  }
  
  if (selectedFunds.value.find(f => f.code === code)) {
    showToast('该基金已在对比列表中')
    return
  }
  
  const fund: CompareFund = {
    code,
    name,
    periodReturns: [],
    loading: true
  }
  
  selectedFunds.value.push(fund)
  
  // 加载数据
  try {
    const [estimate, returns] = await Promise.all([
      fetchFundEstimateFast(code).catch(() => null),
      fetchPeriodReturnExt(code).catch(() => [])
    ])
    
    const idx = selectedFunds.value.findIndex(f => f.code === code)
    if (idx !== -1) {
      selectedFunds.value[idx]!.estimate = estimate || undefined
      selectedFunds.value[idx]!.periodReturns = returns
      selectedFunds.value[idx]!.loading = false
    }
  } catch {
    const idx = selectedFunds.value.findIndex(f => f.code === code)
    if (idx !== -1) {
      selectedFunds.value[idx]!.loading = false
    }
  }
}

// [WHAT] 移除基金
function removeFund(code: string) {
  selectedFunds.value = selectedFunds.value.filter(f => f.code !== code)
}

// [WHAT] 刷新所有基金数据（清除缓存后重新加载）
async function refreshAll() {
  // 清除缓存
  const { clearFundCache } = await import('@/api/fundFast')
  selectedFunds.value.forEach(f => {
    clearFundCache(f.code)
    localStorage.removeItem(`fund_period_ext_${f.code}`)
  })
  
  // 重新加载
  const funds = [...selectedFunds.value]
  selectedFunds.value = []
  
  for (const fund of funds) {
    await addFund(fund.code, fund.name)
  }
}

// [WHAT] 获取基金某个周期的收益
function getReturn(fund: CompareFund, period: string): number | null {
  const item = fund.periodReturns.find(p => p.period === period)
  return item?.fundReturn ?? null
}

// [WHAT] 获取最佳/最差标记
function getRankClass(funds: CompareFund[], period: string, code: string): string {
  const returns = funds
    .map(f => ({ code: f.code, value: getReturn(f, period) }))
    .filter(r => r.value !== null) as { code: string, value: number }[]
  
  if (returns.length < 2) return ''
  
  const sorted = [...returns].sort((a, b) => b.value - a.value)
  if (sorted[0]?.code === code) return 'best'
  if (sorted[sorted.length - 1]?.code === code) return 'worst'
  return ''
}

// [WHAT] 格式化收益率
function formatReturn(value: number | null): string {
  if (value === null) return '--'
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
}

// [WHAT] 计算柱状图宽度
function getBarWidth(funds: CompareFund[], period: string, code: string): string {
  const returns = funds
    .map(f => getReturn(f, period))
    .filter(r => r !== null) as number[]
  
  if (returns.length === 0) return '0%'
  
  const maxAbs = Math.max(...returns.map(Math.abs))
  const value = getReturn(funds.find(f => f.code === code)!, period)
  
  if (value === null || maxAbs === 0) return '0%'
  
  return `${Math.abs(value / maxAbs) * 100}%`
}

function goBack() {
  router.back()
}

function goToSearch() {
  router.push('/search')
}

function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}
</script>

<template>
  <div class="compare-page">
    <!-- 顶部导航 -->
    <van-nav-bar 
      title="基金对比" 
      left-arrow 
      @click-left="goBack"
    >
      <template #right>
        <van-icon 
          name="replay" 
          size="20" 
          style="margin-right: 12px"
          @click="refreshAll" 
        />
        <van-icon 
          v-if="selectedFunds.length < maxFunds"
          name="plus" 
          size="20" 
          @click="goToSearch" 
        />
      </template>
    </van-nav-bar>
    
    <!-- 选中的基金卡片 -->
    <div class="selected-funds">
      <div 
        v-for="(fund, index) in selectedFunds" 
        :key="fund.code"
        class="fund-card"
        :style="{ borderLeftColor: colors[index] }"
      >
        <div class="fund-header">
          <div class="fund-info" @click="goToDetail(fund.code)">
            <div class="fund-name">{{ fund.name }}</div>
            <div class="fund-code">{{ fund.code }}</div>
          </div>
          <van-icon name="cross" class="remove-btn" @click="removeFund(fund.code)" />
        </div>
        <div class="fund-change" v-if="fund.estimate">
          <span :class="parseFloat(fund.estimate.gszzl) >= 0 ? 'up' : 'down'">
            {{ parseFloat(fund.estimate.gszzl) >= 0 ? '+' : '' }}{{ fund.estimate.gszzl }}%
          </span>
          <span class="change-label">今日涨幅</span>
        </div>
        <van-loading v-if="fund.loading" size="16" />
      </div>
      
      <!-- 添加按钮 -->
      <div 
        v-if="selectedFunds.length < maxFunds"
        class="add-card"
        @click="goToSearch"
      >
        <van-icon name="plus" size="24" />
        <span>添加基金</span>
      </div>
    </div>
    
    <!-- 对比数据 -->
    <div v-if="selectedFunds.length >= 2" class="compare-section">
      <div class="section-title">收益率对比</div>
      
      <div class="compare-table">
        <div class="table-header">
          <div class="header-cell period">周期</div>
          <div 
            v-for="(fund, index) in selectedFunds" 
            :key="fund.code"
            class="header-cell fund"
            :style="{ color: colors[index] }"
          >
            {{ fund.name.slice(0, 6) }}
          </div>
        </div>
        
        <div 
          v-for="dim in compareDimensions" 
          :key="dim.key"
          class="table-row"
        >
          <div class="row-cell period">{{ dim.label }}</div>
          <div 
            v-for="(fund, index) in selectedFunds" 
            :key="fund.code"
            class="row-cell fund"
          >
            <div class="return-value" :class="[
              (getReturn(fund, dim.key) ?? 0) >= 0 ? 'up' : 'down',
              getRankClass(selectedFunds, dim.key, fund.code)
            ]">
              {{ formatReturn(getReturn(fund, dim.key)) }}
            </div>
            <div 
              class="return-bar"
              :class="(getReturn(fund, dim.key) ?? 0) >= 0 ? 'up' : 'down'"
              :style="{ 
                width: getBarWidth(selectedFunds, dim.key, fund.code),
                backgroundColor: colors[index]
              }"
            />
          </div>
        </div>
      </div>
      
      <!-- 图例说明 -->
      <div class="legend">
        <span class="legend-item best">
          <van-icon name="medal-o" /> 最优
        </span>
        <span class="legend-item worst">
          <van-icon name="warning-o" /> 最差
        </span>
      </div>
    </div>
    
    <!-- 空状态 -->
    <van-empty 
      v-if="selectedFunds.length < 2"
      description="请至少选择2只基金进行对比"
    >
      <van-button round type="primary" size="small" @click="goToSearch">
        去添加
      </van-button>
    </van-empty>
  </div>
</template>

<style scoped>
.compare-page {
  min-height: 100vh;
  background: var(--bg-primary);
}

/* 选中的基金 */
.selected-funds {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px;
}

.fund-card {
  flex: 1;
  min-width: calc(50% - 6px);
  max-width: calc(50% - 6px);
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 12px;
  border-left: 3px solid;
}

.fund-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.fund-info {
  flex: 1;
  overflow: hidden;
  cursor: pointer;
}

.fund-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fund-code {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.remove-btn {
  color: var(--text-secondary);
  padding: 4px;
}

.fund-change {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.fund-change span:first-child {
  font-size: 18px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.fund-change .change-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.up { color: #f56c6c; }
.down { color: #67c23a; }

.add-card {
  flex: 1;
  min-width: calc(50% - 6px);
  max-width: calc(50% - 6px);
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  border: 2px dashed var(--border-color);
}

/* 对比表格 */
.compare-section {
  background: var(--bg-secondary);
  margin: 12px;
  border-radius: 12px;
  padding: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.compare-table {
  overflow-x: auto;
}

.table-header {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.header-cell {
  font-size: 12px;
  font-weight: 500;
}

.header-cell.period {
  width: 60px;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.header-cell.fund {
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-row {
  display: flex;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.table-row:last-child {
  border-bottom: none;
}

.row-cell {
  font-size: 13px;
}

.row-cell.period {
  width: 60px;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.row-cell.fund {
  flex: 1;
  text-align: center;
}

.return-value {
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
  margin-bottom: 4px;
}

.return-value.best {
  background: linear-gradient(90deg, #ffd700, #ff8c00);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.return-value.worst {
  opacity: 0.6;
}

.return-bar {
  height: 4px;
  border-radius: 2px;
  margin: 0 auto;
  max-width: 80%;
  transition: width 0.3s;
}

/* 图例 */
.legend {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.legend-item.best {
  color: #ff8c00;
}

.legend-item.worst {
  opacity: 0.6;
}
</style>
