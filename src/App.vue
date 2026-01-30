<script setup lang="ts">
// [WHY] 根组件，包含路由视图和底部导航
// [WHAT] 使用 Vant Tabbar 实现底部导航切换
// [NOTE] 公告和更新检查已移至 Home.vue 中处理
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// [WHAT] 当前激活的 tab
const activeTab = ref('home')

// [WHAT] 需要隐藏底部导航的页面
const hiddenTabbarPages = ['search', 'detail', 'trades']
const showTabbar = computed(() => !hiddenTabbarPages.includes(route.name as string))

// [WHY] 路由变化时同步更新 tab 状态
watch(
  () => route.name,
  (name) => {
    const tabMap: Record<string, string> = {
      home: 'home',
      market: 'market',
      holding: 'holding',
      analysis: 'analysis'
    }
    if (name && tabMap[name as string]) {
      activeTab.value = tabMap[name as string]
    }
  },
  { immediate: true }
)

// [WHAT] 切换 tab 时跳转路由
function onTabChange(name: string | number) {
  const routeMap: Record<string, string> = {
    home: '/',
    market: '/market',
    holding: '/holding',
    analysis: '/analysis'
  }
  if (routeMap[name as string]) {
    router.push(routeMap[name as string])
  }
}
</script>

<template>
  <div class="app-container">
    <!-- 路由视图 -->
    <!-- [WHY] 暂时禁用 keep-alive 避免页面缓存混乱 -->
    <router-view />

    <!-- 底部导航栏 -->
    <van-tabbar
      v-if="showTabbar"
      v-model="activeTab"
      @change="onTabChange"
    >
      <van-tabbar-item name="home" icon="home-o">自选</van-tabbar-item>
      <van-tabbar-item name="market" icon="chart-trending-o">行情</van-tabbar-item>
      <van-tabbar-item name="holding" icon="balance-list-o">持仓</van-tabbar-item>
      <van-tabbar-item name="analysis" icon="bar-chart-o">分析</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  /* [WHY] 使用主题变量 */
  background: var(--bg-primary);
  padding-bottom: 50px;
  transition: background-color 0.3s;
}
</style>
