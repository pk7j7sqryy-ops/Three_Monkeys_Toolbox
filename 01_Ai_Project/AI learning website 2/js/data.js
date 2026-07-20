/* ============================================================
   Ailearn — mock dataset (AI 学习闭环：大模型 / RAG / Agent / LLMOps)
   ============================================================ */
window.DB = {
  // 真实学习活动日志 & 刷题结果（由 stats.js 派生统计，首次运行自动补种）
  activity: [],
  quizResults: [],

  // 顺序即学习闭环：计划 → 学习(笔记) → 检验(刷题) → 沉淀(错题) → 复盘
  nav: [
    { id: 'dashboard', label: '首页', icon: 'home' },
    { id: 'tasks', label: '学习计划', icon: 'tasks' },
    { id: 'notes', label: '笔记库', icon: 'notes' },
    { id: 'quiz', label: '刷题中心', icon: 'quiz' },
    { id: 'mistakes', label: '错题本', icon: 'mistakes' },
    { id: 'review', label: '复盘总结', icon: 'review' },
  ],

  modules: [
    { id: 'llm', label: '大模型', color: '#f5a623', notes: 18, dot: '#f5a623' },
    { id: 'rag', label: 'RAG', color: '#5b9dff', notes: 12, dot: '#5b9dff' },
    { id: 'agent', label: 'Agent', color: '#3fcf8e', notes: 9, dot: '#3fcf8e' },
    { id: 'llmops', label: 'LLMOps', color: '#b18cff', notes: 7, dot: '#b18cff' },
    { id: 'code', label: '代码实操', color: '#f0795f', notes: 14, dot: '#f0795f' },
    { id: 'base', label: '基础理论', color: '#f4bf4f', notes: 6, dot: '#f4bf4f' },
  ],

  /* ============ 计划层级：目标 → 阶段 → 周任务 → 日任务 ============
     goal   : { name, start, end }                      总目标（时间区间）
     stages : { id, name, theme, start, end, mod, noteIds, pct }
              阶段须在目标区间内；pct 仅为无任务时的兜底，挂任务后自动派生
     tasks  : level:'week' → { id, level, stageId, name, start, end, done }
              level:'day'  → { id, level, weekId | stageId, name, date, mod, dur, done }
              周任务绑阶段、日任务绑周任务（或直挂阶段）；日期在父区间内
     （种子日期由文件末尾 IIFE 按「今天」动态铺设，永不过期） ============ */
  goal: { name: 'AI 大模型工程师进阶', start: '', end: '' },

  stages: [
    { id: 'st1', name: '第 1 阶段', theme: '大模型基础与 Transformer', mod: 'llm', noteIds: [], pct: 0 },
    { id: 'st2', name: '第 2 阶段', theme: '提示工程与上下文构造', mod: 'base', noteIds: [], pct: 0 },
    { id: 'st3', name: '第 3 阶段', theme: 'RAG 检索增强生成', mod: 'rag', noteIds: [], pct: 0 },
    { id: 'st4', name: '第 4 阶段', theme: 'Agent 与工具编排', mod: 'agent', noteIds: [], pct: 0 },
    { id: 'st5', name: '第 5 阶段', theme: 'LLMOps 与评测体系', mod: 'llmops', noteIds: [], pct: 0 },
    { id: 'st6', name: '第 6 阶段', theme: '综合项目实战', mod: 'code', noteIds: [], pct: 0 },
  ],

  tasks: [
    // 当前阶段（st3）的周任务
    { id: 'w1', level: 'week', stageId: 'st3', name: 'RAG 检索与分块策略专题', done: false },
    { id: 'w2', level: 'week', stageId: 'st3', name: '向量检索与重排序实战', done: false },
    // 本周的日任务（挂周任务 w1 / w2）
    { id: 't1', level: 'day', weekId: 'w1', name: '精读《Attention Is All You Need》第 3 节', mod: 'llm', dur: 60, done: true },
    { id: 't2', level: 'day', weekId: 'w1', name: '手写实现多头注意力 (NumPy)', mod: 'code', dur: 90, done: true },
    { id: 't3', level: 'day', weekId: 'w1', name: 'RAG 分块策略对比实验', mod: 'rag', dur: 75, done: false },
    { id: 't4', level: 'day', weekId: 'w2', name: '完成「向量检索」基础自测 20 题', mod: 'rag', dur: 30, done: false },
    // 直挂阶段的散任务（无对应周任务）
    { id: 't5', level: 'day', stageId: 'st3', name: '复盘昨日 Agent 工具调用错题', mod: 'agent', dur: 25, done: false },
  ],

  notes: [
    { id:'n1', parentId:'', title:'Transformer 自注意力机制推导', mod:'llm', stageId:'st1', time:'2 小时前', tags:['Attention','QKV','Softmax'], preview:'从 Query·Key 点积到缩放 Softmax，再到加权求和的完整推导，附维度变化标注与数值稳定性说明。', code:true, pin:true, md:'# Transformer 自注意力机制推导\n\n## 1. 直觉：为什么需要自注意力\n\n序列建模的核心问题是：每个位置在编码时应该「看向」序列里的哪些其它位置。自注意力让每个 token 直接与所有 token 交互，建立任意距离的依赖。\n\n**优势：**\n- 避免 RNN 的长程衰减问题\n- 完全并行化计算\n- 可解释性强（attention 权重可视化）\n\n## 2. QKV 投影的含义\n\n```python\n# 输入 X: [seq_len, d_model]\nQ = X @ W_q  # Query: \"我在找什么\"\nK = X @ W_k  # Key: \"我能提供什么\"\nV = X @ W_v  # Value: \"实际的信息\"\n```\n\n三个矩阵的线性组合创造了三个子空间的视图。\n\n## 3. 缩放点积注意力\n\n$$Attention(Q,K,V) = softmax(\\\\frac{QK^T}{\\\\sqrt{d_k}})V$$\n\n### 为什么除以 √d_k？\n\n当 d_k 增大时，QK^T 的方差也增大，导致 softmax 梯度变小（饱和）。除以 √d_k 将方差归一化到 1：\n\n- QK^T 方差 ≈ d_k（各维度独立）\n- 除以 √d_k 后 → 方差 ≈ 1 ✓\n\n> **盲区提醒：** 这不是为了「数值稳定性」（那是归一化层的工作），而是为了**梯度流畅**。' },
    { id:'n2', parentId:'', title:'RAG 检索召回率优化六法', mod:'rag', stageId:'st3', time:'昨天 21:10', tags:['召回','重排','HyDE'], preview:'分块重叠、查询改写、HyDE、混合检索、重排序、元数据过滤——六类手段的适用场景与代价对比。', code:false },
    { id:'n3', parentId:'', title:'ReAct：推理与行动交织的 Agent 范式', mod:'agent', stageId:'st4', time:'昨天 16:42', tags:['ReAct','Tool','Planner'], preview:'Thought → Action → Observation 循环的提示模板，工具描述写法，以及防止无限循环的终止条件设计。', code:true },
    { id:'n4', parentId:'n2', title:'向量数据库选型：HNSW vs IVF', mod:'rag', stageId:'st3', time:'2 天前', tags:['HNSW','IVF','索引'], preview:'两类近似最近邻索引的构建成本、查询延迟、召回精度三角权衡，以及百万级语料下的参数经验值。', code:false },
    { id:'n5', parentId:'', title:'Prompt 版本管理与 A/B 评测', mod:'llmops', stageId:'st5', time:'3 天前', tags:['Prompt','评测','版本'], preview:'把提示词当代码管理：模板变量、版本快照、离线评测集、线上灰度，构建可回滚的提示工程闭环。', code:false },
    { id:'n6', parentId:'', title:'LoRA 微调原理与显存测算', mod:'code', stageId:'st6', time:'4 天前', tags:['LoRA','PEFT','显存'], preview:'低秩分解如何把可训练参数压到 0.1%，秩 r 的取值经验，以及不同 batch 下的显存占用估算表。', code:true },
    { id:'n7', parentId:'n1', title:'KV Cache 与推理加速', mod:'llm', stageId:'st1', time:'5 天前', tags:['KV-Cache','推理','吞吐'], preview:'解码阶段缓存历史键值避免重复计算，PagedAttention 的分页管理思路与吞吐提升量级。', code:false },
    { id:'n8', parentId:'n3', title:'Function Calling 的结构化输出约束', mod:'agent', stageId:'st4', time:'6 天前', tags:['工具调用','JSON','Schema'], preview:'用 JSON Schema 约束模型输出，处理参数缺失与幻觉调用，配合校验层做安全回退。', code:true },
  ],

  // 题库（四类 × 四型）。cat: basic|stage|interview|mixed  type: single|multi|short|code
  questions: [
    { id:'sq1', cat:'basic', type:'single', mod:'base', q:'以下哪个是 Python 中的合法变量名？',
      options:[{k:'A',t:'2var'},{k:'B',t:'var-1'},{k:'C',t:'_var1'},{k:'D',t:'var@1'}], answer:['C'],
      explain:'变量名只能含字母、数字和下划线，且不能以数字开头。' },
    { id:'sq2', cat:'basic', type:'multi', mod:'base', q:'下列属于 Python 可变（mutable）数据类型的有？（多选）',
      options:[{k:'A',t:'list'},{k:'B',t:'dict'},{k:'C',t:'set'},{k:'D',t:'tuple'}], answer:['A','B','C'],
      explain:'list/dict/set 可变，tuple 不可变。' },
    { id:'sq3', cat:'basic', type:'short', mod:'base', q:'简述 Python 中 for 循环和 while 循环的区别及适用场景。',
      answer:'for 用于已知次数、遍历可迭代对象；while 基于条件判断循环，适用于不知道循环次数、按条件决定是否继续的场景。', explain:'' },
    { id:'sq4', cat:'basic', type:'code', mod:'code', q:'编写一个函数，接受整数列表，返回其中所有偶数的和。',
      answer:'def sum_even(lst):\n    return sum(n for n in lst if n % 2 == 0)', explain:'遍历列表，累加偶数。' },
    { id:'sq5', cat:'mixed', type:'multi', mod:'rag', q:'在 RAG 系统中，下列哪些做法有助于提升「检索召回率」？（多选）',
      options:[{k:'A',t:'带重叠窗口的分块，避免语义在边界被切断'},{k:'B',t:'查询改写 / HyDE 生成假设文档再检索'},{k:'C',t:'把 top-k 直接设为 1 以减少噪声'},{k:'D',t:'稀疏(BM25)+稠密向量的混合检索'}],
      answer:['A','B','D'], explain:'top-k=1 牺牲召回；应先保召回再用重排压噪。' },
    { id:'sq6', cat:'interview', type:'short', mod:'llm', q:'请解释 Transformer 中缩放因子 √d_k 的作用。',
      answer:'当 d_k 增大时 QK^T 方差增大，softmax 进入梯度极小的饱和区；除以 √d_k 把方差拉回 1 量级，保证梯度流畅、训练稳定。', explain:'' },
  ],

  mistakes: [
    { id:'m1', mod:'rag', stageId:'st3', type:'概念混淆', time:'今天', q:'下列关于「召回率」与「精确率」在 RAG 检索阶段的权衡，描述正确的是？',
      your:'提高 top-k 一定同时提升召回率和精确率', right:'提高 top-k 提升召回率，但通常降低精确率，需靠重排序弥补',
      reason:'把召回率与精确率的关系理解为正相关。实际上扩大检索集合会引入更多无关片段，精确率下降。',
      blind:'检索评估指标', related:'重排序 (Re-ranking) 如何在高召回下恢复精确率', mastered:false, star:true },
    { id:'m2', mod:'agent', stageId:'st4', type:'流程理解', time:'昨天', q:'ReAct 模式中，Observation 步骤的作用是？',
      your:'生成最终答案', right:'承载工具执行的返回结果，供下一轮 Thought 推理使用',
      reason:'混淆了 Observation 与最终 Answer。Observation 是环境反馈，不是结论。',
      blind:'Agent 执行循环', related:'如何设计终止条件避免 ReAct 无限循环', mastered:false, star:false },
    { id:'m3', mod:'llm', stageId:'st1', type:'计算错误', time:'2 天前', q:'多头注意力中，8 个头、d_model=512，每个头的 d_k 是多少？',
      your:'512', right:'64（d_model / heads = 512 / 8）',
      reason:'忘记多头会把 d_model 均分到各头的子空间，误把整体维度当成单头维度。',
      blind:'多头注意力维度', related:'为什么拼接后还需一层输出投影 W_o', mastered:true, star:false },
    { id:'m4', mod:'llmops', stageId:'st5', type:'概念混淆', time:'3 天前', q:'离线评测集与线上 A/B 评测的核心区别是？',
      your:'两者完全等价，可互相替代', right:'离线集衡量静态质量，A/B 衡量真实流量下的业务指标',
      reason:'忽视了线上分布漂移，离线高分不等于线上有效。',
      blind:'评测体系', related:'如何构造覆盖盲区的离线评测集', mastered:false, star:true },
  ],

  reviews: [
    { id:'rv_seed1', rtype:'day', stageId:'st1', date:'2025-06-08', wd:'周日', gain:[
        '吃透自注意力的缩放因子 √dk，能从方差角度解释其必要性；',
        '手写多头注意力跑通，理解了子空间投影与拼接。',
      ], doubt:[ 'KV Cache 在长序列下的显存增长曲线还不直观；', 'PagedAttention 的分页粒度如何选取？' ],
      plan:[ '上午精读 vLLM PagedAttention 论文第 4 节；', '下午做「推理加速」专题 15 题自测。' ],
      tag:'llm', pin:true },
    { id:'rv_seed2', rtype:'week', stageId:'st3', date:'2025-06-07', wd:'周六', gain:[
        'RAG 召回优化六法已成体系，能区分召回与精确率的取舍；',
        '搭好混合检索 demo（BM25 + 稠密向量）。',
      ], doubt:[ '重排序模型的训练数据如何标注？' ],
      plan:[ '复盘检索评估指标错题 3 题；', '阅读 Cohere Rerank 文档。' ], tag:'rag', pin:false },
    { id:'rv_seed3', rtype:'day', stageId:'st4', date:'2025-06-06', wd:'周五', gain:[
        '理清 ReAct 的 Thought/Action/Observation 循环；',
        'Function Calling 用 JSON Schema 约束输出成功。',
      ], doubt:[ 'Agent 多步任务的错误如何回滚？' ],
      plan:[ '设计带终止条件的 Agent 循环；', '整理工具描述写法 checklist。' ], tag:'agent', pin:false },
  ],

  // 周报正文（范围与模块占比由 review.js 实时计算）
  weekSummary: {
    text: '本周主线从「大模型内部机制」过渡到「RAG 检索增强」，完成 Transformer 注意力推导与召回优化两大模块的知识串联。注意力机制是理解后续一切的地基，而 RAG 把外部知识接入模型——两者通过「上下文构造」这一主题被串起来：注意力决定模型如何利用上下文，RAG 决定喂给模型什么上下文。',
  },
};

/* 种子日期动态铺设：目标 = 今天前 2 月 ~ 后 4 月，阶段逐月、周任务 = 本周、日任务 = 今天。
   仅对种子生效；localStorage 已有数据会在 store.js 加载时覆盖。 */
(function () {
  const p = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const addM = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const g0 = addM(today, -2);
  window.DB.goal.start = ymd(g0);
  window.DB.goal.end = ymd(new Date(addM(g0, 6).getTime() - 86400000));
  window.DB.stages.forEach((s, i) => {
    s.start = ymd(addM(g0, i));
    s.end = ymd(new Date(addM(g0, i + 1).getTime() - 86400000));
  });
  const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * 86400000);
  window.DB.tasks.forEach(t => {
    if (t.level === 'week') { t.start = ymd(monday); t.end = ymd(new Date(monday.getTime() + 6 * 86400000)); }
    else if (t.level === 'day') t.date = ymd(today);
  });
})();
