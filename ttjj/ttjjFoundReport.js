/**
 * 天天基金网指定基金查询
*/
const axios = require('axios');
const { info } = require('console');
const fs = require('fs');

const foundListFilePath = 'ttjjFoundList.txt';

function readAndProcessFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split('\n');
        const resultArray = lines.map(line => {
            const [fundCode, dateString] = line.split(',');

            var date = new Date(dateString + "T00:00:00+08:00"); // 将时间字符串转换为Date对象，并指定时区为东八区

            // 获取毫秒级别的Unix时间戳
            const formattedDate = date.getTime() + 86400000;
            return [fundCode.trim(), formattedDate];
        });
        console.error('读取文件' + foundListFilePath + '解析结果:\n', resultArray);
        return resultArray;
    } catch (err) {
        console.error('读取文件' + foundListFilePath + '异常:\n', err);
        return [];
    }
}

// Example usage:
// const result = readAndProcessFile(foundListFilePath);



async function fetchFoundData(url, confirmDate = null, units) {
    let info = null;
    try {
        const response = await axios.get(url);
        const dataText = response.data;

        info = {}
        info.units = units ? units : 0;

        info.nowDate = "-"; //最新净值数据的日期
        info.startDate = "-"; //成立日
        info.confirmDate = confirmDate;//持有的确认日
        info.confirmDate = confirmDate ? confirmDate : "-";//持仓确认日。可能有BUG，万一第一条数据不是基金成立日呢？-------------------------------------------------------------

        info.syl_total = "-"; //成立以来收益率
        info.syl_cfm = "-";//持有收益率

        info.startACWorthTrend = "-";//成立日净值
        info.confirmACWorthTrend = "-";//确认时累计净值
        info.nowACWorthTrend = "-";//当前累计净值

        // 解析加载的JS文件
        const extractVariables = (script) => {
            let fS_nameMatch = script.match(/var\s*fS_name\s*=\s*"(.*?)";/);//基金名
            let fS_codeMatch = script.match(/var\s*fS_code\s*=\s*"(.*?)";/);//基金代码
            let Data_ACWorthTrendMatch = script.match(/var\s*Data_ACWorthTrend\s*=\s*(\[.*?\]);/s);//基金累计净值数组
            let rateInSimilarPersentMatch = script.match(/var\s*Data_rateInSimilarPersent\s*=\s*(\[.*?\]);/s);//同类排名百分比
            let syl_1nMatch = script.match(/var\s*syl_1n\s*=\s*"(.*?)";/);//近1年收益
            let syl_6yMatch = script.match(/var\s*syl_6y\s*=\s*"(.*?)";/);//近半年收益
            let syl_3yMatch = script.match(/var\s*syl_3y\s*=\s*"(.*?)";/);//近3个月收益
            let syl_1yMatch = script.match(/var\s*syl_1y\s*=\s*"(.*?)";/);//近1个月收益率

            let fS_name = fS_nameMatch ? fS_nameMatch[1] : "-";
            let fS_code = fS_codeMatch ? fS_codeMatch[1] : "-";
            let syl_1n = syl_1nMatch ? parseFloat(syl_1nMatch[1]) : "-";
            let syl_6y = syl_6yMatch ? parseFloat(syl_6yMatch[1]) : "-";
            let syl_3y = syl_3yMatch ? parseFloat(syl_3yMatch[1]) : "-";
            let syl_1y = syl_1yMatch ? parseFloat(syl_1yMatch[1]) : "-";

            let Data_ACWorthTrend = Data_ACWorthTrendMatch ? JSON.parse(Data_ACWorthTrendMatch[1]) : [];
            let rateInSimilarPersent = rateInSimilarPersentMatch ? JSON.parse(rateInSimilarPersentMatch[1]) : [];

            return { fS_name, fS_code, Data_ACWorthTrend, rateInSimilarPersent, syl_1n, syl_6y, syl_3y, syl_1y };
        };

        Object.assign(info, extractVariables(dataText));

        //计算成立以来收益率，获取确认时净值、最新净值、最新净值日期
        if (info.Data_ACWorthTrend && info.Data_ACWorthTrend.length > 0) {
            //净值日期
            info.nowDate = info.Data_ACWorthTrend[info.Data_ACWorthTrend.length - 1][0];//最新净值日
            info.startDate = info.Data_ACWorthTrend[0][0];//起始日（成立日）


            //获取最新净值，并计算成立以来收益率
            info.startACWorthTrend = info.Data_ACWorthTrend[0][1];
            info.nowACWorthTrend = info.Data_ACWorthTrend[info.Data_ACWorthTrend.length - 1][1];
            info.syl_total = ((info.nowACWorthTrend - info.startACWorthTrend) / info.startACWorthTrend) * 100;
            info.syl_total = Math.round(info.syl_total * 100) / 100;

            //查找"确认日"的累计净值，并计算收益
            //二分查找第一个大于等于“确认日”的元素
            info.syl_cfm = "-"
            if (info.confirmDate != "-") {
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
                    info.confirmACWorthTrend = info.Data_ACWorthTrend[low][1];  // 找到了，返回对应的值
                    //console.log(low+"|||||"+info.confirmACWorthTrend);
                } else {
                    info.confirmACWorthTrend = "-"; // 没有找到，返回undefined
                }

                if (info.confirmACWorthTrend != "-") {
                    info.syl_cfm = ((info.nowACWorthTrend - info.confirmACWorthTrend) / info.confirmACWorthTrend) * 100;
                    info.syl_cfm = Math.round(info.syl_cfm * 100) / 100;
                    if (info.syl_cfm === Infinity) info.syl_cfm = "-";
                }

            }


        } else {
            console.error('基金累计净值数据Data_acWorthTrend不可用或为空');
        }
        //当前同类排名百分比
        info.rank_total = "-";
        if (info.rateInSimilarPersent && info.rateInSimilarPersent.length > 0) {
            //获取百分比
            info.rank_total = info.rateInSimilarPersent[info.rateInSimilarPersent.length - 1][1];
        } else {
            console.error('基金百分比排名数据Data_ACWorthTrend不可用或为空');
        }

        console.log(`基金名称: ${info.fS_name}`);
        console.log(`基金代码: ${info.fS_code}`);
        console.log(`成立日: ${info.startDate},净值：${info.startACWorthTrend}`);
        console.log(`基金确认日: ${info.confirmDate}，净值：${info.confirmACWorthTrend}`);
        console.log(`成立日: ${new Date(info.startDate).toLocaleDateString()},净值：${info.startACWorthTrend}`);
        console.log(`基金确认日: ${new Date(info.confirmDate).toLocaleDateString()}，净值：${info.confirmACWorthTrend}`);
        console.log(`最新净值日: ${new Date(info.nowDate).toLocaleDateString()},净值：${info.nowACWorthTrend}`);
        console.log(`成立以来收益: ${info.syl_total}%`);
        console.log(`近1年收益: ${info.syl_1n}%`);
        console.log(`近6月收益: ${info.syl_6y}%`);
        console.log(`近3月收益: ${info.syl_3y}%`);
        console.log(`近1月收益: ${info.syl_1y}%`);
        console.log(`持仓收益: ${info.syl_cfm}%`);
        console.log(`百分比排名: ${info.rank_total}%`);
        return info;

    } catch (error) {
        console.error('解析基金数据时出错:', error);
        return {};
    }
}

// Example usage
readAndProcessFile(foundListFilePath);
const url = 'http://fund.eastmoney.com/pingzhongdata/012967.js'; // Replace with the actual URL
//const url = './ttjjFoundReport数据示例.js'; // Replace with the actual URL
fetchFoundData(url, 1735747200000);

//基金确认日的净值不对



