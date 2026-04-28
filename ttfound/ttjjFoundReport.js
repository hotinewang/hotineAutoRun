/**
 * 天天基金网指定基金查询，查询每个基金时间隔2秒，失败最多重试2次，每次间隔5秒
 * */
//const axios = require('axios');
const http = require('http');

//基金信息数组(去重)
const fundInfoList = [];
//基金信息数组（用户关注的基金）
const watchlist = [];
//调试模式会多输出信息
const debugMode = false;
//用户关注的基金列表的内容
const watchlistText = `
008888,华夏国证半导体芯片指数(已赎回),4550,1.0989,2025-08-04
018177,华夏科创50指数增强(已赎回),3057.11,1.1449,2025-08-08
014439,博时恒生科技交易性开放指数(已赎回),19214.14,1.0409,2025-08-22


010027,[长亏]景顺长城核心中景1年(天天|妈妈),49418.36,1.0118,2020-12-16
010027,[长亏]景顺长城核心中景1年(天天),9883.67,1.0118,2020-12-16
011099,[长亏]富国价值创造混A(民生),5474.32,1.012,2021-01-12
006297,富国鑫旺稳健养老目标1年(民生|妈妈),17820.59,1.0673,2021-01-13
010534,广发均衡增长混合A(天天|妈妈),19461.69,1.01,2021-01-25
010534,广发均衡增长混合A(民生|爸爸),29979,1.0007,2021-01-27
011752,广发核心优选6个月(民生),9901.19,1.01,2021-04-26
012967,[长亏]广发行业严选3年(天天),98.806,1.0121,2021-08-26
006392,[长亏]中信保诚创新成长混合(中信证券),1312.12,3.8106,2021-12-28
013323,国寿安保盛泽3年(民生),19766.41,1.0118,2022-01-17
013323,国寿安保盛泽3年(民生|爸爸),98833.76,1.0118,2022-01-17
014950,汇安润阳3年(民生|妈妈),49409.11,1.012,2022-04-01
002943,广发多因子混合(民生),2533.92,4.2203,2025-08-06
001637,嘉实量化精选股票(天天),4856.12,1.5141,2025-08-08
160638,鹏华中证一带一路主题指数LOF(天天),4043.24,2.4733,2025-09-26
012372,[长亏]东财互联网C(天天),10210.33,0.9794,2025-10-09


`;
/*
010027,景顺长城核心中景一年（天天|妈妈）,49418.36,1.0118,2020-12-16
010027,景顺长城核心中景一年（天天）,9883.67,1.0118,2020-12-16
011099,富国价值创造混合A（民生）,5474.32,1.012,2021-01-12
010534,广发均衡增长混合A（民生|爸爸）,29979,1.0007,2021-01-27
011752,广发核心优选六个月（民生）,9901.19,1.01,2021-04-26
003025,新华红利回报混合（天天）,4385.16,1.1402,2021-06-18
012967,广发行业严选三年（天天）,98.806,1.0121,2021-08-26
014188,华夏量化优选股票C（恒丰）,10005.37,0.9995,2021-11-30
006392,中信保诚创新成长混合（中信证券）,1312.12,3.8106,2021-12-28
013323,国寿安保盛泽三年（民生）,19766.41,1.0118,2022-01-17
013323,国寿安保盛泽三年（民生|爸爸）,98833.76,1.0118,2022-01-17
015769,天弘低碳经济混合（民生）,9881.42,1.012,2022-06-07
008888,华夏国证半导体芯片指数（民生）,9100.01,1.0989,2025-08-04
002943,广发多因子混合（民生）,2533.92,4.2203,2025-08-06
001637,嘉实量化精选股票（天天）,4856.12,1.5141,2025-08-08
018177,华夏科创50指数增强（天天）,6114.22,1.1449,2025-08-08
014439,博时恒生科技交易性开放式指数（民生）,19214.14,1.0409,2025-08-22
210008,金鹰策略配置混合（天天）,4377.99,2.5126,2022-03-08
006297,富国鑫旺稳健养老目标一年（民生|妈妈）,17820.59,1.0673,1900-01-01
014950,汇安润阳三年（民生|妈妈）,49409.11,1.012,1900-01-01
010534,广发均衡增长（天天|妈妈）,19461.69,1.01,2021-01-25
*/


/**
 * 发送推送消息到ntfy服务
 * @param {string} topic - 消息的主题
 * @param {string} message - 要发送的消息内容
 * @param {string} title - 消息的大标题(默认不使用大标题)
 * @param {int} [priority=3] - 消息的优先级，可以是1-5的整数，分别是最小、小、默认、大、最大
 * @param {array} [tags] - 消息的标签,字符串数组。
 * @param {array} [attach] - 附件、图片URL。
 * @param {array} [click] - 消息被点击时跳转的url。
 * @param {string} [serverUrl='https://ntfy.sh'] - ntfy服务的URL,默认为官方服务器
 */
async function sendNtfyMessage(topic, message, title = null, priority = 3, tags = null, attach = null, click = null, serverUrl = 'https://ntfy.sh') {
    try {
        if (topic == null || message == null || priority > 5 || priority < 1) {
            console.error("topic、message不能为空，priority的值只能取1、2、3、4、5!");
        }

        // 构建请求的headers
        const headers = new Headers({
            'Content-Type': 'application/json',
        });

        // 创建消息Object
        const payload = { topic, message, priority };
        if (title) payload.title = title;
        if (tags) payload.tags = tags;
        if (attach) payload.attach = attach;
        if (click) payload.click = click;

        // 构建请求的body
        const body = JSON.stringify(payload);
        //console.log('拟发出的消息body:', body);

        // 发送POST请求到ntfy服务
        const response = await fetch(serverUrl, { method: 'POST', headers: headers, body: body });

        // 检查响应状态
        if (!response.ok) {
            throw new Error(`HTTP 错误! 状态: ${response.status}`);
        }

        // 获取响应数据
        const data = await response.json();
        console.log('消息发送成功:\n', ""/*data*/);
    } catch (error) {
        console.error('消息发送失败:\n', error);
    }
}

function formatDate(ts) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0'); // 月
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}


/**
 * 解析关注的基金列表文本，并生成一个包含基金信息的数组)
 */
function readWatchlistTextFile() {
    if (debugMode) { console.log(`readWatchlistTextFile解析基金列表`); }
    try {
        // 1. 去掉头尾空白（含换行）+ 中间多余空行
        const cleaned = watchlistText
            .trim()                       // 头尾换行/空格干掉
            .replace(/[\r\n]{2,}/g, '\n'); // 连续 2 个以上换行 → 1 个

        // 2. 按行拆数组，再去掉每行首尾空格（保险）
        const lines = cleaned
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);             // 过滤空字符串（万一还有）

        // 3. 处理每行数据
        for (const line of lines) {
            if (debugMode) { console.log(line); }
            //010027,景顺长城核心中景一年持有混合,49418.35,1.0118,2020-12-16
            const obj = (([fundCode, shortName, fundShares, costPerShare, confirmationDate]) => ({ fundCode, shortName, fundShares, costPerShare, confirmationDate }))(line.split(','));
            obj.fundShares=parseFloat(obj.fundShares);
            obj.costPerShare=parseFloat(obj.costPerShare);
            if (debugMode) { console.log(obj); }
            watchlist.push(obj);
        }
        console.log("基金清单数据解析完毕，条数：", watchlist.length);
        return watchlist;
    } catch (err) {
        console.error('读取用户基金名单文件'  + '异常:', err);
        return [];
    }
}

// 辅助函数：创建一个延迟的 Promise，用于暂停异步函数的执行
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 从天天基金网下载单个基金 JS 文件，最多尝试 2 次
 * @param {string} code
 * @returns {Promise<string>} 文件内容
 */
function loadFundData(code) {
    const url = `http://fund.eastmoney.com/pingzhongdata/${code}.js`;

    return new Promise((resolve, reject) => {
        let retries = 0;
        const maxRetries = 2;          // 允许额外重试 2 次

        function attempt() {
            const req = http.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
                if (res.statusCode !== 200) {
                    return retryOrReject(new Error(`status ${res.statusCode}`));
                }
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => resolve(body));
            });
            req.on('error', retryOrReject);
            req.setTimeout(15_000, () => {
                req.destroy();
                retryOrReject(new Error('timeout'));
            });
        }

        async function retryOrReject(err) {
            if (retries < maxRetries) {
                retries++;
                console.log(`[${code}] 加载失败，第${retries}次重试，等待 5 秒...`);
                await delay(5000); // 暂停 5 秒
                return attempt();
            }
            reject(err);
        }

        attempt();
    });
}


/**
 * 把 fundInfoList 里的属性合并到 watchList 对应项（按 fundCode 匹配），并计算持有天数与收益率
 * @param {Array<Object>} fundInfoList  源数据
 * @param {Array<Object>} watchList     目标数据（会被原地修改）
 * @returns {Array<Object>} watchList 本身（方便链式调用）
 */
function mergeByFundCode(fundInfoList, watchList) {
    if(debugMode){console.log('开始匹配基金收益数据...')};
  // 1. 建立 fundCode -> 信息对象 的索引
  const infoMap = new Map(fundInfoList.map(item => [item.fundCode, item]));

  // 2. 遍历 watchList，找到匹配就合并属性
  watchList.forEach(watchItem => {
    const info = infoMap.get(watchItem.fundCode);
    if (info) {
      Object.assign(watchItem, info);   // 把 info 上所有属性拷到 watchItem
    }
    //计算持有天数
    watchItem.holdDays = Math.max(0, Math.floor((new Date(watchItem.nowDate + 'T00:00:00') - new Date(watchItem.confirmationDate + 'T00:00:00')) / 86400000)); // 864e5 = 24*60*60*1000
    if(!watchItem.holdDays){
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        watchItem.holdDays = Math.max(0, Math.floor((yesterday - new Date(watchItem.confirmationDate + 'T00:00:00')) / 86400000)); // 864e5 = 24*60*60*1000
    }
    //计算收益率和年化收益率
    watchItem.returnRate=watchItem.costPerShare === 0 ? 0 : watchItem.nowNetWorthTrend / watchItem.costPerShare-1;
    watchItem.annualizedReturn =watchItem.returnRate/watchItem.holdDays*365;
    if(debugMode){console.log('匹配：',watchItem)};

  });

  return watchList;
}

/**
 * 生成NTFY消息通知文本
 */
function toNtfyMsg(){
    var reporttxt = `📰基金日报（${new Date().getMonth() + 1}月${new Date().getDate()}日）📰\n\n`;
    //打印基金信息
    watchlist.forEach(item => {
        ////如果有持仓日，则根据持仓收益显示对应的图标
        if (item.confirmationDate) {
            if(item.returnRate >=0){
                reporttxt+="💰";
            }
            else{
                reporttxt+="💸";
            }
        }
        else{
            reporttxt+="📊";
        }
        //基金名称和代码
        reporttxt += `${item.fundCode}:${item.shortName}`;
        //最新净值日
        reporttxt+=`${new Date(item.nowDate).getMonth() + 1}月${new Date(item.nowDate).getDate()}日\n`;
        //计算盈亏
        let c=Math.round((item.fundShares*item.nowNetWorthTrend-item.fundShares*item.costPerShare)*100)/100;
        if(c>=0){
            reporttxt+=`  - 浮盈+${c}元`;
        }else{
            reporttxt+=`  - 浮亏${c}元`;
        }
        reporttxt += `持仓${item.holdDays}天\n`
        //持仓收益
        reporttxt += `  - 年化${Math.round(item.annualizedReturn*10000)/100}% 总收益${Math.round(item.returnRate*10000)/100}%\n`;
        //reporttxt += `持仓${item.holdDays}天\n`
        //reporttxt += `  - 近1月${item.syl_1m}%|近3月${item.syl_3m}%|近半年${item.syl_6m}%|近1年${item.syl_1y}%|成立来${item.syl_total}%\n`;
        reporttxt += `  - 近1月${item.syl_1m}%|3月${item.syl_3m}%|1年${item.syl_1y}%\n`;
        reporttxt += `  - 排名${item.rateInSimilarPersent}/100\n\n`;
        console.log( `${item.fundCode}:${new Date(item.nowDate).getMonth() + 1}月${new Date(item.nowDate).getDate()}日:${item.nowNetWorthTrend}`)

    });
    //reporttxt += `*持仓收益根据当前净值与持仓当日净值计算而成，未考虑持仓成本（如手续费）。`;
    if(true){console.log(reporttxt)};
    return reporttxt;
}


function main() {
    // 解析关注基金列表
    readWatchlistTextFile();
    if (watchlist.length == 0) {
        console.error('未解析出要关注的基金清单，程序结束。');
        return;
    }

    //生成待查询的基金列表
    let fundList = [...new Set(watchlist.map(item => item.fundCode))];
    if (debugMode) { console.log("生成待查询的基金列表:", fundList); }

    //循环到天天基金网查询基金最新净值
    //主流程：顺序遍历 + 重试 + 最后打印“完成”
    (async () => {
        for (const code of fundList) {
            //加载并解析数据
            try {
                const txt = await loadFundData(code);
                //解析天天基金数据内容
                let fund ={};
                fund.fundCode=txt.match(/var\s*fS_code\s*=\s*"(.*?)";/)[1];//基金代码
                fund.name=txt.match(/var\s*fS_name\s*=\s*"(.*?)";/)[1];//基金名
                let rateInSimilarPersentMatch = txt.match(/var\s*Data_rateInSimilarPersent\s*=\s*(\[.*?\]);/s);
                let rateInSimilarPersent = rateInSimilarPersentMatch ? JSON.parse(rateInSimilarPersentMatch[1]) : [];//同类排名百分比数组
                fund.rateInSimilarPersent =rateInSimilarPersent[rateInSimilarPersent.length-1][1];
                let syl_1yMatch = txt.match(/var\s*syl_1n\s*=\s*"(.*?)";/);
                fund.syl_1y = syl_1yMatch ? parseFloat(syl_1yMatch[1]) : 0;//近1年收益
                let syl_6mMatch = txt.match(/var\s*syl_6y\s*=\s*"(.*?)";/);
                fund.syl_6m = syl_6mMatch ? parseFloat(syl_6mMatch[1]) : 0;//近半年收益
                let syl_3mMatch = txt.match(/var\s*syl_3y\s*=\s*"(.*?)";/);
                fund.syl_3m = syl_3mMatch ? parseFloat(syl_3mMatch[1]) : 0;//近3个月收益
                let syl_1mMatch = txt.match(/var\s*syl_1y\s*=\s*"(.*?)";/);
                fund.syl_1m = syl_1mMatch ? parseFloat(syl_1mMatch[1]) : 0;//近1个月收益率
                //累计净值
                let data_ACWorthTrendMatch = txt.match(/var\s*Data_ACWorthTrend\s*=\s*(\[.*?\]);/s);
                let data_ACWorthTrend = data_ACWorthTrendMatch ? JSON.parse(data_ACWorthTrendMatch[1]) : [];//基金累计净值数组
                fund.nowDate = formatDate(data_ACWorthTrend[data_ACWorthTrend.length - 1][0]);//最新净值日
                fund.nowACWorthTrend = parseFloat(data_ACWorthTrend[data_ACWorthTrend.length - 1][1]);//最新净值
                //单位净值
                let data_netWorthTrendMatch = txt.match(/var\s*Data_netWorthTrend\s*=\s*(\[.*?\]);/s);
                let data_netWorthTrend = data_netWorthTrendMatch ? JSON.parse(data_netWorthTrendMatch[1]) : [];//基金单位净值数组
                fund.nowNetWorthTrend = parseFloat(data_netWorthTrend[data_netWorthTrend.length - 1].y);//最新单位净值

                fundInfoList.push(fund);
                if(debugMode){console.log(`[${code}] 解析成功:`,fund);}
            } catch (e) {
                console.error(`[${code}]解析失败：${e.message}`);
            }
            // 在每次加载后暂停 2 秒
            await delay(2000);
        }

        //将基金数据匹配的关注列表
        if(fundInfoList.length==0 ||watchlist.length==0)
        {
            console.error(`关注清单数据匹配失败：关注清单数${watchlist.length}，基金信息列表数${fundInfoList.length}。`);
            return;
        }
        mergeByFundCode(fundInfoList, watchlist);

        //按年化收益对watchlist排序，NaN排最后
        watchlist.sort((a, b) => {
            const aa = a.annualizedReturn;
            const bb = b.annualizedReturn;

            if (Number.isNaN(aa) && Number.isNaN(bb)) return 0; // 都是 NaN，保持原序
            if (Number.isNaN(aa)) return 1;   // aa 是 NaN，排后
            if (Number.isNaN(bb)) return -1;  // bb 是 NaN，排前
            return bb - aa;                   // 正常降序
            });


        //输出关注列表的数据
        const msg =toNtfyMsg();
        sendNtfyMessage('hotine',msg, null,4,['基金日报','hotine']);


        if (debugMode) { console.log("天天基金数据解析完成"); }
    })();

}

// 运行主函数
main();