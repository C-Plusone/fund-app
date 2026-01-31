# 基金宝：一款开源的基金实时估值 Android 应用

> 投资有风险，理财需谨慎。本文介绍一款开源的基金管理工具，仅供学习交流使用。

## 前言

作为一个基金投资者，你是否有过这样的困扰：

- 想实时查看基金估值，但各大平台 APP 广告太多、体验臃肿？
- 想记录自己的持仓，计算真实收益，但手动计算太麻烦？
- 想对比多只基金的历史走势，但找不到合适的工具？

于是，**基金宝**诞生了——一款完全开源、无广告、功能丰富的基金管理工具。

## 项目简介

**基金宝**是一款基于 Vue 3 + Capacitor 开发的 Android 应用，专注于为个人投资者提供便捷的基金数据查询和持仓管理功能。

- **GitHub 地址**：https://github.com/xiriovo/fund-app
- **开源协议**：MIT License
- **技术栈**：Vue 3 + TypeScript + Vant 4 + Capacitor 7

### 下载地址

| 下载渠道 | 链接 | 备注 |
|---------|------|------|
| GitHub Releases | [下载](https://github.com/xiriovo/fund-app/releases) | 最新版本 |
| 123云盘 | [下载](https://www.123865.com/s/Tfksjv-0rThd) | 国内高速 |
| 蓝奏云 | [下载](https://wwbda.lanzn.com/ippf73hh019i) | 密码: `36mh` |

## 核心功能

### 1. 实时估值

基金宝支持秒级刷新基金实时估值数据，让你随时掌握基金涨跌情况。

- 支持添加自选基金
- 实时显示估算净值和涨跌幅
- 交易时间自动刷新数据

### 2. 专业走势图表

自研 Canvas 绑制引擎，支持多种时间维度的走势展示：

- **当日分时**：显示当日实时走势曲线
- **5日/月/季/年/3年**：历史K线走势
- 平滑曲线算法，视觉体验流畅

### 3. 持仓管理

完整的持仓记录功能，自动计算收益：

- 记录买入/卖出交易
- 自动计算持仓成本、收益、收益率
- 资产分布可视化饼图
- 支持导出收益报告图片

### 4. 基金对比

多基金同屏对比，快速发现投资机会：

- 最多支持 5 只基金同时对比
- 走势曲线叠加显示
- 各时间段收益率对比表格

### 5. 定投回测

历史数据回测，验证投资策略：

- 支持定投和一次性买入两种模式
- 自定义回测时间范围
- 详细的收益分析报告

### 6. 数据查询

丰富的基金信息查询功能：

| 功能 | 说明 |
|------|------|
| 分红记录 | 历史分红数据、分红方式 |
| 费率查询 | 申购费、赎回费、管理费 |
| 基金公告 | 分红公告、持仓报告 |
| 基金规模 | 资产规模变化追踪 |
| 同类基金 | 相似基金推荐对比 |

### 7. 智能提醒

设置涨跌幅预警，不错过任何投资机会：

- 支持涨幅/跌幅阈值提醒
- 净值突破提醒
- 本地通知推送

### 8. 更多功能

- **基金筛选**：多维度筛选优质基金
- **基金经理排行**：查看经理业绩榜单
- **板块行情**：各板块涨跌概览
- **投资日历**：记录投资计划
- **财经资讯**：实时财经新闻
- **深色模式**：护眼主题切换

## 技术架构

### 前端技术栈

```
Vue 3          - 渐进式 JavaScript 框架
TypeScript     - 类型安全的 JavaScript 超集
Vite 7         - 下一代前端构建工具
Vant 4         - 轻量级移动端 UI 组件库
Pinia          - Vue 状态管理库
Vue Router 4   - 官方路由管理器
```

### 移动端打包

```
Capacitor 7    - 跨平台原生运行时
Android SDK    - Android 原生支持
```

### 项目结构

```
fund-app/
├── src/
│   ├── api/          # API 接口封装
│   │   ├── fund.ts       # 基金基础 API
│   │   ├── fundFast.ts   # 快速估值 API
│   │   ├── tiantianApi.ts # 天天基金增强 API
│   │   ├── cache.ts      # 缓存管理
│   │   └── remote.ts     # 远程配置
│   ├── components/   # 通用组件
│   │   ├── FundCard.vue  # 基金卡片
│   │   └── OKXChart.vue  # 走势图表
│   ├── views/        # 页面组件
│   │   ├── Home.vue      # 首页/自选
│   │   ├── Detail.vue    # 基金详情
│   │   ├── Holding.vue   # 持仓管理
│   │   ├── Analysis.vue  # 资产分析
│   │   └── ...
│   ├── stores/       # Pinia 状态管理
│   │   ├── fund.ts       # 基金数据
│   │   ├── holding.ts    # 持仓数据
│   │   ├── alert.ts      # 提醒设置
│   │   └── theme.ts      # 主题设置
│   ├── router/       # 路由配置
│   └── utils/        # 工具函数
├── android/          # Android 原生项目
└── public/           # 静态资源
```

## 技术亮点

### 1. 自研 Canvas 图表引擎

没有使用 ECharts 等重量级图表库，而是基于 Canvas API 自研绘制引擎：

- **轻量级**：无额外依赖，包体积小
- **高性能**：原生 Canvas 绑制，流畅度高
- **定制性强**：完全控制每个像素的绘制

核心算法包括：
- Catmull-Rom 样条插值实现平滑曲线
- 自适应坐标轴刻度算法
- 触摸交互与十字线联动

### 2. JSONP 跨域方案

针对天天基金等数据源的跨域限制，采用 JSONP 方案：

```typescript
// JSONP 请求封装
function jsonpRequest(url: string, callbackName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    window[callbackName] = (data: any) => {
      resolve(data)
      delete window[callbackName]
      document.head.removeChild(script)
    }
    script.src = url
    script.onerror = reject
    document.head.appendChild(script)
  })
}
```

### 3. 智能缓存策略

多级缓存提升用户体验：

- **内存缓存**：热点数据秒级响应
- **localStorage 缓存**：持久化存储，离线可用
- **分级 TTL**：不同数据类型设置不同过期时间

```typescript
export const CACHE_TTL = {
  REALTIME: 10000,      // 实时数据 10秒
  SHORT: 60000,         // 短期缓存 1分钟
  MEDIUM: 300000,       // 中期缓存 5分钟
  LONG: 3600000,        // 长期缓存 1小时
}
```

### 4. 响应式主题系统

基于 CSS 变量实现的主题系统：

```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #333333;
  --color-up: #e74c3c;
  --color-down: #27ae60;
}

[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --text-primary: #e0e0e0;
}
```

## 快速开始

### 下载安装

直接下载 APK 安装：
- 前往 [GitHub Releases](https://github.com/xiriovo/fund-app/releases) 下载

### 本地开发

```bash
# 克隆项目
git clone https://github.com/xiriovo/fund-app.git
cd fund-app

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 编译 APK

```bash
# 构建并同步到 Android
npm run build
npx cap sync

# 编译 Release 版本
cd android
./gradlew assembleRelease
```

## 免责声明

⚠️ **重要提示**

1. 本工具**仅供学习交流使用**，不构成任何投资建议
2. 基金估值数据**仅供参考**，以基金公司公布的净值为准
3. 数据刷新有延迟，仅供学习和参考
4. **投资有风险，理财需谨慎**
5. 下载后请在 24 小时内删除

## 开源贡献

基金宝是一个开源项目，欢迎参与贡献！

- **提交 Issue**：报告 Bug 或提出建议
- **Pull Request**：贡献代码改进功能
- **Star 支持**：如果觉得有用，欢迎 Star

GitHub：https://github.com/xiriovo/fund-app

## 结语

基金宝的初衷是为投资者提供一个简洁、高效、无广告的基金管理工具。通过开源的方式，希望能帮助更多人学习移动端开发技术，同时也欢迎社区贡献力量，让这个工具变得更好。

如果你也是一个基金投资者，或者对 Vue + Capacitor 移动端开发感兴趣，欢迎下载体验或参与贡献！

---

**投资有风险，理财需谨慎。**
