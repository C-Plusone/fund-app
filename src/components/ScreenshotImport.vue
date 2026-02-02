<script setup lang="ts">
// [WHY] 截图导入组件 - 通过 OCR 识别截图中的持仓信息
// [WHAT] 支持拍照/选择图片，识别基金持仓并批量导入
// [DEPS] 依赖 ocr.ts 进行文字识别

import { ref, computed } from 'vue'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { recognizeHoldings, type RecognizedHolding } from '@/utils/ocr'
import { searchFund, fetchFundEstimate } from '@/api/fund'
import { useHoldingStore } from '@/stores/holding'
import type { HoldingRecord, FundInfo } from '@/types/fund'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'imported', count: number): void
}>()

const holdingStore = useHoldingStore()

// [WHAT] 组件状态
const step = ref<'upload' | 'recognizing' | 'preview' | 'importing'>('upload')
const selectedImage = ref<string>('')
const ocrProgress = ref(0)
const ocrStatus = ref('')
const recognizedHoldings = ref<RecognizedHolding[]>([])
const selectedCodes = ref<Set<string>>(new Set())

// [WHAT] 增强后的持仓信息（包含从 API 获取的名称和净值）
interface EnhancedHolding extends RecognizedHolding {
  fundInfo?: FundInfo
  netValue?: number
  loading?: boolean
  selected?: boolean
}
const enhancedHoldings = ref<EnhancedHolding[]>([])

// [WHAT] 计算选中数量
const selectedCount = computed(() => {
  return enhancedHoldings.value.filter(h => h.selected && h.code).length
})

// [WHAT] 文件选择处理
async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  // [WHAT] 验证文件类型
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    return
  }
  
  // [WHAT] 转换为 Base64 预览
  const reader = new FileReader()
  reader.onload = async (e) => {
    selectedImage.value = e.target?.result as string
    await startRecognition(file)
  }
  reader.readAsDataURL(file)
}

// [WHAT] 开始 OCR 识别
async function startRecognition(file: File) {
  step.value = 'recognizing'
  ocrProgress.value = 0
  ocrStatus.value = '准备识别...'
  
  try {
    const holdings = await recognizeHoldings(file, (progress, status) => {
      ocrProgress.value = Math.round(progress * 100)
      ocrStatus.value = status
    })
    
    recognizedHoldings.value = holdings
    
    if (holdings.length === 0) {
      showToast('未识别到持仓信息，请确保截图清晰')
      step.value = 'upload'
      return
    }
    
    // [WHAT] 增强持仓信息（获取基金名称和净值）
    await enhanceHoldings(holdings)
    step.value = 'preview'
    
  } catch (error) {
    console.error('OCR识别失败:', error)
    showToast('识别失败，请重试')
    step.value = 'upload'
  }
}

// [WHAT] 增强持仓信息
async function enhanceHoldings(holdings: RecognizedHolding[]) {
  enhancedHoldings.value = holdings.map(h => ({
    ...h,
    loading: true,
    selected: h.code && h.amount > 0 && !holdingStore.hasHolding(h.code)
  }))
  
  // [WHAT] 并行获取基金信息
  const promises = holdings.map(async (h, index) => {
    if (!h.code) {
      enhancedHoldings.value[index].loading = false
      return
    }
    
    try {
      // [WHAT] 获取基金信息
      const results = await searchFund(h.code, 1)
      if (results.length > 0) {
        enhancedHoldings.value[index].fundInfo = results[0]
        if (!h.name) {
          enhancedHoldings.value[index].name = results[0].name
        }
      }
      
      // [WHAT] 获取当前净值
      const estimate = await fetchFundEstimate(h.code)
      if (estimate) {
        enhancedHoldings.value[index].netValue = parseFloat(estimate.dwjz) || parseFloat(estimate.gsz) || 1
      }
    } catch (error) {
      console.error(`获取基金 ${h.code} 信息失败:`, error)
    } finally {
      enhancedHoldings.value[index].loading = false
    }
  })
  
  await Promise.all(promises)
}

// [WHAT] 切换选中状态
function toggleSelect(index: number) {
  const holding = enhancedHoldings.value[index]
  if (!holding.code) {
    showToast('该项缺少基金代码')
    return
  }
  if (holdingStore.hasHolding(holding.code)) {
    showToast('该基金已在持仓中')
    return
  }
  holding.selected = !holding.selected
}

// [WHAT] 全选/取消全选
function toggleSelectAll() {
  const validHoldings = enhancedHoldings.value.filter(
    h => h.code && h.amount > 0 && !holdingStore.hasHolding(h.code)
  )
  const allSelected = validHoldings.every(h => h.selected)
  
  validHoldings.forEach(h => {
    h.selected = !allSelected
  })
}

// [WHAT] 修改金额
function updateAmount(index: number, value: string) {
  const amount = parseFloat(value)
  if (!isNaN(amount) && amount >= 0) {
    enhancedHoldings.value[index].amount = amount
  }
}

// [WHAT] 确认导入
async function confirmImport() {
  const toImport = enhancedHoldings.value.filter(h => h.selected && h.code && h.amount > 0)
  
  if (toImport.length === 0) {
    showToast('请选择要导入的持仓')
    return
  }
  
  step.value = 'importing'
  const loading = showLoadingToast({ message: '导入中...', forbidClick: true })
  
  try {
    let imported = 0
    
    for (const h of toImport) {
      // [WHAT] 构建持仓记录
      const netValue = h.netValue || 1
      const shares = h.amount / netValue
      
      const record: HoldingRecord = {
        code: h.code,
        name: h.name || h.fundInfo?.name || h.code,
        shareClass: detectShareClass(h.code, h.name),
        amount: h.amount,
        buyNetValue: netValue,
        shares: shares,
        buyDate: new Date().toISOString().split('T')[0],
        holdingDays: 0,
        createdAt: Date.now()
      }
      
      await holdingStore.addOrUpdateHolding(record)
      imported++
    }
    
    closeToast()
    showToast(`成功导入 ${imported} 只基金`)
    emit('imported', imported)
    closeDialog()
    
  } catch (error) {
    closeToast()
    console.error('导入失败:', error)
    showToast('导入失败，请重试')
    step.value = 'preview'
  }
}

// [WHAT] 检测基金份额类型
function detectShareClass(code: string, name: string): 'A' | 'C' {
  if (name?.includes('C') || code?.endsWith('C')) return 'C'
  return 'A'
}

// [WHAT] 关闭弹窗
function closeDialog() {
  emit('update:show', false)
  // [WHAT] 重置状态
  setTimeout(() => {
    step.value = 'upload'
    selectedImage.value = ''
    ocrProgress.value = 0
    ocrStatus.value = ''
    recognizedHoldings.value = []
    enhancedHoldings.value = []
  }, 300)
}

// [WHAT] 重新选择图片
function reselectImage() {
  step.value = 'upload'
  selectedImage.value = ''
}

// [WHAT] 获取置信度颜色
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return '#67c23a'
  if (confidence >= 0.5) return '#e6a23c'
  return '#f56c6c'
}

// [WHAT] 格式化金额
function formatAmount(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <van-popup
    :show="props.show"
    position="bottom"
    round
    :style="{ height: '85%' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="import-dialog">
      <!-- 标题栏 -->
      <div class="dialog-header">
        <span>截图导入持仓</span>
        <van-icon name="cross" @click="closeDialog" />
      </div>

      <!-- 上传步骤 -->
      <div v-if="step === 'upload'" class="upload-step">
        <div class="upload-tip">
          <van-icon name="photo-o" size="48" color="var(--color-primary)" />
          <p class="tip-title">选择持仓截图</p>
          <p class="tip-desc">支持支付宝、天天基金、蛋卷基金等平台的持仓截图</p>
        </div>
        
        <div class="upload-actions">
          <label class="upload-btn">
            <van-icon name="photograph" />
            <span>拍照</span>
            <input type="file" accept="image/*" capture="environment" @change="handleFileChange" />
          </label>
          <label class="upload-btn">
            <van-icon name="photo" />
            <span>相册</span>
            <input type="file" accept="image/*" @change="handleFileChange" />
          </label>
        </div>
        
        <div class="usage-tips">
          <p class="tips-title">使用提示</p>
          <ul>
            <li>请确保截图清晰，包含基金代码和金额</li>
            <li>支持一次导入多只基金</li>
            <li>识别后可手动修改金额</li>
          </ul>
        </div>
      </div>

      <!-- 识别中 -->
      <div v-if="step === 'recognizing'" class="recognizing-step">
        <div class="preview-image">
          <img :src="selectedImage" alt="截图预览" />
        </div>
        <div class="progress-section">
          <van-progress :percentage="ocrProgress" stroke-width="8" />
          <p class="progress-text">{{ ocrStatus }}</p>
        </div>
      </div>

      <!-- 预览确认 -->
      <div v-if="step === 'preview'" class="preview-step">
        <div class="preview-header">
          <span>识别到 {{ enhancedHoldings.length }} 条记录</span>
          <van-button size="small" plain @click="toggleSelectAll">
            {{ selectedCount === enhancedHoldings.filter(h => h.code && h.amount > 0 && !holdingStore.hasHolding(h.code)).length ? '取消全选' : '全选' }}
          </van-button>
        </div>
        
        <div class="holdings-list">
          <div 
            v-for="(holding, index) in enhancedHoldings" 
            :key="index"
            class="holding-item"
            :class="{ selected: holding.selected, disabled: !holding.code || holdingStore.hasHolding(holding.code) }"
            @click="toggleSelect(index)"
          >
            <div class="item-checkbox">
              <van-checkbox 
                :model-value="holding.selected" 
                :disabled="!holding.code || holdingStore.hasHolding(holding.code)"
                @click.stop
                @update:model-value="holding.selected = $event"
              />
            </div>
            <div class="item-content">
              <div class="item-name">
                <span class="fund-name">{{ holding.name || holding.fundInfo?.name || '未知基金' }}</span>
                <span v-if="holding.code" class="fund-code">{{ holding.code }}</span>
                <van-loading v-if="holding.loading" size="12" />
              </div>
              <div class="item-info">
                <span v-if="holdingStore.hasHolding(holding.code)" class="tag-exists">已持有</span>
                <span v-else class="confidence" :style="{ color: getConfidenceColor(holding.confidence) }">
                  置信度 {{ Math.round(holding.confidence * 100) }}%
                </span>
              </div>
            </div>
            <div class="item-amount">
              <input 
                type="number" 
                :value="holding.amount"
                class="amount-input"
                @click.stop
                @input="updateAmount(index, ($event.target as HTMLInputElement).value)"
              />
              <span class="amount-unit">元</span>
            </div>
          </div>
        </div>
        
        <div class="preview-footer">
          <van-button plain @click="reselectImage">重新选择</van-button>
          <van-button type="primary" :disabled="selectedCount === 0" @click="confirmImport">
            导入 {{ selectedCount }} 只基金
          </van-button>
        </div>
      </div>

      <!-- 导入中 -->
      <div v-if="step === 'importing'" class="importing-step">
        <van-loading size="48" />
        <p>正在导入...</p>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.import-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
}

/* 上传步骤 */
.upload-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
}

.upload-tip {
  text-align: center;
  padding: 32px 0;
}

.tip-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 16px 0 8px;
}

.tip-desc {
  font-size: 14px;
  color: var(--text-secondary);
}

.upload-actions {
  display: flex;
  gap: 16px;
  padding: 16px;
}

.upload-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  background: var(--bg-primary);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:active {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.upload-btn input {
  display: none;
}

.upload-btn span {
  font-size: 14px;
  color: var(--text-primary);
}

.usage-tips {
  margin-top: auto;
  padding: 16px;
  background: var(--bg-primary);
  border-radius: 12px;
}

.tips-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.usage-tips ul {
  margin: 0;
  padding-left: 20px;
}

.usage-tips li {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
}

/* 识别中 */
.recognizing-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.preview-image {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  background: var(--bg-primary);
}

.preview-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.progress-section {
  padding: 24px 0;
}

.progress-text {
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 12px;
}

/* 预览步骤 */
.preview-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  font-size: 14px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.holdings-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.holding-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.holding-item.selected {
  background: var(--color-primary-bg);
  border: 1px solid var(--color-primary);
}

.holding-item.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.item-checkbox {
  flex-shrink: 0;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-name {
  display: flex;
  align-items: center;
  gap: 8px;
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
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.item-info {
  margin-top: 4px;
}

.confidence {
  font-size: 12px;
}

.tag-exists {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-warning-bg, #fffbe6);
  color: var(--color-warning, #faad14);
  border-radius: 4px;
}

.item-amount {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.amount-input {
  width: 80px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
  text-align: right;
}

.amount-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.amount-unit {
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-footer {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.preview-footer .van-button {
  flex: 1;
}

/* 导入中 */
.importing-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary);
}
</style>
