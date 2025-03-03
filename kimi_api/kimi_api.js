const axios = require('axios');

// 替换为你的refresh_token，获取方法见GitHub页面说明
const REFRESH_TOKEN = "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1c2VyLWNlbnRlciIsImV4cCI6MTc0MjcxNzQ5MCwiaWF0IjoxNzM0OTQxNDkwLCJqdGkiOiJjdGtobWNtMjlvazA3NDBsZWRzMCIsInR5cCI6InJlZnJlc2giLCJhcHBfaWQiOiJraW1pIiwic3ViIjoiY21xaTF0MDNyMDdjanNsazV2NzAiLCJzcGFjZV9pZCI6ImNtcWkxdDAzcjA3Y2pzbGs1djZnIiwiYWJzdHJhY3RfdXNlcl9pZCI6ImNtcWkxdDAzcjA3Y2pzbGs1djYwIiwicm9sZXMiOlsidmlkZW9fZ2VuX2FjY2VzcyJdfQ._jyGMQp1WrUIQSxYIFF-6DmL9dGhIm_Af3dqep_mxYA0rqfLokCJ_F9-3Ez7I7gnJ47ff-BEdT9c22gDYSjQbg";
const API_URL = "https://kimi.hotine.wang/v1/chat/completions"; // 如果是本地部署，使用localhost:8000；如果是远程部署，替换为实际的API地址
var CONVERSATION_ID = "none";//会话ID，开启新会话为none

/**
 * 
 * @param {string} content 会话正文
 * @param {string} conversation_id 会话ID，可实现多轮上下文会话
 * @returns Object,id属性为会话id，msg属性为AI答复内容
 */
async function askAI(content, conversation_id = "none") {
  try {
    // 请求头
    const headers = {
      "Authorization": `Bearer ${REFRESH_TOKEN}`,
      "Content-Type": "application/json"
    };

    // 请求体
    const requestBody = {
      model: "kimi", // 使用默认模型
      conversation_id: conversation_id, // 如果是第一轮对话，不传conversation_id
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      use_search: true, // 根据需求开启联网搜索
      stream: false // 不使用流式输出
    };

    // 发送POST请求
    const response = await axios.post(API_URL, requestBody, { headers });

    // 提取响应中的输出文本
    console.log("API响应：");
    console.log(response.data);
    //console.log(response.data.choices[0].message);
    //AI回答正文
    let outputText = response.data.choices[0].message.content;
    //移除引用
    if(outputText.split("\n搜索结果来自：\n")[0]){
      outputText=outputText.split("\n搜索结果来自：\n")[0];
    }

    return {
      id: response.data.id,
      msg: outputText
    };
  } catch (error) {
    console.error("POST到API时发生错误:", error.message);
    throw error; // 抛出错误以便调用者处理
  }
}




// 示例调用
(async () => {
  try {
    const result = await askAI("分析一下当前国内黄金Au999价格，近期金价走势。预测一下后续黄金价格是涨还是跌。给出投资建议。（金价全部使用人民币元/克计价）");
    let msg = result.msg;
    CONVERSATION_ID = result.id;
    console.log(`AI回答: ${msg}\nc_id:${CONVERSATION_ID}`);
  } catch (error) {
    console.error("Error in askAI:", error);
  }
})();
