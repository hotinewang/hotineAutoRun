const fs = require('fs');
const path = require('path');

//要监控的网络接口名,需要根据实际情况修改
const interfaceName = 'eth0';
//每月重置流量的日期
const resetDay = 28;
// 获取脚本所在目录
const scriptDir = path.dirname(__filename);
// 网络接口数据集
var interfaceList = [];




/**
 * 流量换算，把Bytes换算成G，保留两位小数
 * @param {数值} bytes 
 * @returns 数值
 */
function calculateTraffic(bytes) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}


/**
 * 分析各网络接口的上下行流量
 * @returns 返回一个数组，包含每个网络接口的名称，接收的字节数，发送的字节数。类似于[['网络接口1',1029339,3343434],['网络接口2'，3454223,3553211]]
 */
function readNetworkStats() {
    const statsPath = '/proc/net/dev';
    //读取网络接口信息文件
    const stats = fs.readFileSync(statsPath, 'utf-8');
    //按行进行分割
    const lines = stats.split('\n');
    //数组，包含每个网络接口的名称，接收的字节数，发送的字节数。
    const result = [];
    //从第三行开始分析（因为前两行是标题）
    for (let i = 2; i < lines.length; i++) {
        //移除字符串最开头的空白字符
        lines[i] = lines[i].trimStart()
        //按照一个或多个空白字符进行分割，并将分割后的结果存储在数组 parts 中
        const parts = lines[i].split(/\s+/);
        if (parts.length > 1) {
            const interfaceName = parts[0].replace(':', '');
            //console.log(`网络接口${interfaceName}下行${parts[1]}上行${parts[9]}`)
            result.push([interfaceName, parts[1], parts[9]])
        }
    }
    return result;
}


/**
 * 统计流量使用情况
 * @param {*} interface 网络接口名称
 */
function calcTraffic(interface) {
    //查找名称为interface参数指定的那个网口
    let itf = null;
    interfaceList.forEach((item) => {
        if (item[0] == interface) itf = item;
    });
    console.log(`指定的${interface}网络接口信息：${itf}`);
}

// 获取每月 28 日起的累计流量
function getMonthlyTraffic() {
    const monthlyStatsPath = path.join(scriptDir, 'monthly_traffic.json');
    let monthlyStats = {};
    if (fs.existsSync(monthlyStatsPath)) {
        monthlyStats = JSON.parse(fs.readFileSync(monthlyStatsPath, 'utf-8'));
    } else {
        monthlyStats = {
            start: new Date(new Date().getFullYear(), new Date().getMonth(), 28).toISOString(),
            receiveBytes: 0,
            transmitBytes: 0
        };
        fs.writeFileSync(monthlyStatsPath, JSON.stringify(monthlyStats, null, 2));
    }

    const currentStats = readNetworkStats();
    for (const [name, iface] of Object.entries(currentStats)) {
        monthlyStats.receiveBytes += iface.receiveBytes;
        monthlyStats.transmitBytes += iface.transmitBytes;
    }

    fs.writeFileSync(monthlyStatsPath, JSON.stringify(monthlyStats, null, 2));

    return {
        receive: calculateTraffic(monthlyStats.receiveBytes),
        transmit: calculateTraffic(monthlyStats.transmitBytes)
    };
}

// 获取每天的累计流量
function getDailyTraffic() {
    const dailyStatsPath = path.join(scriptDir, 'daily_traffic.json');
    let dailyStats = {};
    if (fs.existsSync(dailyStatsPath)) {
        dailyStats = JSON.parse(fs.readFileSync(dailyStatsPath, 'utf-8'));
    } else {
        dailyStats = {
            date: new Date().toISOString().split('T')[0],
            receiveBytes: 0,
            transmitBytes: 0
        };
        fs.writeFileSync(dailyStatsPath, JSON.stringify(dailyStats, null, 2));
    }

    const currentStats = readNetworkStats();
    for (const [name, iface] of Object.entries(currentStats)) {
        dailyStats.receiveBytes += iface.receiveBytes;
        dailyStats.transmitBytes += iface.transmitBytes;
    }

    fs.writeFileSync(dailyStatsPath, JSON.stringify(dailyStats, null, 2));

    return {
        receive: calculateTraffic(dailyStats.receiveBytes),
        transmit: calculateTraffic(dailyStats.transmitBytes)
    };
}


interfaceList = readNetworkStats();
calcTraffic(interfaceName);