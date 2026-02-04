<script setup lang="ts">
// [WHY] 行情页 - 展示市场概况、大盘指数、基金排行
// [WHAT] 涨跌分布、场外基金、板块总览、场内ETF

import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { fetchMarketIndicesFast, fetchGlobalIndices, type MarketIndexSimple, type GlobalIndex } from '@/api/fundFast'
import { 
  fetchMarketOverview, fetchOTCFundRank, fetchSectorFunds, fetchETFRank,
  type MarketOverview, type OTCFundItem, type SectorInfo, type ETFItem, type FundDistribution
} from '@/api/tiantianApi'
import { formatPercent, getChangeStatus } from '@/utils/format'
import { showToast } from 'vant'

const router = useRouter()

// ========== 下拉刷新 ==========
const isRefreshing = ref(false)

// ========== 大盘指数 ==========
const indices = ref<MarketIndexSimple[]>([])
const indicesLoading = ref(true)

// [FIX] #34 全球指数
const globalIndices = ref<GlobalIndex[]>([])
const globalLoading = ref(true)
const showGlobalSection = ref(true)

// ========== 市场概况 ==========
const overview = ref<MarketOverview | null>(null)
const overviewLoading = ref(true)

// [WHY] 缓存上次成功获取的数据，避免每次加载都显示空白
const cachedOverview = ref<MarketOverview | null>(null)

// ========== 场外基金 ==========
const otcFunds = ref<OTCFundItem[]>([])
const otcLoading = ref(true)

// ========== 板块 ==========
const sectors = ref<SectorInfo[]>([])
const sectorsLoading = ref(true)

// ========== 场内ETF ==========
const etfList = ref<ETFItem[]>([])
const etfLoading = ref(true)

// ========== 板块详情弹窗 ==========
const showSectorPopup = ref(false)
const selectedSector = ref<SectorInfo | null>(null)

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

// [FIX] #34 加载全球指数
async function loadGlobalIndices() {
  globalLoading.value = true
  try {
    globalIndices.value = await fetchGlobalIndices()
  } catch {
    // 静默失败
  } finally {
    globalLoading.value = false
  }
}

// [WHAT] 加载市场概况
async function loadOverview() {
  // [WHY] 如果有缓存，先显示缓存数据，不显示 loading
  if (cachedOverview.value) {
    overview.value = cachedOverview.value
    overviewLoading.value = false
  } else {
    overviewLoading.value = true
  }
  
  try {
    const data = await fetchMarketOverview()
    if (data) {
      overview.value = data
      cachedOverview.value = data // 更新缓存
    }
  } catch {
    // [EDGE] 失败时使用默认数据
    if (!overview.value) {
      overview.value = {
        updateTime: '--',
        totalUp: 0,
        totalDown: 0,
        distribution: [
          { range: '≤-5', count: 0, min: -Infinity, max: -5 },
          { range: '-5~-3', count: 0, min: -5, max: -3 },
          { range: '-3~-1', count: 0, min: -3, max: -1 },
          { range: '-1~0', count: 0, min: -1, max: 0 },
          { range: '0~1', count: 0, min: 0, max: 1 },
          { range: '1~3', count: 0, min: 1, max: 3 },
          { range: '3~5', count: 0, min: 3, max: 5 },
          { range: '≥5', count: 0, min: 5, max: Infinity }
        ]
      }
    }
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
      loadGlobalIndices(),  // [FIX] #34
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

// [WHAT] 显示板块详情弹窗
function goToSector(sector: SectorInfo) {
  selectedSector.value = sector
  showSectorPopup.value = true
}

// [WHAT] 搜索板块相关基金
function searchSectorFunds() {
  if (!selectedSector.value) return
  // [WHY] 跳转到搜索页并传入板块名称
  showSectorPopup.value = false
  router.push({ path: '/search', query: { q: selectedSector.value.name } })
}

// [WHAT] 点击涨跌分布柱子
function onDistributionClick(item: FundDistribution) {
  // [WHY] 显示该涨跌区间的基金数量
  if (item.count > 0) {
    showToast(`${item.range}: ${item.count} 只基金`)
  }
}

// [WHAT] 获取柱状颜色
function getBarColor(range: string): string {
  if (range.includes('-')) return 'down'
  if (range === '0~1') return 'neutral'
  return 'up'
}

onMounted(() => {
  loadIndices()
  loadGlobalIndices()  // [FIX] #34
  loadOverview()
  loadOTCFunds()
  loadSectors()
  loadETF()
})
</script>

<template>
  <div class="market-page">
    <!-- 顶部导航 -->
    <van-nav-bar title="行情" :safe-area-inset-top="true">
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
              @click="onDistributionClick(item)"
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
      
      <!-- [FIX] #34 全球指数 -->
      <div class="section" v-if="globalIndices.length > 0 || globalLoading">
        <div class="section-header" @click="showGlobalSection = !showGlobalSection">
          <span class="section-title">全球指数</span>
          <van-icon :name="showGlobalSection ? 'arrow-up' : 'arrow-down'" />
        </div>
        
        <div class="global-indices-grid" v-if="!globalLoading && showGlobalSection">
          <div 
            v-for="idx in globalIndices" 
            :key="idx.code"
            class="global-index-card"
            :class="idx.price > 0 ? (idx.changePercent >= 0 ? 'up' : 'down') : 'no-data'"
          >
            <div class="global-index-header">
              <span class="region-tag" :class="idx.region">{{ 
                idx.region === 'cn' ? '中' : 
                idx.region === 'hk' ? '港' : 
                idx.region === 'us' ? '美' : 
                idx.region === 'eu' ? '欧' : '亚' 
              }}</span>
              <span class="global-index-name">{{ idx.name }}</span>
            </div>
            <div class="global-index-values" v-if="idx.price > 0">
              <span class="global-index-price">{{ idx.price > 1000 ? idx.price.toFixed(0) : idx.price.toFixed(2) }}</span>
              <span class="global-index-change">{{ idx.changePercent >= 0 ? '+' : '' }}{{ idx.changePercent.toFixed(2) }}%</span>
            </div>
            <div class="global-index-values no-data-text" v-else>
              <span>暂无数据</span>
            </div>
          </div>
        </div>
        <van-loading v-if="globalLoading" class="loading-box" />
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
            @click="goToSector(sector)"
          >
            <div class="sector-info">
              <div class="sector-name">{{ sector.name }}</div>
              <div class="sector-meta" v-if="sector.streak">{{ sector.streak }}</div>
            </div>
            <div class="sector-change" :class="getChangeStatus(sector.dayReturn)">
              {{ formatPercent(sector.dayReturn) }}
            </div>
            <van-icon name="arrow" class="sector-arrow" />
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
    
    <!-- 板块详情弹窗 -->
    <van-popup 
      v-model:show="showSectorPopup" 
      position="bottom" 
      round
      :style="{ maxHeight: '60%' }"
    >
      <div class="sector-popup" v-if="selectedSector">
        <div class="sector-popup-header">
          <div class="sector-popup-title">{{ selectedSector.name }}</div>
          <van-icon name="cross" @click="showSectorPopup = false" />
        </div>
        
        <div class="sector-popup-content">
          <div class="sector-popup-info">
            <div class="info-row">
              <span class="label">今日涨幅</span>
              <span class="value" :class="getChangeStatus(selectedSector.dayReturn)">
                {{ formatPercent(selectedSector.dayReturn) }}
              </span>
            </div>
            <div class="info-row" v-if="selectedSector.streak">
              <span class="label">连续表现</span>
              <span class="value streak">{{ selectedSector.streak }}</span>
            </div>
            <div class="info-row" v-if="selectedSector.funds && selectedSector.funds.length > 0">
              <span class="label">领涨基金</span>
              <span class="value">{{ selectedSector.funds[0].name }}</span>
            </div>
          </div>
          
          <div class="sector-popup-actions">
            <van-button type="primary" block round @click="searchSectorFunds">
              搜索相关基金
            </van-button>
          </div>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.market-page {
  /* [WHY] 使用 100% 高度适配 flex 布局 */
  height: 100%;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.market-content {
  /* [WHY] 使用 flex: 1 自动撑满剩余空间 */
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  /* [WHY] Android WebView 需要明确的触摸行为 */
  touch-action: pan-y;
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
  cursor: pointer;
  padding: 4px 2px;
  border-radius: 4px;
  transition: background 0.2s;
}

.bar-item:active {
  background: var(--bg-card-hover);
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

.sector-arrow {
  color: var(--text-secondary);
  margin-left: 8px;
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

/* ========== 板块详情弹窗 ========== */
.sector-popup {
  padding: 16px;
  background: var(--bg-secondary);
}

.sector-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.sector-popup-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.sector-popup-content {
  padding-top: 16px;
}

.sector-popup-info {
  margin-bottom: 24px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  color: var(--text-secondary);
  font-size: 14px;
}

.info-row .value {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.info-row .value.up { color: var(--color-up); }
.info-row .value.down { color: var(--color-down); }
.info-row .value.streak { color: var(--color-up); }

.sector-popup-actions {
  padding-top: 8px;
}

/* [FIX] #34 全球指数样式 */
.global-indices-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding: 0 12px;
}

.global-index-card {
  background: var(--bg-secondary);
  border-radius: 10px;
  padding: 12px;
}

.global-index-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.region-tag {
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 600;
}

.region-tag.cn { background: #fee2e2; color: #dc2626; }
.region-tag.hk { background: #fef3c7; color: #d97706; }
.region-tag.us { background: #dbeafe; color: #2563eb; }
.region-tag.eu { background: #e0e7ff; color: #4f46e5; }
.region-tag.asia { background: #d1fae5; color: #059669; }

.global-index-name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.global-index-values {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.global-index-price {
  font-size: 15px;
  font-weight: 600;
  font-family: -apple-system, 'SF Mono', monospace;
}

.global-index-change {
  font-size: 13px;
  font-weight: 600;
  font-family: -apple-system, 'SF Mono', monospace;
}

.global-index-card.up .global-index-price,
.global-index-card.up .global-index-change {
  color: var(--color-up);
}

.global-index-card.down .global-index-price,
.global-index-card.down .global-index-change {
  color: var(--color-down);
}

.global-index-card.no-data {
  opacity: 0.6;
}

.global-index-values.no-data-text {
  justify-content: center;
}

.global-index-values.no-data-text span {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
