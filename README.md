# hotineAutoRun
个人的自动化脚本集合
## docker_controller 网页应用 v20260428
一个简化版的docker镜像管理程序（基于nodejs），可以方便的查看全部docker镜像的内存和cpu占用，以及方便的控制启停或重启。 
A simplified Docker image management program that allows you to easily view the memory and CPU usage of all Docker images, as well as start, stop and restart images with one-click operations.

## Trip Plan 途程规划 v20260428
这是一个基于高德地图的网页应用，可以创建旅程、添加地图标记、分享给好友。
部署：需要修改网页html文件中的高德地图API KEY。服务端可以用pm2拉起服务端代码。
使用：
- 地图右上方的日程+-按钮，可以切换日程代码（默认是0，显示全部）
- 在地图上点击可以放置地点标记或者编辑地点标记。
- 如果在地点名称中输入emoji，则第一个emoji会作为这个地点的图标

## ttfound 基金持仓收益日报 v20260428
基于天天基金网的nodejs脚本，可以每日跑批当前持仓基金的累计收益和年化收益。可直接在青龙面板使用，也可以单独运行。通过ntfy发送通知

## net_traffic_monitor VPS网络流量监控程序 V20260325
用于监控VPS的每日网络流量使用情况，超过阈值时，通过ntfy发送警报通知。
每日日终发送统计信息。

## zerotire_connect_check ZeroTier 网络监控脚本 (Node.js 版本) V20260313
测试多个（2个以上）Zerotier组网设备间的连通性，如果不连通，则等待5分复测 → 仍失败则重启zerotire容器 → ntfy 通知 → 1分钟后最终检测 → ntfy 通知