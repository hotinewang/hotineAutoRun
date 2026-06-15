const { sendNotify, NOTIFY_CONFIG } = require('./sendNotify.js');

// 1. 运行时动态修改配置（如果需要的话）
NOTIFY_CONFIG.ntfy.topic = 'hotine';
NOTIFY_CONFIG.gotify.token = 'Aw_fbAwyOvGJOt_';

// 2. 调用函数发送
sendNotify({
    title: '测试消息',
    message: '测试的内容',
    priority: 3,           // 会自动适配各个渠道的优先级
    tags: ['warning', 'computer'] // ntfy 专属标签，gotify 会自动忽略
});