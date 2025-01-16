const os = require('os');

function getNetworkTraffic() {
  const networkInterfaces = os.networkInterfaces();
  const networkStats = {};

  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    for (const { address, family, mac, internal, cidr } of interfaces) {
      if (!internal) { // 排除本地回环接口等内部接口
        const stats = os.networkInterfaces()[name][0];
        networkStats[name] = {
          address,
          family,
          mac,
          cidr,
          rxBytes: stats.rxbytes, // 下行流量
          txBytes: stats.txbytes, // 上行流量
        };
      }
    }
  }

  return networkStats;
}

const traffic = getNetworkTraffic();
console.log(traffic);