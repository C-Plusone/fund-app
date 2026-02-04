<script setup lang="ts">
// [WHY] 基金卡片组件，用于展示单只基金的实时估值
// [WHAT] 显示基金名称、代码、估值、涨跌幅，支持价格闪烁效果
// [HOW] 支持点击跳转、左滑删除、长按设置提醒

import type { WatchlistItem } from '@/types/fund'
import { formatNetValue, formatPercent, getChangeStatus } from '@/utils/format'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  fund: WatchlistItem
}>()

const emit = defineEmits<{
  delete: [code: string]
  click: [code: string]
  longpress: []
}>()

// [WHAT] 价格闪烁状态（模仿交易所效果）
const flashClass = ref('')
const prevValue = ref(0)

// [WHAT] 监听价格变化，触发闪烁动画
watch(() => props.fund.estimateValue, (newVal, oldVal) => {
  const newNum = typeof newVal === 'string' ? parseFloat(newVal) : (newVal || 0)
  const oldNum = typeof oldVal === 'string' ? parseFloat(oldVal) : (oldVal || 0)
  
  if (newNum !== oldNum && oldNum !== 0) {
    flashClass.value = newNum > oldNum ? 'flash-up' : 'flash-down'
    setTimeout(() => {
      flashClass.value = ''
    }, 500)
  }
  prevValue.value = oldNum
})

// [WHAT] 根据涨跌状态返回对应的 CSS 类名
const changeClass = computed(() => {
  if (!props.fund.estimateChange) return ''
  return getChangeStatus(props.fund.estimateChange)
})

const displayChange = computed(() => {
  return formatPercent(props.fund.estimateChange || 0)
})

const displayValue = computed(() => {
  return formatNetValue(props.fund.estimateValue || 0)
})

// [WHAT] 长按检测
let pressTimer: ReturnType<typeof setTimeout> | null = null

function onTouchStart() {
  pressTimer = setTimeout(() => {
    emit('longpress')
  }, 500) // 长按500ms触发
}

function onTouchEnd() {
  if (pressTimer) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

function onTouchMove() {
  if (pressTimer) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

// [FIX] #51 格式化更新时间，只显示时:分
function formatTime(time: string | undefined): string {
  if (!time) return ''
  // 格式可能是 "2024-01-01 15:00" 或 "15:00"
  const match = time.match(/(\d{2}:\d{2})/)
  return match ? match[1] : ''
}
</script>

<template>
  <van-swipe-cell>
    <div 
      class="fund-card" 
      :class="{ loading: fund.loading }" 
      @click="emit('click', fund.code)"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
      @touchmove="onTouchMove"
    >
      <!-- [FIX] #51 优化信息显示布局 -->
      <!-- 左侧：基金信息 -->
      <div class="fund-info">
        <div class="fund-name-row">
          <span class="fund-name">{{ fund.name || '加载中...' }}</span>
        </div>
        <div class="fund-meta-row">
          <span class="fund-code">{{ fund.code }}</span>
          <span v-if="fund.estimateTime" class="update-time">{{ formatTime(fund.estimateTime) }}</span>
        </div>
      </div>
      
      <!-- 右侧：估值信息（带闪烁效果） -->
      <div class="fund-value" :class="[changeClass, flashClass]">
        <div class="estimate-value">{{ displayValue }}</div>
        <div class="estimate-change">{{ displayChange }}</div>
      </div>
    </div>
    
    <!-- 滑动删除按钮 -->
    <template #right>
      <van-button 
        square 
        type="danger" 
        text="删除"
        class="delete-btn"
        @click.stop="emit('delete', fund.code)"
      />
    </template>
  </van-swipe-cell>
</template>

<style scoped>
.fund-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.3s;
}

.fund-card.loading {
  opacity: 0.6;
}

/* [FIX] #51 优化信息显示布局 */
.fund-info {
  flex: 1;
  min-width: 0; /* 防止内容溢出 */
}

.fund-name-row {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.fund-name {
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fund-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.update-time {
  font-size: 11px;
  color: var(--text-tertiary, #c8c9cc);
  padding: 1px 4px;
  background: var(--bg-tertiary, #f7f8fa);
  border-radius: 2px;
}

.fund-value {
  text-align: right;
}

.estimate-value {
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 4px;
}

.estimate-change {
  font-size: 14px;
}

/* [WHY] 红涨绿跌配色（使用主题变量） */
.fund-value.up {
  color: var(--color-up);
}

.fund-value.down {
  color: var(--color-down);
}

.fund-value.flat {
  color: var(--text-secondary);
}

/* [WHY] 价格闪烁动画（模仿交易所实时效果） */
.fund-value.flash-up {
  animation: flash-up 0.5s ease;
}

.fund-value.flash-down {
  animation: flash-down 0.5s ease;
}

@keyframes flash-up {
  0% { background: transparent; }
  30% { background: var(--color-up-bg); }
  100% { background: transparent; }
}

@keyframes flash-down {
  0% { background: transparent; }
  30% { background: var(--color-down-bg); }
  100% { background: transparent; }
}

.delete-btn {
  height: 100%;
}
</style>
