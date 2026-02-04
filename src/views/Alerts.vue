<script setup lang="ts">
// [WHY] 智能提醒页面 - 设置涨跌幅提醒、定时提醒
// [WHAT] 管理基金提醒规则，支持多种提醒类型
// [FIX] #65-69 修复提醒相关的多个问题

import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useFundStore } from '@/stores/fund'
import { showToast, showConfirmDialog } from 'vant'
import { scheduleNotification, checkNotificationPermission } from '@/utils/native'

const router = useRouter()
const route = useRoute()
const fundStore = useFundStore()

// [WHAT] 提醒规则类型
interface AlertRule {
  id: string
  code: string
  name: string
  type: 'up' | 'down' | 'time' | 'value'
  threshold: number
  timeHour?: number    // [FIX] #65 定时提醒的小时
  timeMinute?: number  // [FIX] #65 定时提醒的分钟
  enabled: boolean
  lastTriggered?: number
  createdAt: number
}

// [FIX] #67 输入范围配置
const THRESHOLD_LIMITS = {
  up: { min: 0.1, max: 100, step: 0.1, unit: '%', placeholder: '如：3 表示涨幅超过3%' },
  down: { min: 0.1, max: 100, step: 0.1, unit: '%', placeholder: '如：3 表示跌幅超过3%' },
  time: { min: 0, max: 23, step: 1, unit: '点', placeholder: '请使用下方时间选择器' },
  value: { min: 0.001, max: 1000, step: 0.001, unit: '元', placeholder: '如：1.5 表示净值达到1.5' }
}

const alerts = ref<AlertRule[]>([])
const showAddSheet = ref(false)
const editingAlertId = ref<string | null>(null)  // [FIX] #66 编辑模式标记
const isLoading = ref(false)  // [FIX] #68 加载状态

// [WHAT] 新增/编辑提醒表单
const newAlert = ref({
  code: '',
  name: '',
  type: 'up' as 'up' | 'down' | 'time' | 'value',
  threshold: 3,
  timeHour: 9,    // [FIX] #65 默认9点
  timeMinute: 0
})

// [FIX] #65 时间选择器
const showTimePicker = ref(false)
const timePickerValue = ref(['09', '00'])

// [WHAT] 基金搜索相关
const searchKeyword = ref('')
const searchResults = ref<{ code: string, name: string }[]>([])
const isSearching = ref(false)

// [FIX] #68 通知权限状态
const notificationPermission = ref<'granted' | 'denied' | 'prompt'>('prompt')

onMounted(async () => {
  loadAlerts()
  // [FIX] #69 检查通知权限
  notificationPermission.value = await checkNotificationPermission()
  
  // [FIX] #39 从路由参数自动填充基金信息并打开添加面板
  if (route.query.code) {
    newAlert.value.code = route.query.code as string
    newAlert.value.name = (route.query.name as string) || ''
    showAddSheet.value = true
  }
})

function loadAlerts() {
  const stored = localStorage.getItem('fund_alerts')
  if (stored) {
    try {
      alerts.value = JSON.parse(stored)
    } catch {
      alerts.value = []
    }
  }
}

function saveAlerts() {
  localStorage.setItem('fund_alerts', JSON.stringify(alerts.value))
}

// [FIX] #67 验证输入范围
function validateThreshold(): boolean {
  const type = newAlert.value.type
  const limits = THRESHOLD_LIMITS[type]
  
  // [FIX] #65 定时提醒使用时间选择器，不需要验证 threshold
  if (type === 'time') {
    if (newAlert.value.timeHour < 0 || newAlert.value.timeHour > 23) {
      showToast('小时必须在 0-23 之间')
      return false
    }
    if (newAlert.value.timeMinute < 0 || newAlert.value.timeMinute > 59) {
      showToast('分钟必须在 0-59 之间')
      return false
    }
    return true
  }
  
  const value = newAlert.value.threshold
  if (isNaN(value) || value < limits.min || value > limits.max) {
    showToast(`请输入 ${limits.min} - ${limits.max} 之间的数值`)
    return false
  }
  return true
}

// [WHAT] 添加/编辑提醒
// [FIX] #66 支持编辑模式
async function submitAlert() {
  if (!newAlert.value.code) {
    showToast('请选择基金')
    return
  }
  
  // [FIX] #67 验证输入范围
  if (!validateThreshold()) {
    return
  }
  
  isLoading.value = true
  
  try {
    if (editingAlertId.value) {
      // 编辑模式
      const index = alerts.value.findIndex(a => a.id === editingAlertId.value)
      if (index !== -1) {
        alerts.value[index] = {
          ...alerts.value[index],
          code: newAlert.value.code,
          name: newAlert.value.name,
          type: newAlert.value.type,
          threshold: newAlert.value.type === 'time' 
            ? newAlert.value.timeHour  // 保存小时作为 threshold 以兼容旧数据
            : newAlert.value.threshold,
          timeHour: newAlert.value.timeHour,
          timeMinute: newAlert.value.timeMinute
        }
        saveAlerts()
        showToast('修改成功')
        
        // [FIX] #69 如果是定时提醒且已启用，重新调度通知
        if (alerts.value[index]!.type === 'time' && alerts.value[index]!.enabled) {
          await scheduleTimeAlert(alerts.value[index]!)
        }
      }
    } else {
      // 添加模式
      const rule: AlertRule = {
        id: `alert_${Date.now()}`,
        code: newAlert.value.code,
        name: newAlert.value.name,
        type: newAlert.value.type,
        threshold: newAlert.value.type === 'time' 
          ? newAlert.value.timeHour
          : newAlert.value.threshold,
        timeHour: newAlert.value.timeHour,
        timeMinute: newAlert.value.timeMinute,
        enabled: true,
        createdAt: Date.now()
      }
      
      alerts.value.push(rule)
      saveAlerts()
      showToast('添加成功')
      
      // [FIX] #69 如果是定时提醒，立即调度通知
      if (rule.type === 'time') {
        await scheduleTimeAlert(rule)
      }
    }
    
    showAddSheet.value = false
    editingAlertId.value = null
    resetForm()
  } finally {
    isLoading.value = false
  }
}

// [FIX] #69 调度定时提醒通知
async function scheduleTimeAlert(rule: AlertRule) {
  if (notificationPermission.value !== 'granted') {
    const newPerm = await checkNotificationPermission()
    notificationPermission.value = newPerm
    if (newPerm !== 'granted') {
      showToast('请授予通知权限以接收提醒')
      return
    }
  }
  
  const hour = rule.timeHour ?? rule.threshold
  const minute = rule.timeMinute ?? 0
  
  // 计算下一次触发时间
  const now = new Date()
  const scheduleTime = new Date()
  scheduleTime.setHours(hour, minute, 0, 0)
  
  // 如果今天的时间已过，设置为明天
  if (scheduleTime <= now) {
    scheduleTime.setDate(scheduleTime.getDate() + 1)
  }
  
  const success = await scheduleNotification({
    id: parseInt(rule.id.replace('alert_', '')),
    title: '基金提醒',
    body: `${rule.name} 的定时提醒`,
    schedule: {
      at: scheduleTime,
      repeats: true
    }
  })
  
  if (success) {
    console.log(`[Alert] 已调度通知：${rule.name} 每天 ${hour}:${minute.toString().padStart(2, '0')}`)
  }
}

function resetForm() {
  newAlert.value = { code: '', name: '', type: 'up', threshold: 3, timeHour: 9, timeMinute: 0 }
}

// [WHAT] 切换提醒状态
async function toggleAlert(id: string) {
  const alert = alerts.value.find(a => a.id === id)
  if (alert) {
    alert.enabled = !alert.enabled
    saveAlerts()
    
    // [FIX] #69 启用/禁用定时提醒
    if (alert.type === 'time') {
      if (alert.enabled) {
        await scheduleTimeAlert(alert)
        showToast('提醒已启用')
      } else {
        showToast('提醒已禁用')
      }
    }
  }
}

// [WHAT] 删除提醒
async function deleteAlert(id: string) {
  try {
    await showConfirmDialog({
      title: '删除提醒',
      message: '确定删除这条提醒规则？'
    })
    alerts.value = alerts.value.filter(a => a.id !== id)
    saveAlerts()
    showToast('已删除')
  } catch {
    // 取消
  }
}

// [FIX] #66 编辑提醒
function editAlert(rule: AlertRule) {
  editingAlertId.value = rule.id
  newAlert.value = {
    code: rule.code,
    name: rule.name,
    type: rule.type,
    threshold: rule.threshold,
    timeHour: rule.timeHour ?? rule.threshold,
    timeMinute: rule.timeMinute ?? 0
  }
  
  // [FIX] #65 同步时间选择器
  if (rule.type === 'time') {
    const hour = rule.timeHour ?? rule.threshold
    const minute = rule.timeMinute ?? 0
    timePickerValue.value = [
      hour.toString().padStart(2, '0'),
      minute.toString().padStart(2, '0')
    ]
  }
  
  showAddSheet.value = true
}

// [WHAT] 打开添加弹窗
function openAddSheet() {
  editingAlertId.value = null
  resetForm()
  showAddSheet.value = true
}

// [WHAT] 选择基金
function selectFund(fund: { code: string, name: string }) {
  newAlert.value.code = fund.code
  newAlert.value.name = fund.name
}

// [WHAT] 获取提醒类型描述
// [FIX] #65 支持显示完整时间
function getTypeDesc(rule: AlertRule): string {
  const { type, threshold, timeHour, timeMinute } = rule
  switch (type) {
    case 'up': return `涨幅超过 ${threshold}%`
    case 'down': return `跌幅超过 ${threshold}%`
    case 'time': {
      const hour = timeHour ?? threshold
      const minute = timeMinute ?? 0
      return `每日 ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} 提醒`
    }
    case 'value': return `净值达到 ${threshold}`
    default: return ''
  }
}

// [WHAT] 获取类型图标
function getTypeIcon(type: string): string {
  switch (type) {
    case 'up': return 'arrow-up'
    case 'down': return 'arrow-down'
    case 'time': return 'clock-o'
    case 'value': return 'chart-trending-o'
    default: return 'bell'
  }
}

function goBack() {
  router.back()
}

// [WHAT] 搜索基金
async function searchFunds() {
  if (!searchKeyword.value.trim()) {
    searchResults.value = []
    return
  }
  
  isSearching.value = true
  try {
    const { searchFund } = await import('@/api/fund')
    const results = await searchFund(searchKeyword.value)
    searchResults.value = results.slice(0, 10).map(f => ({
      code: f.code,
      name: f.name
    }))
  } catch {
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

// [WHAT] 选择搜索结果中的基金
function selectSearchResult(fund: { code: string, name: string }) {
  newAlert.value.code = fund.code
  newAlert.value.name = fund.name
  searchKeyword.value = ''
  searchResults.value = []
}

// [FIX] #65 确认时间选择
function confirmTimePicker(val: { selectedValues: string[] }) {
  const [hour, minute] = val.selectedValues
  newAlert.value.timeHour = parseInt(hour || '9')
  newAlert.value.timeMinute = parseInt(minute || '0')
  showTimePicker.value = false
}

// [FIX] #65 生成时间选择器列数据
const timePickerColumns = computed(() => {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    text: `${i.toString().padStart(2, '0')}时`,
    value: i.toString().padStart(2, '0')
  }))
  const minutes = Array.from({ length: 60 }, (_, i) => ({
    text: `${i.toString().padStart(2, '0')}分`,
    value: i.toString().padStart(2, '0')
  }))
  return [hours, minutes]
})

// [FIX] #67 获取当前类型的输入限制
const currentLimits = computed(() => THRESHOLD_LIMITS[newAlert.value.type])
</script>

<template>
  <div class="alerts-page">
    <!-- 顶部导航 -->
    <van-nav-bar 
      title="智能提醒" 
      left-arrow 
      @click-left="goBack"
    >
      <template #right>
        <van-icon name="plus" size="20" @click="openAddSheet" />
      </template>
    </van-nav-bar>
    
    <!-- [FIX] #68 通知权限提示 -->
    <div v-if="notificationPermission !== 'granted'" class="permission-tip">
      <van-icon name="info-o" />
      <span>请授予通知权限以接收提醒</span>
    </div>
    
    <!-- 提醒列表 -->
    <div class="alert-list">
      <van-swipe-cell 
        v-for="alert in alerts" 
        :key="alert.id"
      >
        <div class="alert-item" @click="editAlert(alert)">
          <div class="alert-left">
            <van-icon :name="getTypeIcon(alert.type)" size="24" class="type-icon" />
            <div class="alert-info">
              <div class="alert-name">{{ alert.name }}</div>
              <div class="alert-desc">{{ getTypeDesc(alert) }}</div>
            </div>
          </div>
          <van-switch 
            :model-value="alert.enabled" 
            size="20"
            @click.stop
            @update:model-value="toggleAlert(alert.id)"
          />
        </div>
        
        <template #right>
          <!-- [FIX] #66 编辑按钮 -->
          <van-button 
            square 
            type="primary" 
            text="编辑"
            @click="editAlert(alert)"
          />
          <van-button 
            square 
            type="danger" 
            text="删除"
            @click="deleteAlert(alert.id)"
          />
        </template>
      </van-swipe-cell>
      
      <!-- 空状态 -->
      <van-empty 
        v-if="alerts.length === 0"
        image="search"
        description="暂无提醒规则"
      >
        <van-button round type="primary" size="small" @click="openAddSheet">
          添加提醒
        </van-button>
      </van-empty>
    </div>
    
    <!-- 添加/编辑提醒弹窗 -->
    <!-- [FIX] #66 支持编辑模式 -->
    <van-action-sheet 
      v-model:show="showAddSheet" 
      :title="editingAlertId ? '编辑提醒' : '添加提醒'"
    >
      <div class="add-form">
        <!-- 搜索选择基金 -->
        <div class="fund-select">
          <van-field
            v-model="searchKeyword"
            placeholder="搜索基金代码或名称"
            clearable
            @update:model-value="searchFunds"
          >
            <template #left-icon>
              <van-icon name="search" />
            </template>
          </van-field>
          
          <!-- 已选基金 -->
          <div v-if="newAlert.code" class="selected-fund">
            <span class="fund-name">{{ newAlert.name }}</span>
            <span class="fund-code">{{ newAlert.code }}</span>
            <van-icon name="cross" @click="newAlert.code = ''; newAlert.name = ''" />
          </div>
          
          <!-- 搜索结果 -->
          <div v-if="searchResults.length > 0" class="search-results">
            <div 
              v-for="fund in searchResults" 
              :key="fund.code"
              class="result-item"
              @click="selectSearchResult(fund)"
            >
              <span class="fund-name">{{ fund.name }}</span>
              <span class="fund-code">{{ fund.code }}</span>
            </div>
          </div>
        </div>
        
        <!-- 提醒类型 -->
        <div class="type-selector">
          <div class="type-label">提醒类型</div>
          <div class="type-options">
            <div 
              class="type-option" 
              :class="{ active: newAlert.type === 'up' }"
              @click="newAlert.type = 'up'"
            >
              <van-icon name="arrow-up" />
              <span>涨幅提醒</span>
            </div>
            <div 
              class="type-option" 
              :class="{ active: newAlert.type === 'down' }"
              @click="newAlert.type = 'down'"
            >
              <van-icon name="arrow-down" />
              <span>跌幅提醒</span>
            </div>
            <div 
              class="type-option" 
              :class="{ active: newAlert.type === 'time' }"
              @click="newAlert.type = 'time'"
            >
              <van-icon name="clock-o" />
              <span>定时提醒</span>
            </div>
            <div 
              class="type-option" 
              :class="{ active: newAlert.type === 'value' }"
              @click="newAlert.type = 'value'"
            >
              <van-icon name="chart-trending-o" />
              <span>净值提醒</span>
            </div>
          </div>
        </div>
        
        <!-- [FIX] #65 定时提醒使用时间选择器 -->
        <template v-if="newAlert.type === 'time'">
          <van-field
            :model-value="`${newAlert.timeHour.toString().padStart(2, '0')}:${newAlert.timeMinute.toString().padStart(2, '0')}`"
            label="提醒时间"
            placeholder="选择时间"
            readonly
            is-link
            @click="showTimePicker = true"
          />
        </template>
        
        <!-- [FIX] #67 阈值设置（带范围验证） -->
        <template v-else>
          <van-field
            v-model.number="newAlert.threshold"
            :label="newAlert.type === 'value' ? '目标净值' : '涨跌幅(%)'"
            type="number"
            :placeholder="currentLimits.placeholder"
          >
            <template #extra>
              <span class="field-hint">
                范围: {{ currentLimits.min }} - {{ currentLimits.max }} {{ currentLimits.unit }}
              </span>
            </template>
          </van-field>
        </template>
        
        <div class="form-actions">
          <van-button 
            block 
            type="primary" 
            :loading="isLoading"
            @click="submitAlert"
          >
            {{ editingAlertId ? '保存修改' : '确认添加' }}
          </van-button>
        </div>
      </div>
    </van-action-sheet>
    
    <!-- [FIX] #65 时间选择器 -->
    <van-popup v-model:show="showTimePicker" position="bottom" round>
      <van-picker
        v-model="timePickerValue"
        :columns="timePickerColumns"
        @confirm="confirmTimePicker"
        @cancel="showTimePicker = false"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.alerts-page {
  height: 100%;
  background: var(--bg-primary);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}

/* [FIX] #68 通知权限提示 */
.permission-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fff3e0;
  color: #f57c00;
  font-size: 13px;
}

.permission-tip .van-icon {
  font-size: 16px;
}

.alert-list {
  padding: 12px;
}

.alert-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 12px;
}

.alert-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.type-icon {
  color: var(--color-primary);
}

.alert-info {
  flex: 1;
}

.alert-name {
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 500;
}

.alert-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.delete-btn {
  height: 100%;
}

/* 添加表单 */
.add-form {
  padding: 16px;
}

/* 基金搜索选择 */
.fund-select {
  margin-bottom: 16px;
}

.selected-fund {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  margin-top: 8px;
}

.selected-fund .fund-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
}

.selected-fund .fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.search-results {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-top: 8px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.result-item:last-child {
  border-bottom: none;
}

.result-item:active {
  background: var(--bg-tertiary);
}

.result-item .fund-name {
  font-size: 14px;
  color: var(--text-primary);
}

.result-item .fund-code {
  font-size: 12px;
  color: var(--text-secondary);
}

.type-selector {
  padding: 16px 0;
}

.type-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.type-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.type-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--bg-tertiary);
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.type-option.active {
  border-color: var(--color-primary);
  background: rgba(37, 99, 235, 0.1);
}

.type-option span {
  font-size: 13px;
  color: var(--text-secondary);
}

.type-option.active span {
  color: var(--color-primary);
}

.form-actions {
  margin-top: 24px;
}

/* [FIX] #67 输入范围提示 */
.field-hint {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
