const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'results.json');

// ---- 数据读写 ----
function loadResults() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveResults(results) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2), 'utf-8');
}

// ---- 提交问卷 ----
app.post('/api/submit', (req, res) => {
  const data = req.body;
  if (!data || !data.answers) {
    return res.status(400).json({ ok: false, message: '无效数据' });
  }

  const results = loadResults();
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    submittedAt: new Date().toLocaleString('zh-CN'),
    answers: data.answers
  };
  results.push(record);
  saveResults(results);

  res.json({ ok: true, message: '提交成功' });
});

// ---- 查询所有结果 ----
app.get('/api/results', (req, res) => {
  const results = loadResults();
  res.json({ ok: true, total: results.length, data: results });
});

// ---- 查询单条结果 ----
app.get('/api/results/:id', (req, res) => {
  const results = loadResults();
  const record = results.find(r => r.id === req.params.id);
  if (!record) return res.status(404).json({ ok: false, message: '未找到' });
  res.json({ ok: true, data: record });
});

// ---- 导出 CSV ----
app.get('/api/export/csv', (req, res) => {
  const results = loadResults();
  if (results.length === 0) {
    return res.status(404).json({ ok: false, message: '暂无数据' });
  }

  // 收集所有题目作为列名
  const allQuestions = Object.keys(results[0].answers);

  // 构建 CSV 头
  const headers = ['提交时间', ...allQuestions];
  const csvRows = [headers.join(',')];

  for (const record of results) {
    const row = [
      `"${record.submittedAt}"`,
      ...allQuestions.map(q => {
        const val = record.answers[q];
        if (val == null) return '';
        if (Array.isArray(val)) return `"${val.join('；')}"`;
        return `"${String(val)}"`;
      })
    ];
    csvRows.push(row.join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="问卷结果_' + new Date().toISOString().slice(0,10) + '.csv"');
  // BOM for Excel to recognize UTF-8
  res.send('\uFEFF' + csvRows.join('\n'));
});

// ---- 统计 ----
app.get('/api/stats', (req, res) => {
  const results = loadResults();
  if (results.length === 0) {
    return res.json({ ok: true, total: 0, stats: {} });
  }

  // 按题目统计
  const stats = {};
  for (const record of results) {
    for (const [qTitle, val] of Object.entries(record.answers)) {
      if (!stats[qTitle]) stats[qTitle] = {};
      if (Array.isArray(val)) {
        val.forEach(v => { stats[qTitle][v] = (stats[qTitle][v] || 0) + 1; });
        stats[qTitle]['__count'] = (stats[qTitle]['__count'] || 0) + 1;
      } else if (typeof val === 'number') {
        // 评分题
        stats[qTitle][val] = (stats[qTitle][val] || 0) + 1;
        stats[qTitle]['__count'] = (stats[qTitle]['__count'] || 0) + 1;
        stats[qTitle]['__avg'] = results.reduce((s, r) => s + (Number(r.answers[qTitle]) || 0), 0) / results.length;
      } else if (typeof val === 'string' && val.length > 20) {
        // 文本题 - 展示全部
        if (!stats[qTitle]['__entries']) stats[qTitle]['__entries'] = [];
        stats[qTitle]['__entries'].push(val);
        stats[qTitle]['__count'] = (stats[qTitle]['__count'] || 0) + 1;
      } else if (val) {
        stats[qTitle][val] = (stats[qTitle][val] || 0) + 1;
        stats[qTitle]['__count'] = (stats[qTitle]['__count'] || 0) + 1;
      }
    }
  }

  res.json({ ok: true, total: results.length, stats });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 问卷调查服务已启动: http://localhost:${PORT}`);
  console.log(`📋 问卷页面: http://localhost:${PORT}`);
  console.log(`📊 查看结果: http://localhost:${PORT}/results.html`);
});
