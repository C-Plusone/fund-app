<script setup lang="ts">
// [WHY] 交易记录页面 - 显示买入/卖出/分红等交易历史
// [WHAT] 按时间倒序显示交易记录，支持筛选和统计

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHoldingStore } from '@/stores/holding'
import { showToast, showConfirmDialog } from 'vant'
import type { TradeType } from '@/types/fund'

const route = useRoute()
const router = useRouter()
const holdingStore = useHoldingStore()

// [WHAT] 从路由获取基金代码（可选）
const fundCode = computed(() => route.params.code as string || '')

// [WHAT] 交易记录数据结构
interface Transaction {
  id: string
  code: string
  name: string
  type: TradeType
  amount: number
  shares: number
  netValue: number
  fee: number
  date: string
  createdAt: number
}

// [WHAT] 本地存储的交易记录
const transactions = ref<Transaction[]>([])

// [WHAT] 筛选条件
const filterType = ref<TradeType | 'all'>('all')

onMounted(() => {
  loadTransactions()
})

// [WHAT] 加载交易记录
function loadTransactions() {
  const stored = localStorage.getItem('fund_transactions')
  if (stored) {
    try {
      transactions.value = JSON.parse(stored)
    } catch {
      transactions.value = []
    }
  }
  
  // [WHAT] 如果没有记录，从持仓生成初始买入记录
  if (transactions.value.length === 0) {
    const holdings = holdingStore.holdings
    holdings.forEach(h => {
      transactions.value.push({
        id: `buy_${h.code}_${h.createdAt}`,
        code: h.code,
        name: h.name,
        type: 'buy',
        amount: h.amount,
        shares: h.shares,
        netValue: h.buyNetValue,
        fee: h.buyFeeAmount || 0,
        date: h.buyDate,
        createdAt: h.createdAt
      })
    })
    saveTransactions()
  }
}

// [WHAT] 保存交易记录
function saveTransactions() {
  localStorage.setItem('fund_transactions', JSON.stringify(transactions.value))
}

// [WHAT] 筛选后的记录
const filteredTransactions = computed(() => {
  let list = transactions.value
  
  // 按基金筛选
  if (fundCode.value) {
    list = list.filter(t => t.code === fundCode.value)
  }
  
  // 按类型筛选
  if (filterType.value !== 'all') {
    list = list.filter(t => t.type === filterType.value)
  }
  
  // 按时间倒序
  return list.sort((a, b) => b.createdAt - a.createdAt)
})

// [WHAT] 统计数据
const statistics = computed(() => {
  const list = fundCode.value 
    ? transactions.value.filter(t => t.code === fundCode.value)
    : transactions.value
    
  const buyTotal = list.filter(t => t.type === 'buy').reduce((sum, t) => sum + t.amount, 0)
  const sellTotal = list.filter(t => t.type === 'sell').reduce((sum, t) => sum + t.amount, 0)
  const dividendTotal = list.filter(t => t.type === 'dividend').reduce((sum, t) => sum + t.amount, 0)
  const feeTotal = list.reduce((sum, t) => sum + t.fee, 0)
  
  return {
    buyTotal,
    sellTotal,
    dividendTotal,
    feeTotal,
    netInvest: buyTotal - sellTotal
  }
})

// [WHAT] 格式化交易类型
function formatType(type: TradeType): string {
  const map: Record<TradeType, string> = {
    buy: '买入',
    sell: '卖出',
    dividend: '分红',
    auto_invest: '定投'
  }
  return map[type] || type
}

// [WHAT] 获取交易类型颜色
function getTypeClass(type: TradeType): string {
  if (type === 'buy' || type === 'auto_invest') return 'buy'
  if (type === 'sell') return 'sell'
  if (type === 'dividend') return 'dividend'
  return ''
}

// [WHAT] 格式化日期
function formatDate(dateStr: string): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// [WHAT] 格式化金额
function formatMoney(num: number): string {
  if (Math.abs(num) >= 10000) {
    return (num / 10000).toFixed(2) + '万'
  }
  return num.toFixed(2)
}

// [WHAT] 删除交易记录
async function deleteTransaction(id: string) {
  try {
    await showConfirmDialog({
      title: '删除记录',
      message: '确定删除这条交易记录？'
    })
    transactions.value = transactions.value.filter(t => t.id !== id)
    saveTransactions()
    showToast('已删除')
  } catch {
    // 取消
  }
}

function goBack() {
  router.back()
}

// [WHAT] 跳转基金详情
function goToDetail(code: string) {
  router.push(`/detail/${code}`)
}
</script>

<template>
  <div class="transactions-page">
    <!-- 顶部导航 -->
    <van-nav-bar 
      title="交易记录" 
      left-arrow 
      @click-left="goBack"
    />
    
    <!-- 统计卡片 -->
    <div class="stats-card">
      <div class="stats-row">
        <div class="stats-item">
          <div class="stats-label">累计买入</div>
          <div class="stats-value buy">¥{{ formatMoney(statistics.buyTotal) }}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">累计卖出</div>
          <div class="stats-value sell">¥{{ formatMoney(statistics.sellTotal) }}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">累计分红</div>
          <div class="stats-value dividend">¥{{ formatMoney(statistics.dividendTotal) }}</div>
        </div>
      </div>
      <div class="stats-summary">
        <span>净投入：¥{{ formatMoney(statistics.netInvest) }}</span>
        <span>手续费：¥{{ formatMoney(statistics.feeTotal) }}</span>
      </div>
    </div>
    
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <div 
        class="filter-item" 
        :class="{ active: filterType === 'all' }"
        @click="filterType = 'all'"
      >
        全部
      </div>
      <div 
        class="filter-item" 
        :class="{ active: filterType === 'buy' }"
        @click="filterType = 'buy'"
      >
        买入
      </div>
      <div 
        class="filter-item" 
        :class="{ active: filterType === 'sell' }"
        @click="filterType = 'sell'"
      >
        卖出
      </div>
      <div 
        class="filter-item" 
        :class="{ active: filterType === 'dividend' }"
        @click="filterType = 'dividend'"
      >
        分红
      </div>
    </div>
    
    <!-- 交易列表 -->
    <div class="transaction-list">
      <van-swipe-cell 
        v-for="item in filteredTransactions" 
        :key="item.id"
      >
        <div class="transaction-item" @click="goToDetail(item.code)">
          <div class="item-left">
            <div class="type-tag" :class="getTypeClass(item.type)">
              {{ formatType(item.type) }}
            </div>
            <div class="item-info">
              <div class="item-name">{{ item.name }}</div>
              <div class="item-meta">{{ item.code }} · {{ formatDate(item.date) }}</div>
            </div>
          </div>
          <div class="item-right">
            <div class="item-amount" :class="getTypeClass(item.type)">
              {{ item.type === 'sell' ? '+' : '-' }}¥{{ formatMoney(item.amount) }}
            </div>
            <div class="item-detail">
              {{ item.shares.toFixed(2) }}份 @ {{ item.netValue.toFixed(4) }}
            </div>
          </div>
        </div>
        
        <template #right>
          <van-button 
            square 
            type="danger" 
            text="删除"
            class="delete-btn"
            @click="deleteTransaction(item.id)"
          />
        </template>
      </van-swipe-cell>
      
      <!-- 空状态 -->
      <van-empty 
        v-if="filteredTransactions.length === 0"
        description="暂无交易记录"
      />
    </div>
  </div>
</template>

<style scoped>
.transactions-page {
  min-height: 100vh;
  background: var(--bg-primary);
}

/* 统计卡片 */
.stats-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  margin: 12px;
  padding: 16px;
  border-radius: 12px;
  color: #fff;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.stats-item {
  text-align: center;
}

.stats-label {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 4px;
}

.stats-value {
  font-size: 16px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.stats-summary {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  opacity: 0.8;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.2);
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  background: var(--bg-secondary);
  margin: 0 12px 12px;
  border-radius: 8px;
  padding: 4px;
}

.filter-item {
  flex: 1;
  text-align: center;
  padding: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
}

.filter-item.active {
  background: var(--color-primary);
  color: #fff;
}

/* 交易列表 */
.transaction-list {
  background: var(--bg-secondary);
  margin: 0 12px;
  border-radius: 12px;
  overflow: hidden;
}

.transaction-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  overflow: hidden;
}

.type-tag {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.type-tag.buy {
  background: rgba(245, 108, 108, 0.1);
  color: #f56c6c;
}

.type-tag.sell {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.type-tag.dividend {
  background: rgba(230, 162, 60, 0.1);
  color: #e6a23c;
}

.item-info {
  overflow: hidden;
}

.item-name {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.item-right {
  text-align: right;
  flex-shrink: 0;
}

.item-amount {
  font-size: 15px;
  font-weight: 600;
  font-family: 'DIN Alternate', -apple-system, monospace;
}

.item-amount.buy { color: #f56c6c; }
.item-amount.sell { color: #67c23a; }
.item-amount.dividend { color: #e6a23c; }

.item-detail {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.delete-btn {
  height: 100%;
}
</style>
