<script setup lang="ts">
// [WHY] 行情页 - 展示市场概况、大盘指数、基金排行
// [WHAT] 涨跌分布、场外基金、板块总览、场内ETF

import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { fetchMarketIndicesFast, type MarketIndexSimple } from '@/api/fundFast'
import { 
  fetchMarketOverview, fetchOTCFundRank, fetchSectorFunds, fetchETFRank,
  type MarketOverview, type OTCFundItem, type SectorInfo, type ETFItem 
} from '@/api/tiantianApi'
import { formatPercent, getChangeStatus } from '@/utils/format'
import { showToast } from 'vant'

const router = useRouter()

// ========== 下拉刷新 ==========
const isRefreshing = ref(false)

// ========== 大盘指数 ==========
const indices = ref<MarketIndexSimple[]>([])
const indicesLoading = ref(true)

// ========== 市场概况 ==========
const overview = ref<MarketOverview | null>(null)
const overviewLoading = ref(true)

// ========== 场外基金 ==========
const otcFunds = ref<OTCFundItem[]>([])
const otcLoading = ref(true)

// ========== 板块 ==========
const sectors = ref<SectorInfo[]>([])
const sectorsLoading = ref(true)

// ========== 场内ETF ==========
const etfList = ref<ETFItem[]>([])
const etfLoading = ref(true)

// [WHAT] 计算柱状图最大值（用于比例）
const maxDistCount = computed(() => {
  if (!overview.value) return 1
  return Math.max(...overview.value.distribution.map(d => d.count), 1)
})

// [WHAT] 加载大盘指数
async function loadIndices() {
  indicesLoading.value = true
  try {
    indices.value = await fetchMarketIndicesFast()
  } catch {
    // 静默失败
  } finally {
    indicesLoading.value = false
  }
}

// [WHAT] 加载市场概况
async function loadOverview() {
  overviewLoading.value = true
  try {
    overview.value = await fetchMarketOverview()
  } catch {
    // 静默失败
  } finally {
    overviewLoading.value = false
  }
}

// [WHAT] 加载场外基金
async function loadOTCFunds() {
  otcLoading.value = true
  try {
    otcFunds.value = await fetchOTCFundRank('desc', 10)
  } catch {
    // 静默失败
  } finally {
    otcLoading.value = false
  }
}

// [WHAT] 加载板块
async function loadSectors() {
  sectorsLoading.value = true
  try {
    sectors.value = await fetchSectorFunds()
  } catch {
    // 静默失败
  } finally {
    sectorsLoading.value = false
  }
}

// [WHAT] 加载ETF
async function loadETF() {
  etfLoading.value = true
  try {
    etfList.value = await fetchETFRank(10)
  } catch {
    // 静默失败
  } finally {
    etfLoading.value = false
  }
}

// [WHAT] 刷新所有数据
async function onRefresh() {
  isRefreshing.value = true
  try {
    await Promise.all([
      loadIndices(),
      loadOverview(),
      loadOTCFunds(),
      loadSectors(),
      loadETF()
    ])
    showToast('刷新成功')
  } finally {
    isRefreshing.value = false
  }
}

// [WHAT] 跳转到基金详情
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}

// [WHAT] 获取柱状颜色
function getBarColor(range: string): string {
  if (range.includes('-')) return 'down'
  if (range === '0~1') return 'neutral'
  return 'up'
}

onMounted(() => {
  loadIndices()
  loadOverview()
  loadOTCFunds()
  loadSectors()
  loadETF()
})
</script>

<template>
  <div class="market-page">
    <!-- 顶部导航 -->
    <van-nav-bar title="行情">
      <template #right>
        <van-icon name="replay" size="18" @click="onRefresh" />
      </template>
    </van-nav-bar>

    <van-pull-refresh v-model="isRefreshing" @refresh="onRefresh" class="market-content">
      
      <!-- 基金涨跌分布 -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">基金涨跌分布</span>
          <span class="update-time" v-if="overview">更新: {{ overview.updateTime }}</span>
        </div>
        
        <div class="distribution-chart" v-if="!overviewLoading && overview">
          <!-- 柱状图 -->
          <div class="chart-bars">
            <div 
              v-for="item in overview.distribution" 
              :key="item.range"
              class="bar-item"
            >
              <div class="bar-value">{{ item.count || '' }}</div>
              <div 
                class="bar" 
                :class="getBarColor(item.range)"
                :style="{ height: `${(item.count / maxDistCount) * 100}px` }"
              ></div>
              <div class="bar-label">{{ item.range }}</div>
            </div>
          </div>
          
          <!-- 涨跌统计条 -->
          <div class="updown-bar">
            <div class="down-section">
              <span class="label">下跌</span>
              <span class="count">{{ overview.totalDown }}</span>
            </div>
            <div 
              class="progress-bar"
              :style="{ 
                background: `linear-gradient(to right, var(--color-down) ${overview.totalDown / (overview.totalDown + overview.totalUp) * 100}%, var(--color-up) ${overview.totalDown / (overview.totalDown + overview.totalUp) * 100}%)`
              }"
            ></div>
            <div class="up-section">
              <span class="count">{{ overview.totalUp }}</span>
              <span class="label">上涨</span>
            </div>
          </div>
        </div>
        <van-loading v-else class="loading-box" />
      </div>

      <!-- 大盘指数区域 -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">大盘指数</span>
        </div>
        
        <div class="indices-grid" v-if="!indicesLoading">
          <div 
            v-for="idx in indices" 
            :key="idx.code"
            class="index-card"
            :class="getChangeStatus(idx.changePercent)"
          >
            <div class="index-name">{{ idx.name }}</div>
            <div class="index-current">{{ idx.current.toFixed(2) }}</div>
            <div class="index-change">
              <span>{{ idx.change >= 0 ? '+' : '' }}{{ idx.change.toFixed(2) }}</span>
              <span>{{ formatPercent(idx.changePercent) }}</span>
            </div>
          </div>
        </div>
        <van-loading v-else class="loading-box" />
      </div>

      <!-- 场外基金 -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">场外基金</span>
        </div>
        
        <div class="fund-list" v-if="!otcLoading">
          <div 
            v-for="fund in otcFunds" 
            :key="fund.code"
            class="fund-item"
            @click.stop="goToDetail(fund.code)"
          >
            <div class="fund-info">
              <div class="fund-name">{{ fund.name }}</div>
              <div class="fund-meta">
                <span class="update-tag">{{ fund.updateStatus }}</span>
                <span class="fund-code">{{ fund.code }}</span>
              </div>
            </div>
            <div class="fund-value">{{ fund.netValue.toFixed(4) }}</div>
            <div class="fund-change" :class="getChangeStatus(fund.dayReturn)">
              {{ formatPercent(fund.dayReturn) }}
            </div>
          </div>
        </div>
        <van-loading v-else class="loading-box" />
      </div>

      <!-- 板块总览 -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">板块总览</span>
        </div>
        
        <div class="sector-list" v-if="!sectorsLoading">
          <div 
            v-for="sector in sectors" 
            :key="sector.code || sector.name"
            class="sector-item"
          >
            <div class="sector-info">
              <div class="sector-name">{{ sector.name }}</div>
              <div class="sector-meta" v-if="sector.streak">{{ sector.streak }}</div>
            </div>
            <div class="sector-change" :class="getChangeStatus(sector.dayReturn)">
              {{ formatPercent(sector.dayReturn) }}
            </div>
          </div>
        </div>
        <van-loading v-else class="loading-box" />
      </div>

      <!-- 场内ETF -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">场内ETF</span>
        </div>
        
        <div class="etf-list" v-if="!etfLoading">
          <div 
            v-for="etf in etfList" 
            :key="etf.code"
            class="etf-item"
            @click.stop="goToDetail(etf.code)"
          >
            <div class="etf-info">
              <div class="etf-name">{{ etf.name }}</div>
              <div class="etf-code">{{ etf.code }}</div>
            </div>
            <div class="etf-price">{{ etf.price.toFixed(4) }}</div>
            <div class="etf-change" :class="getChangeStatus(etf.dayReturn)">
              {{ formatPercent(etf.dayReturn) }}
            </div>
          </div>
        </div>
        <van-loading v-else class="loading-box" />
      </div>

      <!-- 底部占位 -->
      <div class="bottom-spacer"></div>

    </van-pull-refresh>
  </div>
</template>

<style scoped>
.market-page {
  min-height: 100vh;
  background: var(--bg-primary);
}

.market-content {
  /* [WHY] 固定高度才能让下拉刷新正常工作 */
  height: calc(100vh - 46px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
}

/* [WHY] 底部占位确保最后一个元素可以滚动到可见区域 */
.bottom-spacer {
  height: calc(70px + env(safe-area-inset-bottom, 0px));
}

.section {
  background: var(--bg-secondary);
  margin-bottom: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.section-header.clickable {
  cursor: pointer;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.update-time {
  font-size: 12px;
  color: var(--text-muted);
}

/* ========== 涨跌分布图 ========== */
.distribution-chart {
  padding: 16px;
}

.chart-bars {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  height: 140px;
  padding: 0 8px;
  margin-bottom: 12px;
}

.bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.bar-value {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  min-height: 16px;
}

.bar {
  width: 24px;
  min-height: 4px;
  border-radius: 2px 2px 0 0;
  transition: height 0.3s;
}

.bar.down { background: var(--color-down); }
.bar.up { background: var(--color-up); }
.bar.neutral { background: var(--text-muted); }

.bar-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 6px;
  white-space: nowrap;
}

.updown-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.down-section, .up-section {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.down-section .label { color: var(--color-down); }
.down-section .count { color: var(--color-down); font-weight: 600; }
.up-section .label { color: var(--color-up); }
.up-section .count { color: var(--color-up); font-weight: 600; }

.progress-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
}

/* ========== 大盘指数 ========== */
.indices-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px;
}

.index-card {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-tertiary);
}

.index-card.up { background: var(--color-up-bg); }
.index-card.down { background: var(--color-down-bg); }

.index-name {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.index-current {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 4px;
}

.index-card.up .index-current { color: var(--color-up); }
.index-card.down .index-current { color: var(--color-down); }

.index-change {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.index-card.up .index-change { color: var(--color-up); }
.index-card.down .index-change { color: var(--color-down); }

/* ========== 场外基金列表 ========== */
.fund-list, .etf-list {
  padding: 0;
}

.fund-item, .etf-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.fund-item:last-child, .etf-item:last-child {
  border-bottom: none;
}

.fund-item:active, .etf-item:active {
  background: var(--bg-tertiary);
}

.fund-info, .etf-info {
  flex: 1;
  min-width: 0;
}

.fund-name, .etf-name {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fund-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.update-tag {
  font-size: 10px;
  padding: 1px 4px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 2px;
}

.fund-code, .etf-code {
  font-size: 12px;
  color: var(--text-muted);
}

.fund-value, .etf-price {
  width: 70px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  text-align: right;
  font-family: -apple-system, 'SF Mono', monospace;
}

.fund-change, .etf-change {
  width: 70px;
  font-size: 15px;
  font-weight: 600;
  text-align: right;
  font-family: -apple-system, 'SF Mono', monospace;
}

.fund-change.up, .etf-change.up { color: var(--color-up); }
.fund-change.down, .etf-change.down { color: var(--color-down); }
.fund-change.flat, .etf-change.flat { color: var(--text-secondary); }

/* ========== 板块列表 ========== */
.sector-list {
  padding: 0;
}

.sector-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}
.sector-item:active {
  background: var(--bg-secondary);
}
.sector-item:last-child {
  border-bottom: none;
}

.sector-info {
  flex: 1;
}

.sector-name {
  font-size: 15px;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.sector-meta {
  font-size: 12px;
  color: var(--color-up);
}

.sector-change {
  font-size: 15px;
  font-weight: 600;
  font-family: -apple-system, 'SF Mono', monospace;
}

.sector-change.up { color: var(--color-up); }
.sector-change.down { color: var(--color-down); }
.sector-change.flat { color: var(--text-secondary); }

/* ========== 通用 ========== */
.loading-box {
  padding: 40px 0;
  text-align: center;
}

/* 移动端适配 */
@media (max-width: 360px) {
  .bar {
    width: 18px;
  }
  
  .bar-label {
    font-size: 9px;
  }
  
  .fund-value, .etf-price {
    width: 60px;
    font-size: 14px;
  }
  
  .fund-change, .etf-change {
    width: 60px;
    font-size: 14px;
  }
}
</style>
