<script setup lang="ts">
// [WHY] 持仓卡片组件，展示单只基金的持仓信息和收益
// [WHAT] 显示持仓份额、成本、市值、盈亏等信息

import type { HoldingWithProfit } from '@/stores/holding'
import { formatMoney, formatPercent, getChangeStatus } from '@/utils/format'
import { computed } from 'vue'

const props = defineProps<{
  holding: HoldingWithProfit
}>()

const emit = defineEmits<{
  edit: [code: string]
  delete: [code: string]
}>()

// [WHAT] 盈亏状态样式
const profitClass = computed(() => {
  if (props.holding.profit === undefined) return ''
  return getChangeStatus(props.holding.profit)
})

// [WHAT] 今日涨跌状态样式
const todayClass = computed(() => {
  if (!props.holding.todayChange) return ''
  return getChangeStatus(props.holding.todayChange)
})

const displayProfit = computed(() => {
  if (props.holding.profit === undefined) return '--'
  const sign = props.holding.profit >= 0 ? '+' : ''
  return `${sign}${formatMoney(props.holding.profit)}`
})

const displayProfitRate = computed(() => {
  if (props.holding.profitRate === undefined) return '--'
  return formatPercent(props.holding.profitRate)
})

const displayMarketValue = computed(() => {
  if (props.holding.marketValue === undefined) return '--'
  return formatMoney(props.holding.marketValue, '¥')
})

const displayCost = computed(() => {
  const cost = props.holding.shares * (props.holding.buyNetValue || 0)
  return formatMoney(cost, '¥')
})

const displayTodayChange = computed(() => {
  return formatPercent(props.holding.todayChange || 0)
})
</script>

<template>
  <van-swipe-cell>
    <div class="holding-card" :class="{ loading: holding.loading }">
      <!-- 顶部：基金信息 + 今日涨跌 -->
      <div class="card-header">
        <div class="fund-info">
          <span class="fund-name">{{ holding.name || '加载中...' }}</span>
          <span class="fund-code">{{ holding.code }}</span>
        </div>
        <div class="today-change" :class="todayClass">
          今日 {{ displayTodayChange }}
        </div>
      </div>
      
      <!-- 中部：盈亏信息 -->
      <div class="profit-section" :class="profitClass">
        <div class="profit-amount">{{ displayProfit }}</div>
        <div class="profit-rate">{{ displayProfitRate }}</div>
      </div>
      
      <!-- 底部：持仓详情 -->
      <div class="detail-section">
        <div class="detail-item">
          <span class="label">持有市值</span>
          <span class="value">{{ displayMarketValue }}</span>
        </div>
        <div class="detail-item">
          <span class="label">持仓成本</span>
          <span class="value">{{ displayCost }}</span>
        </div>
        <div class="detail-item">
          <span class="label">持有份额</span>
          <span class="value">{{ holding.shares.toFixed(2) }}</span>
        </div>
      </div>
    </div>
    
    <!-- 滑动操作按钮 -->
    <template #right>
      <van-button 
        square 
        type="primary" 
        text="编辑"
        class="action-btn"
        @click="emit('edit', holding.code)"
      />
      <van-button 
        square 
        type="danger" 
        text="删除"
        class="action-btn"
        @click="emit('delete', holding.code)"
      />
    </template>
  </van-swipe-cell>
</template>

<style scoped>
.holding-card {
  padding: 16px;
  background: #fff;
  border-bottom: 1px solid #f5f5f5;
}

.holding-card.loading {
  opacity: 0.6;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.fund-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.fund-name {
  font-size: 16px;
  color: #333;
  font-weight: 500;
}

.fund-code {
  font-size: 12px;
  color: #999;
}

.today-change {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f5f5f5;
}

.today-change.up {
  background: #fff0f0;
  color: #e4393c;
}

.today-change.down {
  background: #f0fff0;
  color: #1db82c;
}

.profit-section {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}

.profit-amount {
  font-size: 24px;
  font-weight: 600;
}

.profit-rate {
  font-size: 14px;
}

.profit-section.up {
  color: #e4393c;
}

.profit-section.down {
  color: #1db82c;
}

.profit-section.flat {
  color: #999;
}

.detail-section {
  display: flex;
  justify-content: space-between;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item .label {
  font-size: 12px;
  color: #999;
}

.detail-item .value {
  font-size: 14px;
  color: #333;
}

.action-btn {
  height: 100%;
}
</style>
