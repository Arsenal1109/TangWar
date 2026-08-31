// 揄取仓库字符集：UI 文案 + 数据表 + 文档词表 + ASCII + 常用中英文标点与符号。
// 用法：node tools/extract-charset.mjs [输出文件]  （默认 temp/font-subset/charset.txt）
// 供 tools/subset-font.sh 调用 pyftsubset；新增文案后重跑二者即可扩充字体覆盖。
import fs from 'node:fs';
import path from 'node:path';

const outPath = process.argv[2] ?? 'temp/font-subset/charset.txt';

const globAll = (patterns) => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  for (const pattern of patterns) walk(pattern);
  return files;
};

const roots = ['assets/scripts', 'tests', 'docs'];
const files = [
  ...globAll(roots).filter((f) => /\.(ts|md)$/.test(f)),
  'README.md',
  'design-qa.md'
].filter((f) => fs.existsSync(f));

// 常用缓冲字表：标点符号 + 数字汉字 + 军政常用字（覆盖后续小幅文案增改，避免豆腐块）。
const extras = [
  ' \t\n',
  '！？。，、；：·…—－―‖',
  '“”‘’「」『』（）《》〈〉〔〕【】',
  '％‰＋－×÷＝≠≈≤≥℃°′″￡￥',
  '①②③④⑤⑥⑦⑧⑨⑩ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ',
  '零一二三四五六七八九十百千万亿兆',
  '点半年年月日岁旬春夏季冬早晚晨昏',
  '东南西北中前后左右上下里外',
  '胜负胜败金银财宝钱粮草木兵卒马匹民心城池关隘军营阵营',
  '胜负输赢成败得失利害福祸吉凶休咎',
  '攻守伐谋战和降叛擒斩俘获守御征讨',
  '谋计策智略韬略机变权谋间碟细作斥候探马',
  '君臣父子兄弟妻妾将相帅尉官僚吏卒',
  '诏令旨敕玺印符节契券榜檄文书信',
  '贡赋税役征调募徵集散流亡逃归附',
  '斩杀俘虏获缴班师凯旋捷报军情急',
  '伤亡损益增减盈亏虚实强弱大小',
  '高低长短轻重快慢迟早新旧明暗',
  '冷热干湿始末终初永远暂即立速缓急',
  '必须应该可能能否愿肯敢想思虑念',
  '记忆见识闻听视看观望盯瞄注视瞧',
  '寻找搜索探猜测料想估算计测量预测',
  '意愿志愿欲望求乞讨要索需获取',
  '得到失丧消灭报废弃舍弃抛留下停',
  '驻扎安营歇息睡眠睡醒起卧坐立行',
  '走跑步奔驰驶驾御骑乘舟航行渡涉',
  '跋攀爬登降升降起落坠跌摔滑撞碰',
  '击打敲捶拍抚摸擦拭扫淋泼洒浇灌',
  '浸淹沉浮漂游泳潜隐现藏躲避让退',
  '进冲突围解脱离合闭开放掩盖遮蔽',
  '隐蔽暗藏埋伏突袭偷盗抢劫掠夺',
  '接受拒抗抵抵抗挡阻阻碍妨碍滞拖',
  '延耽搁误错误过罪责罚赏奖励惩处',
  '断决判决裁夺选择挑选录取舍弃',
  '逐驱逐赶撵追追逐随跟随陪同',
  '伙伴侣偶配偶婚嫁娶姻亲家',
  '旗帜号角鼓锣钟磬琴瑟箫笛',
  '箭矢弓弩刀剑枪矛盾盔甲铠仗',
  '器械车辕轮毂辐轴辖贯穿凿铸锻造',
  '锤炼淬火冶铁铜锡铅汞丹砂药物医',
  '治疗救护理调养休息寝寐梦醒',
  '祸福荣辱尊卑贵贱贫富穷达顺逆',
  '兴衰治乱安危存亡继绝续断',
  '王朝帝太子妃后宫文武百姓名字',
  '号氏族亲仇敌友邻邦国天下'
].join('');

const set = new Set();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const ch of text) set.add(ch);
}
for (let i = 0x20; i <= 0x7e; i += 1) set.add(String.fromCharCode(i)); // 全量 ASCII 可见字符
for (const ch of extras) set.add(ch);
set.add('\n');
set.add('\t');
set.delete('\r');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, [...set].join(''), 'utf8');
console.log(`charset: ${set.size} 字符 <- ${files.length} 文件 -> ${outPath}`);
