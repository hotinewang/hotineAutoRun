/**
 * npm install gray-matter
 */
// 常量定义
const OBSIDIAN_PATH = '/home/coder/project/hotineAutoRun/Obs2Hugo/obsidian'; // Obsidian的根目录
const HUGO_PATH = '/home/coder/project/hotineAutoRun/Obs2Hugo/hugo'; // Hugo的根目录
const HUGO_STATIC_PATH = '/static/blog';//static文件夹下附件目录
const HUGO_POSTS_PATH = '/content/posts';//博客文件夹
const HUGO_TAG = 'blog'; // 标记需要转换的文章的标签

// 引入必要的模块
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter'); // 用于解析Markdown文件的元数据

// 记录文件列表数据
let fileListData = [];

/**
 * 扫描Obsidian目录中的全部文件和文件夹，生成一个文件记录列表
 * @param {*} dirPath 
 */
function traverseDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const fileStat = fs.statSync(filePath);
        if (fileStat.isDirectory()) {
            traverseDirectory(filePath);
        } else {
            fileListData.push({
                name: file,
                ext: path.extname(file).toLowerCase(),
                obs_path: filePath,
                hugo_path: ""

            });
            console.log("遍历-", file)
        }
    });
}

// 复制文件到目标路径
function copyFile(oldPath, newPath) {
    // 检查源文件是否存在
    if (!fs.existsSync(oldPath)) {
        console.error(`【E】拷贝文件时，源文件不存在: ${oldPath}`);
        return;
    }

    // 获取目标文件的目录路径
    const newDir = path.dirname(newPath);

    // 检查目标目录是否存在，如果不存在则创建
    if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
        //console.log(`目标目录不存在，已创建: ${newDir}`);
    }

    // 拷贝文件
    fs.copyFile(oldPath, newPath, (err) => {
        if (err) {
            console.error(`【E】拷贝文件时出错: ${err}`);
        } else {
            //console.log(`【i】文件已成功拷贝到: ${newPath}`);
        }
    });
}

/**
 * 修改文章附件连接为HUGO标准链接：![备注]{链接}
 * 同时把连接中的md文件修改为对应的html文件
 * @param {*} match 原始链接内容
 * @param {*} altText 连接中的提示词
 * @param {*} url 连接中的url
 * @returns 新的链接内容
 */
function fixMDContent(match, altText, url) {
    // 如果是本地链接（不是http开头的）
    if (!/^http/.test(url)) {
        //如果没有文件后缀名，则认定为md文件
        if (path.extname(url).toLowerCase() === "") {
            url += '.md';

        }
        //获取文件名和格式
        const filename = path.basename(url);

        let obj = fileListData.find(item => item.name === filename);

        //如果找到了对应文件
        if (obj) {
            //如果附件在文件遍历数组中未登记hugo_path（说明文件未复制到hugo目录）
            if (obj.hugo_path === "") {
                if (path.extname(url) === ".md") {
                    obj.hugo_path = obj.obs_path.replace(OBSIDIAN_PATH, path.join(HUGO_PATH + HUGO_POSTS_PATH));
                    obj.hugo_path = obj.hugo_path.replace(/\.md$/, ".html");
                    //返回对应的html url
                    return `![${altText}](${obj.hugo_path.replace(path.join(HUGO_PATH, "content"), "")})`;
                } else {
                    obj.hugo_path = obj.obs_path.replace(OBSIDIAN_PATH, path.join(HUGO_PATH + HUGO_STATIC_PATH));
                    //console.log("新路径",obj.hugo_path)
                    copyFile(obj.obs_path, obj.hugo_path);
                    //返回修改后的MD链接
                    return `![${altText}](${obj.hugo_path.replace(path.join(HUGO_PATH, "static"), "")})`;
                }
                
            }else{
                if (path.extname(url) === ".md") {
                    return `![${altText}](${obj.hugo_path.replace(path.join(HUGO_PATH, "content"), "")})`;
                } else {
                    return `![${altText}](${obj.hugo_path.replace(path.join(HUGO_PATH, "static"), "")})`;
                }
            }
        } else {
            //如果附件中指定的文件不存在，则返回一个错误提示链接
            console.log(`【E】附件不存在：${url}`);
            return match;
        }
    }
    return match;
}


// 遍历全部的md文件，并转换成HUGO格式
function convertMarkdownFiles() {
    fileListData.forEach(fileInfo => {
        if (fileInfo.ext === '.md') {
            //读取MD文件
            const fileContent = fs.readFileSync(fileInfo.obs_path, 'utf8');
            const { data, content } = matter(fileContent);

            // 检查是否包含HUGO_TAG
            if (data.tags && data.tags.includes(HUGO_TAG)) {
                console.log(`【i】处理MD文件：${fileInfo.name}@${fileInfo.obs_path}`);
                // 删除HUGO_TAG
                data.tags = data.tags.filter(tag => tag !== HUGO_TAG);

                // 把不标准的附件链接转换成标准附件链接：
                // ![xx](./da/bb.jpg)或 [xx](./da/bb.jpg)格式，解析并处理文件中的图片、文件、URL链接：
                let newContent = content.replace(/!\[(.*?)\]\((.*?)\)|\[(.*?)\]\((.*?)\)/g, (match, altText1, url1, altText2, url2) => {
                    let altText = altText1 || altText2;
                    let url = url1 || url2;
                    //console.log(match,altText,url);
                    return fixMDContent(match, altText, url);
                });

                //![[xxx/cover.jpg]]或[[xxx/cover.jpg]]格式，解析并处理文件中的图片、文件、URL链接：
                newContent = newContent.replace(/!\[\[(.*?)\]\]|\[\[(.*?)\]\]/g, (match, url1, url2) => {
                    let url = url1 || url2;
                    let altText = path.basename(url);
                    return fixMDContent(match, altText, url);
                });

                // 生成文章封面图(使用文章中第一个图片)
                if (data.featuredImage && data.featuredImage != "") {
                    //直接把本文的第一个图片作为封面图即可png jpg jpeg svg bmp
                    // 定义正则表达式匹配 [xxx](xxxxx.jpg) 格式
                    const regex = /\[(.*?)\]\((.*?)\)/g;
                    let match;
                    let imageUrl = "";

                    // 使用正则表达式循环匹配
                    while ((match = regex.exec(newContent)) !== null) {
                        // match[2] 是捕获组中的图片地址
                        imageUrl = match[2];
                        // 检查是否是图片格式（简单检查文件扩展名）
                        if (imageUrl.toLowerCase().endsWith(".jpg")
                            || imageUrl.toLowerCase().endsWith(".png")
                            || imageUrl.toLowerCase().endsWith(".jpeg")
                            || imageUrl.toLowerCase().endsWith(".gif")
                            || imageUrl.toLowerCase().endsWith(".svg")
                            || imageUrl.toLowerCase().endsWith(".webp")
                            || imageUrl.toLowerCase().endsWith(".bmp")) {
                            data.featuredImage = imageUrl;
                            //console.log(`设置封面图：${data.featuredImage}`);
                            break;
                        }
                    }
                }

                //为文章生成categories
                //如果文章没有指定categories
                if (!data.categories) {
                    let c=fileInfo.obs_path.replace(OBSIDIAN_PATH,"")
                    let cat = c.match(/[^/]+(?=\/[^/]+$)/)[0];
                    data.categories=[cat];
                }

                // 生成新的Markdown文件内容
                const newFileContent = matter.stringify(newContent, data);

                // 创建Hugo内容目录
                const newDirPath = path.join(HUGO_PATH+HUGO_POSTS_PATH, path.dirname(fileInfo.obs_path.replace(OBSIDIAN_PATH,"")));
                if (!fs.existsSync(newDirPath)) {
                    fs.mkdirSync(newDirPath, { recursive: true });
                }

                // 写入新的Markdown文件
                const newFilePath = path.join(newDirPath, fileInfo.name);
                fs.writeFileSync(newFilePath, newFileContent);
            } else {
                console.log(`【i】跳过MD文件：${fileInfo.obs_path}`);
            }
        }
    });
}

// 主函数
function main() {
    traverseDirectory(OBSIDIAN_PATH);
    convertMarkdownFiles();
}

// 执行主函数
main();