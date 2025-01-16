/**
 * 天天基金网指定基金查询，并生成日报
 * 可对指定基金进行持仓收益和年化收益的计算
 * 并推送nfty消息通知
*/
const axios = require('axios');

/**用户基金列表的内容
 * 修改此处，以便本脚本分析指定的基金产品。
 * 格式为： * 基金代码,确认日期（可选）
 * 每行只写一个基金代码和确认日期。中间有英文逗号隔开
 * 确认日期可以为空，为空时不分析此基金的持仓情况
 * 确认日期必须是yyyy-mm-dd的格式
 */
const foundListText = `
006435,2022-08-09
009909,2020-11-23
`;
/*
006297
003025,2021-06-18
006392,2021-12-28
006435,2022-08-09
009909,2020-11-23
010027,2020-12-16
010277,2021-01-15
010534,2021-01-27
010659,2020-12-17
011099,2021-01-13
011752,2021-04-27
012967,2021-08-26
013323,2022-01-18
014188,2021-12-14
014809,2022-01-25
015769,2022-06-28
*/

//天天基金网中的时间戳使用的是UTC标准时间
//时间偏移量，天天基金网中所有的时间戳都是UTC时间，比东八区时间要晚（小）28800000毫秒
//应该在所有的时间输出显示中使用，以获取正确的时间。(在时间计算、对比时，不需要用)
//例如：new Date(1629907200000+dataOffset)
const dataOffset = 28800000;

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




/**
 * 解析基金列表文本，并生成一个包含基金代码和基金确认日的二维数组(如果基金日期不存在或不正确，则解析的日期值会为：NaN)
 */
function readFoundListFile(text) {
    console.log(`readFoundListFile基金列表文本`);
    try {
        const lines = text.split('\n');
        let resultArray = lines.map(line => {
            const [fundCode, dateString] = line.split(',');

            // 将时间字符串转换为Date对象
            let date = new Date(dateString + "T00:00:00+08:00");
            // 获取毫秒级别的Unix时间戳
            let formattedDate = date.getTime();
            // 如果配置文件没有填写时间或者解析错误，则把时间设置为0
            if (isNaN(formattedDate)) {
                formattedDate = 0;
            }
            //console.log(`读取到：基金代码${fundCode.trim()},确认日 ${new Date(formattedDate+dataOffset).toDateString()}`);

            return [fundCode.trim(), formattedDate];
        });
        //console.log('解析基金列表文本结果:\n', resultArray);
        //剔除空行
        resultArray = resultArray.filter(row => row[0] !== null && row[0] !== undefined);
        return resultArray;
    } catch (err) {
        console.error('解析基金列表文本异常:\n', err);
        return [];
    }
}



/**
 * 读取并分析天天基金网的某基金信息。
 * @param {*} url 包含基金数据的url，例如：http://fund.eastmoney.com/pingzhongdata/012967.js
 * @param {*} confirmDate 基金确认日，格式例如：1629907200000
 * @param {*} units 基金持有份额（预留，目前没用）
 * @returns 
 */
async function fetchFoundData(url, confirmDate = null, units = null) {
    //基金信息Object
    let info = null;
    try {
        //读取基金信息url的数据并分析其中的txt数据
        const response = await axios.get(url);
        const dataText = response.data;

        info = {}
        //基金持有份额（没用）
        info.units = units ? units : 0;
        //最新净值的日期
        info.nowDate = 0;
        //当前累计净值
        info.nowACWorthTrend = 0
        //成立日
        info.startDate = 0;
        //成立日净值
        info.startACWorthTrend = 0
        //确认日
        info.confirmDate = confirmDate ? confirmDate : 0;
        //确认时累计净值
        info.confirmACWorthTrend = 0
        //成立以来收益率
        info.syl_total = 0
        //持有收益率
        info.syl_cfm = 0
        //持有收益率-年化
        info.syl_cfm_y = 0

        // 解析加载的JS文件。这段代码莫名其妙的，明明可以直接给info.xx赋值
        const extractVariables = (script) => {
            let fS_nameMatch = script.match(/var\s*fS_name\s*=\s*"(.*?)";/);//基金名
            let fS_codeMatch = script.match(/var\s*fS_code\s*=\s*"(.*?)";/);//基金代码
            let Data_ACWorthTrendMatch = script.match(/var\s*Data_ACWorthTrend\s*=\s*(\[.*?\]);/s);
            let rateInSimilarPersentMatch = script.match(/var\s*Data_rateInSimilarPersent\s*=\s*(\[.*?\]);/s);//同类排名百分比
            let syl_1yMatch = script.match(/var\s*syl_1n\s*=\s*"(.*?)";/);//近1年收益
            let syl_6mMatch = script.match(/var\s*syl_6y\s*=\s*"(.*?)";/);//近半年收益
            let syl_3mMatch = script.match(/var\s*syl_3y\s*=\s*"(.*?)";/);//近3个月收益
            let syl_1mMatch = script.match(/var\s*syl_1y\s*=\s*"(.*?)";/);//近1个月收益率

            let fS_name = fS_nameMatch ? fS_nameMatch[1] : "-";//基金名
            let fS_code = fS_codeMatch ? fS_codeMatch[1] : "-";//基金代码
            let syl_1y = syl_1yMatch ? parseFloat(syl_1yMatch[1]) : 0;//近1年收益
            let syl_6m = syl_6mMatch ? parseFloat(syl_6mMatch[1]) : 0;//近半年收益
            let syl_3m = syl_3mMatch ? parseFloat(syl_3mMatch[1]) : 0;//近3个月收益
            let syl_1m = syl_1mMatch ? parseFloat(syl_1mMatch[1]) : 0;//近1个月收益率

            let Data_ACWorthTrend = Data_ACWorthTrendMatch ? JSON.parse(Data_ACWorthTrendMatch[1]) : [];//基金累计净值数组
            let rateInSimilarPersent = rateInSimilarPersentMatch ? JSON.parse(rateInSimilarPersentMatch[1]) : [];//同类排名百分比

            return { fS_name, fS_code, Data_ACWorthTrend, rateInSimilarPersent, syl_1y, syl_6m, syl_3m, syl_1m };
        };

        Object.assign(info, extractVariables(dataText));

        //处理基金累计净值数组Data_ACWorthTrend，计算成立以来收益率，获取确认时净值、最新净值、最新净值日期
        if (info.Data_ACWorthTrend && info.Data_ACWorthTrend.length > 0) {
            //最新净值日期
            info.nowDate = info.Data_ACWorthTrend[info.Data_ACWorthTrend.length - 1][0];//最新净值日
            //最新净值
            info.nowACWorthTrend = info.Data_ACWorthTrend[info.Data_ACWorthTrend.length - 1][1];

            //最早净值日（成立日吗？？？）
            info.startDate = info.Data_ACWorthTrend[0][0];
            //成立日（最早那一天）净值
            info.startACWorthTrend = info.Data_ACWorthTrend[0][1];

            //累计收益率
            info.syl_total = ((info.nowACWorthTrend - info.startACWorthTrend) / info.startACWorthTrend) * 100;
            //保留两位小数
            info.syl_total = Math.round(info.syl_total * 100) / 100;

            //判断确认日的日期是否符合要求(不为0且不晚于最近净值日),如果符合要求,则计算持有份额的收益里
            if (info.confirmDate == 0 || info.confirmDate > info.nowDate) {
                console.log(`【提示】基金${info.fS_name} ${info.fS_code} 的确认日期${new Date(info.confirmDate + dataOffset).toDateString()}为0或大于最近净值日${new Date(info.nowDate + dataOffset).toDateString()}，将视同无确认日期，未持有。`);
                info.confirmDate = 0;
                info.syl_cfm = -9999;
            } else {
                //查找"确认日"的累计净值，并计算收益
                //二分查找第一个大于等于“确认日”的元素
                let low = 0;
                let high = info.Data_ACWorthTrend.length - 1;

                while (low <= high) {
                    const mid = Math.floor((low + high) / 2);
                    if (info.Data_ACWorthTrend[mid][0] < info.confirmDate) {
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }

                // 检查是否存在大于等于“确认日”的元素
                if (low < info.Data_ACWorthTrend.length) {
                    if (info.confirmDate != info.Data_ACWorthTrend[low][0]) {
                        console.log(`【提示】基金${info.fS_name} ${info.fS_code} 的确认日${new Date(info.confirmDate + dataOffset)}当天无净值数据，确认日将修改到最近日期${new Date(info.Data_ACWorthTrend[low][0] + dataOffset)}`);
                        info.confirmDate = info.Data_ACWorthTrend[low][0];
                    }
                    info.confirmACWorthTrend = info.Data_ACWorthTrend[low][1];  // 找到了，返回对应的值
                } else {
                    info.confirmACWorthTrend = 0; // 没有找到，返回0
                }

                //如果找到了确认日对应的净值，则计算持有收益率
                if (info.confirmACWorthTrend != 0) {
                    info.syl_cfm = ((info.nowACWorthTrend - info.confirmACWorthTrend) / info.confirmACWorthTrend) * 100;
                    info.syl_cfm_y = info.syl_cfm / ((info.confirmACWorthTrend - info.confirmDate) / 86400000) * 365;
                    info.syl_cfm = Math.round(info.syl_cfm * 100) / 100;
                    info.syl_cfm_y = Math.round(info.syl_cfm_y * 100) / 100;
                    if (info.syl_cfm === Infinity) info.syl_cfm = 0;
                    if (info.syl_cfm_y === Infinity) info.syl_cfm_y = 0;
                    //console.log(`基金${info.fS_code}的确认日${info.confirmDate}净值${info.confirmACWorthTrend}--最近日${info.nowDate}净值${info.nowACWorthTrend}`);
                }

            }
        } else {
            console.error('基金累计净值数据Data_acWorthTrend不可用或为空');
        }

        //当前同类排名百分比
        info.rank_total = 0;
        if (info.rateInSimilarPersent && info.rateInSimilarPersent.length > 0) {
            //获取百分比
            info.rank_total = info.rateInSimilarPersent[info.rateInSimilarPersent.length - 1][1];
        } else {
            console.error('基金百分比排名数据Data_ACWorthTrend不可用或为空');
        }

        //使用示例:
        /*
        console.log(`基金名称: ${info.fS_name}--------------------------`);
        console.log(`基金代码: ${info.fS_code}`);
        console.log(`成立日: ${new Date(info.startDate+dataOffset).toDateString()},净值：${info.startACWorthTrend}`);
        console.log(`基金确认日: ${new Date(info.confirmDate+dataOffset).toDateString()}，净值：${info.confirmACWorthTrend}`);
        console.log(`最新净值日: ${new Date(info.nowDate+dataOffset).toDateString()},净值：${info.nowACWorthTrend}`);
        console.log(`成立以来收益: ${info.syl_total}%`);
        console.log(`近1年收益: ${info.syl_1y}%`);
        console.log(`近6月收益: ${info.syl_6m}%`);
        console.log(`近3月收益: ${info.syl_3m}%`);
        console.log(`近1月收益: ${info.syl_1m}%`);
        console.log(`持仓收益: ${info.syl_cfm}%`);
        console.log(`百分比排名: ${info.rank_total}%`);
        */
        return info;

    } catch (error) {
        console.error('解析基金数据时出错:', /*error*/"这里被注释掉了，可能是基金代码不存在或者foundListText字符串中有空白行。");
        return null;
    }
}

async function main() {
    // 获取基金名单
    const foundList = readFoundListFile(foundListText);

    // 定义基金信息数组
    let foundInfoList = [];
    // 创建一个数组，包含所有异步调用的Promise
    const promises = foundList.map(item => {
        const url = `http://fund.eastmoney.com/pingzhongdata/${item[0]}.js`;
        return fetchFoundData(url, item[1]);
    });

    try {
        // 使用Promise.all等待所有Promise完成
        foundInfoList = await Promise.all(promises);
        // 删除null元素
        foundInfoList = foundInfoList.filter(item => item !== null);
        console.log('异步操作全部遍历完毕');
    } catch (error) {
        // 如果任何一个Promise失败，会进入这里
        console.error('异步操作中出现错误:', error);
    }
    // 对基金数组进行排序：syl_cfm降序排序，rank_total降序排序
    if (foundInfoList.length > 0) {
        console.log("对信息进行排序...")
        foundInfoList.sort((a, b) => {
            // 首先按照syl_cfm（持仓收益）降序排序
            if (b.syl_cfm - a.syl_cfm !== 0) {
                return b.syl_cfm - a.syl_cfm;
            }
            // 如果syl_cfm相同，则按照rank_total降序排序
            return b.rank_total - a.rank_total;
        });
    }

    //基金报告文本
    console.log("开始打印基金日报...")
    //昨天的时间戳
    const dateYesterday = new Date(new Date().setDate(new Date().getDate() - 1)).setHours(0, 0, 0, 0);
    let reporttxt = `📰基金日报（${new Date().getMonth() + 1}月${new Date().getDate()}日）📰\n\n`;
    //打印基金信息
    foundInfoList.forEach(item => {
        ////如果有持仓日，则根据持仓收益显示对应的图标
        if (item.confirmDate != 0) {
            if (item.syl_cfm > 0) {
                reporttxt += "💰";
            }
            else {
                reporttxt += "💸";
            }
        }
        else {
            reporttxt += "📊";
        }
        reporttxt += `${item.fS_name} ${item.fS_code} `;
        //最新净值日如果不是昨天的，则显示最新净值日期，否则隐藏
        if (item.nowDate <= dateYesterday) {
            reporttxt += `${new Date(item.nowDate + dataOffset).getMonth() + 1}月${new Date(item.nowDate + dataOffset).getDate()}日\n`;
        } else {
            reporttxt += `\n`;
        }
        //如果有持仓日，则显示持仓收益
        if (item.confirmDate != 0) {
            reporttxt += `  - 持仓收益${item.syl_cfm}% 年化${item.syl_cfm_y}%\n`;
            reporttxt += `  - 持仓日${new Date(item.confirmDate + dataOffset).getFullYear()}年${new Date(item.confirmDate + dataOffset).getMonth() + 1}月${new Date(item.confirmDate + dataOffset).getDate()}日\n`
        }
        reporttxt += `  - 近1月${item.syl_1m}%|近3月${item.syl_3m}%|近半年${item.syl_6m}%|近1年${item.syl_1y}%|成立来${item.syl_total}%\n`;
        //排名${item.rank_total}%
        reporttxt += `  - 排名${Math.round(100 - item.rank_total)}/100\n\n`;

    });
    reporttxt += `*持仓收益根据当前净值与持仓当日净值计算而成，未考虑持仓成本（如手续费）。`;

    console.log("\n------------\n" + reporttxt + "------------\n");
    // 发送消息
    sendNtfyMessage('hotine', reporttxt, null, 4, ['基金日报', 'hotine']);
}

// 运行主函数
main();
