// ============================================================
//  renderer.js — 레포트 카드 렌더링 v3
//  - 매쓰그립 테마 (#19b1c6 / #1e2a6d)
//  - 막대그래프: 순수 CSS 기반 고정 7칸 (기준월 포함 직전 6개월)
//  - 알파벳 성적 제거
//  - 카드 고정 크기 (A4 비율)
// ============================================================

import { getAnnualScores } from './parser.js';

// Chart 인스턴스 추적 (canvas ID → 인스턴스)
const chartInstances = new Map();

// ── 브랜드 색상 ──────────────────────────────────────────────
const BRAND_PRIMARY   = '#19b1c6';
const BRAND_SECONDARY = '#1e2a6d';

// ── 색상 헬퍼 ─────────────────────────────────────────────
function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── canvas ID 생성 ────────────────────────────────────────
function makeCanvasId(type, studentId, uid) {
  return `c-${type}-${studentId}-${uid}`.replace(/[^a-zA-Z0-9\-]/g, '_');
}

// ── "2026년 3월" → 202603 변환 (정렬 용도) ────────────────
function parseMonthLabel(label) {
  if (!label) return 0;
  const m = label.match(/(\d{4})년\s*(\d{1,2})월/);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

// ── "2026년 3월" → "3월" (짧은 라벨) ─────────────────────
function shortMonth(label) {
  if (!label) return '';
  const m = label.match(/\d{1,2}월/);
  return m ? m[0] : label;
}

/**
 * allStudents에 실제 존재하는 월 중에서
 * 기준월(currentMonth) 이하인 것만 추출하여 슬롯 생성 (최대 7개)
 * → 탭이 없는 달은 아예 표시하지 않음
 */
function buildDataSlots(currentMonth, annualScores, allStudents, studentId) {
  const cur = parseMonthLabel(currentMonth);
  if (!cur) return [];

  const existingMonths = [...new Set(allStudents.map(s => s.month).filter(Boolean))]
    .filter(m => parseMonthLabel(m) <= cur)
    .sort((a, b) => parseMonthLabel(a) - parseMonthLabel(b));

  const recentMonths = existingMonths.slice(-7);

  return recentMonths.map(label => {
    const isCurrent = (label === currentMonth);
    const found = annualScores.find(s => s.month === label);
    const rec = allStudents.find(s => s.id === studentId && s.month === label);
    const grade = rec ? rec.grade : null;
    return {
      label,
      score: found ? found.score : null,
      scope: found ? (found.scope || null) : null,
      grade,
      isCurrent,
    };
  });
}

// ── 레포트 카드 HTML 생성 ──────────────────────────────────
export function buildReportCard(student, allStudents, accentColor, settings, uid) {
  // 선생님별 색상은 카드 헤더/포인트에만 제한적으로 사용
  // 전체 UI는 브랜드 컬러 기반
  const color      = accentColor || BRAND_PRIMARY;
  const colorLight = hexToRgba(color, 0.1);
  const { academyName = '매쓰그립수학학원', logoBase64 = '' } = settings || {};

  const cardUid = uid || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // annualScores: scope 정보도 담기 위해 allStudents에서 직접 구축
  const rawScores = allStudents
    .filter(s => s.id === student.id && s.score !== null)
    .map(s => ({ month: s.month, score: s.score, scope: s.scope || '' }))
    .sort((a, b) => parseMonthLabel(a.month) - parseMonthLabel(b.month));

  const slots = buildDataSlots(student.month, rawScores, allStudents, student.id);
  const hasHistory = rawScores.length >= 1;

  const { score, attStats, att2Stats, hwStats } = student;

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="로고" class="rc-logo-img">`
    : `<div class="rc-logo-placeholder">📐</div>`;

  // canvas IDs
  const attId  = makeCanvasId('att',  student.id, cardUid);
  const att2Id = makeCanvasId('att2', student.id, cardUid);
  const hwId   = makeCanvasId('hw',   student.id, cardUid);

  // ── 성적 추이: 테이블 + 막대그래프 병렬 ────────────────
  const maxScore = 100;

  // 모든 슬롯 표시 (점수 없는 달도 포함)
  const trendTableRows = slots.map(slot => {
    const scopeText = slot.score !== null ? (slot.scope || '').replace(/;/g, ' / ').trim() : '';
    const scoreText = slot.score !== null ? slot.score : '<span class="rc-trend-no-score">미시행</span>';
    return `<tr class="${slot.isCurrent ? 'rc-trend-current' : ''}">
      <td class="rc-trend-td-month">${shortMonth(slot.label)}</td>
      <td class="rc-trend-td-score">${scoreText}</td>
      <td class="rc-trend-td-scope">${scopeText}</td>
    </tr>`;
  }).join('');

  const barsHtml = slots.map(slot => {
    const pct = slot.score !== null ? Math.round(slot.score / maxScore * 100) : 0;
    const barColor = slot.isCurrent ? BRAND_PRIMARY : hexToRgba(BRAND_PRIMARY, 0.45);
    const scoreLabel = slot.score !== null ? `<div class="rc-bar-score">${slot.score}</div>` : '<div class="rc-bar-score">&nbsp;</div>';
    const barInner = slot.score !== null
      ? `<div class="rc-bar-fill" style="height:${pct}%;background:${barColor};"></div>`
      : `<div class="rc-bar-empty"></div>`;
    return `
    <div class="rc-bar-col">
      ${scoreLabel}
      <div class="rc-bar-area">${barInner}</div>
      <div class="rc-bar-label ${slot.isCurrent ? 'current' : ''}">${shortMonth(slot.label)}</div>
    </div>`;
  }).join('');

  return `
<div class="report-card" data-uid="${cardUid}" data-student-id="${student.id}"
  style="--accent:${color};--accent-light:${colorLight};">

  <!-- 헤더 -->
  <div class="rc-header" style="border-bottom:3px solid ${BRAND_PRIMARY};">
    <div class="rc-header-left">
      ${logoHtml}
      <div class="rc-academy-info">
        <div class="rc-academy-name">${academyName}</div>
        <div class="rc-academy-slogan">손에 잡히는 수학</div>
      </div>
    </div>
    <div class="rc-doc-title" style="color:${BRAND_SECONDARY};">
      ${student.month} 월말평가
    </div>
  </div>

  <!-- 학생 정보 -->
  <div class="rc-student-info" style="background:${hexToRgba(BRAND_SECONDARY, 0.05)};">
    <div class="rc-info-grid">
      <div class="rc-info-item">
        <span class="rc-info-label">이름</span>
        <span class="rc-info-value rc-name">${student.name}</span>
      </div>
      <div class="rc-info-item">
        <span class="rc-info-label">학교</span>
        <span class="rc-info-value">${student.school}</span>
      </div>
      <div class="rc-info-item">
        <span class="rc-info-label">학년</span>
        <span class="rc-info-value">${student.grade}</span>
      </div>
      <div class="rc-info-item">
        <span class="rc-info-label">담당선생님</span>
        <span class="rc-info-value" style="font-weight:700;">${student.teacher}</span>
      </div>
    </div>
  </div>

  <!-- 이번달 성적 -->
  <div class="rc-section">
    <div class="rc-section-title" style="border-left:3px solid ${BRAND_PRIMARY};padding-left:8px;color:${BRAND_SECONDARY};">이번 달 성적</div>
    <div class="rc-score-main">
      <div class="rc-score-display">
        <div class="rc-score-label">월말평가</div>
        <div class="rc-score-number" style="color:${score !== null && score >= 90 ? '#15803d' : '#1a202c'};">
          ${score !== null ? score : '–'}${score !== null ? '<span class="rc-score-unit">점</span>' : ''}
        </div>
      </div>
      <div class="rc-scope-box" style="border-left:3px solid ${BRAND_PRIMARY};">
        <div class="rc-scope-label">시험 범위</div>
        <div class="rc-scope-text">${(student.scope || '–').replace(/;/g, ' / ')}</div>
        ${student.progress ? `
        <div class="rc-progress-row">
          <span class="rc-progress-label">진도</span>
          <span class="rc-progress-text">${student.progress.replace(/;/g, ' · ')}</span>
        </div>` : ''}
      </div>
    </div>
  </div>

  <!-- 성적 추이 -->
  <div class="rc-trend-section">
    <div class="rc-trend-title" style="border-left:3px solid ${BRAND_PRIMARY};padding-left:8px;color:${BRAND_SECONDARY};">성적 추이</div>
    <div class="rc-trend-layout">
      <div class="rc-trend-table-wrap">
        <table class="rc-trend-table">
          <thead><tr><th>월</th><th>점수</th><th>범위</th></tr></thead>
          <tbody>${trendTableRows || '<tr><td colspan="3" style="color:#a0aec0;text-align:center;">데이터 없음</td></tr>'}</tbody>
        </table>
      </div>
      <div class="rc-trend-chart">
        <div class="rc-bar-table">
          ${barsHtml}
        </div>
      </div>
    </div>
  </div>

  <!-- 학습 현황 -->
  <div class="rc-section">
    <div class="rc-section-title" style="border-left:3px solid ${BRAND_PRIMARY};padding-left:8px;color:${BRAND_SECONDARY};">학습 현황${student.dateStart && student.dateEnd ? `<span class="rc-date-range">${student.dateStart} ~ ${student.dateEnd}</span>` : ''}</div>
    <div class="rc-stats-grid">

      <!-- 출결 -->
      <div class="rc-stat-card">
        <div class="rc-stat-title">출결</div>
        <div class="rc-donut-wrap">
          <canvas id="${attId}" width="70" height="70"></canvas>
          <div class="rc-donut-center">
            <div class="rc-donut-pct">${attStats.rate}<span class="rc-donut-unit">%</span></div>
          </div>
        </div>
        <div class="rc-stat-detail">
          <span class="rc-stat-chip att-present">출석 ${attStats.present}</span>
          <span class="rc-stat-chip att-late">지각 ${attStats.late}</span>
          <span class="rc-stat-chip att-absent">결석 ${attStats.absent}</span>
          <div class="rc-stat-total">전체 ${attStats.total}회</div>
        </div>
      </div>

      <!-- 수업태도 -->
      <div class="rc-stat-card">
        <div class="rc-stat-title">수업태도</div>
        <div class="rc-donut-wrap">
          <canvas id="${att2Id}" width="70" height="70"></canvas>
          <div class="rc-donut-center">
            <div class="rc-donut-star">${att2Stats.starAvg}<span class="rc-donut-unit">★</span></div>
          </div>
        </div>
        <div class="rc-stat-detail">
          <span class="rc-stat-chip att-present">★★★ ${att2Stats.counts[0]}</span>
          <span class="rc-stat-chip att-late">★★☆ ${att2Stats.counts[1]}</span>
          <span class="rc-stat-chip att-absent">★☆☆ ${att2Stats.counts[2]}</span>
          <div class="rc-stat-total">전체 ${att2Stats.total}회</div>
        </div>
      </div>

      <!-- 숙제 -->
      <div class="rc-stat-card">
        <div class="rc-stat-title">숙제</div>
        <div class="rc-donut-wrap">
          <canvas id="${hwId}" width="70" height="70"></canvas>
          <div class="rc-donut-center">
            <div class="rc-donut-star">${hwStats.starAvg}<span class="rc-donut-unit">★</span></div>
          </div>
        </div>
        <div class="rc-stat-detail">
          <span class="rc-stat-chip att-present">★★★ ${hwStats.counts[0]}</span>
          <span class="rc-stat-chip att-late">★★☆ ${hwStats.counts[1]}</span>
          <span class="rc-stat-chip att-absent">★☆☆ ${hwStats.counts[2]}</span>
          <div class="rc-stat-total">전체 ${hwStats.total}회${(hwStats.counts[3] || 0) > 0 ? ` (미제출 ${hwStats.counts[3]}회)` : ''}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 선생님 코멘트 (맨 아래) -->
  <div class="rc-section rc-section-comment">
    <div class="rc-section-title" style="border-left:3px solid ${color};padding-left:8px;color:${BRAND_SECONDARY};">선생님 코멘트</div>
    <div class="rc-comment-box" style="border-left:3px solid ${color};background:${colorLight};">
      <div class="rc-comment-text">${student.comment ? student.comment.replace(/;/g, '<br>') : '<span style="color:#a0aec0;font-style:italic;">—</span>'}</div>
    </div>
  </div>

  <!-- 푸터 -->
  <div class="rc-footer" style="border-top:2px solid ${hexToRgba(BRAND_PRIMARY, 0.2)};background:${hexToRgba(BRAND_SECONDARY, 0.04)};">
    <div class="rc-footer-text">${academyName} · 손에 잡히는 수학</div>
  </div>
</div>`;
}

// ── 차트 렌더링 (도넛 3개만, 막대는 CSS) ─────────────────
export function renderCharts(student, allStudents, accentColor, uid) {
  const cardUid = uid || findCardUid(student.id);
  if (!cardUid) return;

  const attId  = makeCanvasId('att',  student.id, cardUid);
  const att2Id = makeCanvasId('att2', student.id, cardUid);
  const hwId   = makeCanvasId('hw',   student.id, cardUid);

  renderDonut(attId,
    [student.attStats.present, student.attStats.late, student.attStats.absent],
    ['출석','지각','결석'],
    ['#19b1c6','#f59e0b','#ef4444']);

  renderDonut(att2Id,
    [student.att2Stats.counts[0], student.att2Stats.counts[1], student.att2Stats.counts[2]],
    ['★★★','★★☆','★☆☆'],
    ['#19b1c6','#f59e0b','#f97316']);

  renderDonut(hwId,
    [student.hwStats.counts[0], student.hwStats.counts[1], student.hwStats.counts[2], student.hwStats.counts[3] || 0],
    ['★★★','★★☆','★☆☆','☆☆☆'],
    ['#19b1c6','#f59e0b','#f97316','#ef4444']);
}

// DOM에서 student.id에 해당하는 카드의 uid를 찾아줌
function findCardUid(studentId) {
  const card = document.querySelector(`.report-card[data-student-id="${studentId}"]`);
  return card ? card.dataset.uid : null;
}

function renderDonut(canvasId, data, labels, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  destroyChart(canvasId);

  const total = data.reduce((s, v) => s + v, 0);
  const chartData   = total > 0 ? data   : [1];
  const chartColors = total > 0 ? colors : ['#e2e8f0'];

  const ctx = canvas.getContext('2d');
  const inst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: total > 0 ? labels : ['데이터 없음'],
      datasets: [{ data: chartData, backgroundColor: chartColors, borderWidth: 0 }]
    },
    options: {
      responsive: false,
      animation: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed}` } }
      }
    }
  });
  chartInstances.set(canvasId, inst);
}

function destroyChart(id) {
  if (chartInstances.has(id)) {
    chartInstances.get(id).destroy();
    chartInstances.delete(id);
  }
  // Chart.js 내부 캐시도 제거
  const canvas = document.getElementById(id);
  if (canvas) {
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
  }
}

export function destroyAllCharts() {
  chartInstances.forEach(c => { try { c.destroy(); } catch(e) {} });
  chartInstances.clear();
}
