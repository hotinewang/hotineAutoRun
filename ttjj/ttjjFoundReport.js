/**
 * 天天基金网指定基金查询
 * bug 读取配置文件中的日期，可能有1天偏差
 * bug 读取的js文件中的日期，可能有1天偏差
 * 
*/
const axios = require('axios');
const { info } = require('console');
const fs = require('fs');
//用户基金名单的文件
const foundListFilePath = 'ttjjFoundList.txt';
//时间偏移量，用于修复Unix时间戳数据中UTC标准时间和东8区时间的偏差
const dataOffset =86400000;

/**
 * 读取用户配置文件，并生成一个包含基金代码和基金确认日的二维数组(如果基金日期不存在或不正确，则解析的日期值会为：NaN)
 */
function readFoundListFile(filePath) {
    console.log(`readFoundListFile读取用户配置文件${foundListFilePath}`);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split('\n');
        let resultArray = lines.map(line => {
            const [fundCode, dateString] = line.split(',');

            // 将时间字符串转换为Date对象，并指定时区为东八区
            let date = new Date(dateString + "T00:00:00+08:00");
            // 获取毫秒级别的Unix时间戳
            let formattedDate = date.getTime() + dataOffset;
            // 如果配置文件没有填写时间或者解析错误，则把时间设置为0
            if (isNaN(formattedDate)) {
                formattedDate = 0;
            }
            console.log(`读取到：基金代码${fundCode.trim()},确认日 ${new Date(formattedDate).toLocaleDateString()}`);

            return [fundCode.trim(), formattedDate];
        });
        //console.log('读取用户基金名单文件' + foundListFilePath + '解析结果:\n', resultArray);
        //剔除空行
        resultArray = resultArray.filter(row => row[0] !== null && row[0] !== undefined);
        return resultArray;
    } catch (err) {
        console.error('读取用户基金名单文件' + foundListFilePath + '异常:\n', err);
        return [];
    }
}



/**
 * 
 * @param {*} url 包含基金数据的url，例如：http://fund.eastmoney.com/pingzhongdata/012967.js
 * @param {*} confirmDate 基金确认日，格式例如：1629907200000
 * @param {*} units 基金持有份额（没用）
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
        info.nowDate = "";
        //当前累计净值
        info.nowACWorthTrend = 0
        //成立日
        info.startDate = "";
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

        // 解析加载的JS文件
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

        //计算成立以来收益率，获取确认时净值、最新净值、最新净值日期
        if (info.Data_ACWorthTrend && info.Data_ACWorthTrend.length > 0) {
            //最新净值日期
            info.nowDate = info.Data_ACWorthTrend[info.Data_ACWorthTrend.length - 1][0]+ dataOffset;//最新净值日
            //最新净值
            info.nowACWorthTrend = info.Data_ACWorthTrend[info.Data_ACWorthTrend.length - 1][1];

            //最早净值日（成立日吗？？？）
            info.startDate = info.Data_ACWorthTrend[0][0]+ dataOffset;
            //成立日（最早那一天）净值
            info.startACWorthTrend = info.Data_ACWorthTrend[0][1];

            //累计收益率
            info.syl_total = ((info.nowACWorthTrend - info.startACWorthTrend) / info.startACWorthTrend) * 100;
            info.syl_total = Math.round(info.syl_total * 100) / 100;

            //判断确认日的日期是否符合要求,如果符合要求，则计算持有份额的收益里(比成立日早一天的视为笔误，不报错)
            if (info.confirmDate < info.startDate-dataOffset ||info.confirmDate > info.nowDate) {
                console.log(`【提示】基金${info.fS_name}${info.fS_code}的确认日期${new Date(info.confirmDate).toLocaleDateString()}有误：不在成立日${new Date(info.startDate).toLocaleDateString()}和最近净值日${new Date(info.nowDate).toLocaleDateString()}之间。`);
                info.confirmDate=0;
                info.syl_cfm=-9999;
            }else{
                //查找"确认日"的累计净值，并计算收益
                //二分查找第一个大于等于“确认日”的元素
                let low = 0;
                let high = info.Data_ACWorthTrend.length - 1;

                while (low <= high) {
                    const mid = Math.floor((low + high) / 2);
                    if (info.Data_ACWorthTrend[mid][0]+ dataOffset < info.confirmDate) {
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }

                // 检查是否存在大于等于“确认日”的元素
                if (low < info.Data_ACWorthTrend.length) {
                    if(info.confirmDate!=info.Data_ACWorthTrend[low][0]+ dataOffset)
                    {
                        console.log(`【提示】基金${info.fS_name}${info.fS_code}的确认日${new Date(info.confirmDate).toLocaleDateString()}当天无净值数据，确认日将修改到最近日期${new Date(info.Data_ACWorthTrend[low][0]+ dataOffset).toLocaleDateString()}`);
                        info.confirmDate=info.Data_ACWorthTrend[low][0]+ dataOffset;
                    }
                    info.confirmACWorthTrend = info.Data_ACWorthTrend[low][1];  // 找到了，返回对应的值
                } else {
                    info.confirmACWorthTrend = 0; // 没有找到，返回0
                }

                //如果找到了确认日对应的净值，则计算持有收益率
                if (info.confirmACWorthTrend != 0) {
                    info.syl_cfm = ((info.nowACWorthTrend - info.confirmACWorthTrend) / info.confirmACWorthTrend) * 100;
                    info.syl_cfm = Math.round(info.syl_cfm * 100) / 100;
                    if (info.syl_cfm === Infinity) info.syl_cfm = 0;
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
        console.log(`成立日: ${new Date(info.startDate).toLocaleDateString()},净值：${info.startACWorthTrend}`);
        console.log(`基金确认日: ${new Date(info.confirmDate).toLocaleDateString()}，净值：${info.confirmACWorthTrend}`);
        console.log(`最新净值日: ${new Date(info.nowDate).toLocaleDateString()},净值：${info.nowACWorthTrend}`);
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
        console.error('解析基金数据时出错:', /*error*/"这里被注释掉了");
        return null;
    }
}

async function main() {
    // 获取基金名单
    const foundList = readFoundListFile(foundListFilePath);
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
    let reporttxt = `基金日报（${new Date().getMonth() + 1}月${new Date().getDate()}日）\n`;
    //打印基金信息
    foundInfoList.forEach(item => {
        reporttxt += `${item.fS_name}(${item.fS_code})-${new Date(item.nowDate).getMonth() + 1}月${new Date(item.nowDate).getDate()}日\n`;
        if (item.confirmDate != 0) {
            reporttxt += `持仓收益率${item.syl_cfm}%(${new Date(item.confirmDate).getFullYear()}年${new Date(item.confirmDate).getMonth() + 1}月${new Date(item.confirmDate).getDate()}日以来)\n`;
        }
        reporttxt += `排名${item.rank_total}%|近1月${item.syl_1m}%|近3月${item.syl_3m}%|近半年${item.syl_6m}%|近1年${item.syl_1y}%|成立来${item.syl_total}%\n\n`;
    });

    console.log("\n------------\n"+reporttxt+"------------\n");
}

// 运行主函数
main();
