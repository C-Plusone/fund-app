#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基金数据抓取工具
[WHY] 批量抓取多个数据源，验证和对比数据准确性
[WHAT] 支持天天基金估值、东方财富净值、蚂蚁基金等多个数据源
"""

import requests
import json
import re
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed

# 请求头
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://fund.eastmoney.com/',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
}


@dataclass
class FundData:
    """基金数据结构"""
    code: str                    # 基金代码
    name: str                    # 基金名称
    nav: float                   # 单位净值（基金公司公布）
    nav_date: str               # 净值日期
    estimate: float             # 估算净值
    estimate_time: str          # 估值时间
    day_change: float           # 日涨跌幅(%)
    source: str                 # 数据来源


class FundAPI:
    """基金数据 API 抓取器"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
    
    # ========== 天天基金估值 ==========
    def fetch_tiantian_estimate(self, code: str) -> Optional[Dict]:
        """
        获取天天基金实时估值
        [WHY] 这是前端使用的估值接口，交易时间内每秒更新
        """
        url = f'https://fundgz.1234567.com.cn/js/{code}.js?rt={int(time.time() * 1000)}'
        try:
            resp = self.session.get(url, timeout=10)
            # 解析 jsonpgz({...}) 格式
            match = re.search(r'jsonpgz\((.*)\)', resp.text)
            if match:
                data = json.loads(match.group(1))
                return {
                    'code': data.get('fundcode', code),
                    'name': data.get('name', ''),
                    'dwjz': float(data.get('dwjz', 0)),  # 昨日净值
                    'gsz': float(data.get('gsz', 0)),    # 估算净值
                    'gszzl': float(data.get('gszzl', 0)),  # 估算涨跌幅
                    'gztime': data.get('gztime', ''),    # 估值时间
                    'source': '天天基金估值'
                }
        except Exception as e:
            print(f'[天天基金估值] {code} 失败: {e}')
        return None
    
    # ========== 东方财富历史净值 ==========
    def fetch_eastmoney_nav(self, code: str, page_size: int = 1) -> Optional[Dict]:
        """
        获取东方财富历史净值（基金公司公布）
        [WHY] 这是基金公司实际公布的净值，最准确
        """
        url = f'https://api.fund.eastmoney.com/f10/lsjz'
        params = {
            'callback': 'jQuery',
            'fundCode': code,
            'pageIndex': 1,
            'pageSize': page_size,
            '_': int(time.time() * 1000)
        }
        try:
            resp = self.session.get(url, params=params, timeout=10)
            # 解析 jQuery({...}) 格式
            match = re.search(r'jQuery\((.*)\)', resp.text)
            if match:
                data = json.loads(match.group(1))
                if data.get('Data', {}).get('LSJZList'):
                    latest = data['Data']['LSJZList'][0]
                    return {
                        'code': code,
                        'name': '',
                        'dwjz': float(latest.get('DWJZ', 0)),  # 单位净值
                        'ljjz': float(latest.get('LJJZ', 0)),  # 累计净值
                        'jzzzl': float(latest.get('JZZZL', 0) or 0),  # 日涨跌幅
                        'fsrq': latest.get('FSRQ', ''),  # 净值日期
                        'source': '东方财富净值'
                    }
        except Exception as e:
            print(f'[东方财富净值] {code} 失败: {e}')
        return None
    
    # ========== 东方财富基金详情 ==========
    def fetch_eastmoney_detail(self, code: str) -> Optional[Dict]:
        """
        获取东方财富基金详情
        [WHY] 包含基金名称、类型、规模等信息
        """
        url = f'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo'
        params = {
            'plat': 'Android',
            'appType': 'ttjj',
            'product': 'EFund',
            'Version': '6.9.2',
            'deviceid': '1',
            'Fcodes': code,
            '_': int(time.time() * 1000)
        }
        try:
            resp = self.session.get(url, params=params, timeout=10)
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
                    'jzrq': d.get('PDATE', ''),  # 净值日期
                    'source': '东方财富详情'
                }
        except Exception as e:
            print(f'[东方财富详情] {code} 失败: {e}')
        return None
    
    # ========== 蚂蚁基金 ==========
    def fetch_ant_fund(self, code: str) -> Optional[Dict]:
        """
        获取蚂蚁基金数据
        [WHY] 蚂蚁基金可能有不同的估值算法
        """
        url = 'https://www.fund123.cn/api/fund/queryFundInfo'
        params = {
            'fundCode': code,
            '_': int(time.time() * 1000)
        }
        try:
            resp = self.session.get(url, params=params, timeout=10)
            data = resp.json()
            if data.get('success') and data.get('result'):
                r = data['result']
                return {
                    'code': code,
                    'name': r.get('fundName', ''),
                    'dwjz': float(r.get('netValue', 0) or 0),
                    'gsz': float(r.get('estimateValue', 0) or 0),
                    'gszzl': float(r.get('estimateRate', 0) or 0),
                    'gztime': r.get('estimateTime', ''),
                    'source': '蚂蚁基金'
                }
        except Exception as e:
            print(f'[蚂蚁基金] {code} 失败: {e}')
        return None
    
    # ========== 综合获取 ==========
    def fetch_fund_data(self, code: str) -> Dict[str, Optional[Dict]]:
        """
        从多个数据源获取基金数据
        [WHAT] 同时获取估值和公布净值，用于对比验证
        """
        results = {}
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {
                executor.submit(self.fetch_tiantian_estimate, code): 'tiantian',
                executor.submit(self.fetch_eastmoney_nav, code): 'eastmoney_nav',
                executor.submit(self.fetch_eastmoney_detail, code): 'eastmoney_detail',
                executor.submit(self.fetch_ant_fund, code): 'ant',
            }
            
            for future in as_completed(futures):
                source = futures[future]
                try:
                    results[source] = future.result()
                except Exception as e:
                    results[source] = None
                    print(f'[{source}] {code} 异常: {e}')
        
        return results
    
    # ========== 批量获取 ==========
    def fetch_batch(self, codes: List[str]) -> Dict[str, Dict]:
        """
        批量获取多只基金数据
        """
        all_results = {}
        
        for code in codes:
            print(f'\n正在获取 {code}...')
            all_results[code] = self.fetch_fund_data(code)
            time.sleep(0.2)  # 避免请求过快
        
        return all_results


def compare_sources(results: Dict[str, Optional[Dict]]) -> None:
    """对比不同数据源的数据"""
    print('\n' + '=' * 60)
    print('数据源对比:')
    print('=' * 60)
    
    sources = []
    for name, data in results.items():
        if data:
            sources.append((name, data))
    
    if not sources:
        print('无数据')
        return
    
    # 获取基金名称
    name = ''
    for _, data in sources:
        if data.get('name'):
            name = data['name']
            break
    
    print(f'基金名称: {name}')
    print('-' * 60)
    print(f'{"数据源":<20} {"净值":<12} {"估值":<12} {"涨跌幅":<10} {"时间"}')
    print('-' * 60)
    
    for source_name, data in sources:
        dwjz = data.get('dwjz', 0)
        gsz = data.get('gsz', 0)
        gszzl = data.get('gszzl', data.get('jzzzl', 0))
        gztime = data.get('gztime', data.get('fsrq', ''))
        
        print(f'{source_name:<20} {dwjz:<12.4f} {gsz:<12.4f} {gszzl:<10.2f}% {gztime}')


def main():
    """主函数"""
    print('=' * 60)
    print('基金数据抓取工具')
    print(f'当前时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('=' * 60)
    
    api = FundAPI()
    
    # 测试基金列表
    test_codes = [
        '000216',  # 华安黄金ETF联接A
        '320007',  # 诺安成长混合
        '161725',  # 招商中证白酒指数
        '005827',  # 易方达蓝筹精选混合
        '012414',  # 国泰黄金ETF联接C
    ]
    
    print('\n测试基金列表:', test_codes)
    
    for code in test_codes:
        print(f'\n{"=" * 60}')
        print(f'基金代码: {code}')
        print('=' * 60)
        
        results = api.fetch_fund_data(code)
        compare_sources(results)
        
        time.sleep(0.5)
    
    print('\n\n抓取完成!')


if __name__ == '__main__':
    main()
