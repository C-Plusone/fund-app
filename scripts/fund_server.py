#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基金数据 API 服务器
[WHY] 提供准确实时的基金数据接口，供前端调用
[WHAT] 使用 Flask 提供 RESTful API，支持 CORS
[DEPS] pip install flask flask-cors requests
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import json
import re
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional, List
import threading

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 请求头
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://fund.eastmoney.com/',
}

# 缓存
cache: Dict[str, Dict] = {}
cache_lock = threading.Lock()
CACHE_TTL = 30  # 缓存30秒


def get_cached(key: str) -> Optional[Dict]:
    """获取缓存数据"""
    with cache_lock:
        if key in cache:
            item = cache[key]
            if time.time() - item['timestamp'] < CACHE_TTL:
                return item['data']
    return None


def set_cache(key: str, data: Dict) -> None:
    """设置缓存"""
    with cache_lock:
        cache[key] = {
            'data': data,
            'timestamp': time.time()
        }


def fetch_tiantian_estimate(code: str) -> Optional[Dict]:
    """获取天天基金估值"""
    url = f'https://fundgz.1234567.com.cn/js/{code}.js?rt={int(time.time() * 1000)}'
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        match = re.search(r'jsonpgz\((.*)\)', resp.text)
        if match:
            data = json.loads(match.group(1))
            return {
                'code': data.get('fundcode', code),
                'name': data.get('name', ''),
                'dwjz': float(data.get('dwjz', 0) or 0),
                'gsz': float(data.get('gsz', 0) or 0),
                'gszzl': float(data.get('gszzl', 0) or 0),
                'gztime': data.get('gztime', ''),
            }
    except Exception as e:
        print(f'[天天基金] {code} 失败: {e}')
    return None


def fetch_eastmoney_nav(code: str) -> Optional[Dict]:
    """获取东方财富公布净值"""
    url = 'https://api.fund.eastmoney.com/f10/lsjz'
    params = {
        'callback': 'jQuery',
        'fundCode': code,
        'pageIndex': 1,
        'pageSize': 1,
        '_': int(time.time() * 1000)
    }
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=10)
        match = re.search(r'jQuery\((.*)\)', resp.text)
        if match:
            data = json.loads(match.group(1))
            if data.get('Data', {}).get('LSJZList'):
                latest = data['Data']['LSJZList'][0]
                return {
                    'dwjz': float(latest.get('DWJZ', 0) or 0),
                    'ljjz': float(latest.get('LJJZ', 0) or 0),
                    'jzzzl': float(latest.get('JZZZL', 0) or 0),
                    'fsrq': latest.get('FSRQ', ''),
                }
    except Exception as e:
        print(f'[东方财富] {code} 失败: {e}')
    return None


def fetch_eastmoney_detail(code: str) -> Optional[Dict]:
    """获取东方财富基金详情"""
    url = 'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo'
    params = {
        'plat': 'Android',
        'appType': 'ttjj',
        'product': 'EFund',
        'Version': '6.9.2',
        'deviceid': '1',
        'Fcodes': code,
    }
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=10)
        data = resp.json()
        if data.get('Datas'):
            d = data['Datas'][0]
            return {
                'code': d.get('FCODE', code),
                'name': d.get('SHORTNAME', ''),
                'type': d.get('FTYPE', ''),
                'dwjz': float(d.get('DWJZ', 0) or 0),
                'gsz': float(d.get('GSZ', 0) or 0),
                'gszzl': float(d.get('GSZZL', 0) or 0),
                'gztime': d.get('GZTIME', ''),
                'pdate': d.get('PDATE', ''),
            }
    except Exception as e:
        print(f'[东方财富详情] {code} 失败: {e}')
    return None


def get_fund_data(code: str) -> Dict:
    """
    获取综合基金数据
    [WHAT] 整合多个数据源，返回最准确的数据
    """
    cache_key = f'fund_{code}'
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    # 并发获取多个数据源
    with ThreadPoolExecutor(max_workers=3) as executor:
        estimate_future = executor.submit(fetch_tiantian_estimate, code)
        nav_future = executor.submit(fetch_eastmoney_nav, code)
        detail_future = executor.submit(fetch_eastmoney_detail, code)
        
        estimate = estimate_future.result()
        nav = nav_future.result()
        detail = detail_future.result()
    
    # 整合数据
    result = {
        'code': code,
        'name': '',
        'type': '',
        # 公布净值（最准确）
        'nav': 0,
        'navDate': '',
        'navChange': 0,
        # 估算值（交易时间参考）
        'estimate': 0,
        'estimateTime': '',
        'estimateChange': 0,
        # 推荐使用的值
        'currentValue': 0,
        'dayChange': 0,
        # 数据源状态
        'sources': {
            'estimate': estimate is not None,
            'nav': nav is not None,
            'detail': detail is not None,
        },
        'updateTime': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }
    
    # 填充数据
    if detail:
        result['name'] = detail.get('name', '')
        result['type'] = detail.get('type', '')
        result['estimate'] = detail.get('gsz', 0)
        result['estimateTime'] = detail.get('gztime', '')
        result['estimateChange'] = detail.get('gszzl', 0)
    
    if estimate:
        result['name'] = result['name'] or estimate.get('name', '')
        result['estimate'] = estimate.get('gsz', 0)
        result['estimateTime'] = estimate.get('gztime', '')
        result['estimateChange'] = estimate.get('gszzl', 0)
    
    if nav:
        result['nav'] = nav.get('dwjz', 0)
        result['navDate'] = nav.get('fsrq', '')
        result['navChange'] = nav.get('jzzzl', 0)
    
    # 确定推荐值：优先公布净值
    if result['nav'] > 0:
        result['currentValue'] = result['nav']
        result['dayChange'] = result['navChange']
    elif result['estimate'] > 0:
        result['currentValue'] = result['estimate']
        result['dayChange'] = result['estimateChange']
    
    set_cache(cache_key, result)
    return result


# ========== API 路由 ==========

@app.route('/api/fund/<code>')
def get_fund(code: str):
    """获取单只基金数据"""
    data = get_fund_data(code)
    return jsonify({
        'success': True,
        'data': data
    })


@app.route('/api/funds')
def get_funds():
    """批量获取基金数据"""
    codes = request.args.get('codes', '').split(',')
    codes = [c.strip() for c in codes if c.strip()]
    
    if not codes:
        return jsonify({
            'success': False,
            'error': '请提供基金代码列表'
        })
    
    if len(codes) > 50:
        return jsonify({
            'success': False,
            'error': '一次最多查询50只基金'
        })
    
    results = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(get_fund_data, code): code for code in codes}
        for future in futures:
            code = futures[future]
            try:
                results[code] = future.result()
            except Exception as e:
                results[code] = {'error': str(e)}
    
    return jsonify({
        'success': True,
        'data': results
    })


@app.route('/api/health')
def health():
    """健康检查"""
    return jsonify({
        'success': True,
        'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'cache_size': len(cache)
    })


@app.route('/')
def index():
    """首页"""
    return '''
    <h1>基金数据 API</h1>
    <p>可用接口:</p>
    <ul>
        <li><code>GET /api/fund/{code}</code> - 获取单只基金</li>
        <li><code>GET /api/funds?codes=000216,320007</code> - 批量获取</li>
        <li><code>GET /api/health</code> - 健康检查</li>
    </ul>
    '''


if __name__ == '__main__':
    print('=' * 50)
    print('基金数据 API 服务器')
    print('=' * 50)
    print('接口地址: http://localhost:5000')
    print('示例: http://localhost:5000/api/fund/000216')
    print('=' * 50)
    
    app.run(host='0.0.0.0', port=5000, debug=True)
