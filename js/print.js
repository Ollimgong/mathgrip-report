// ============================================================
//  print.js — PDF 출력 / 프린트 처리 (버그 수정 v2)
// ============================================================



/**
 * 선택된 학생들의 레포트를 프린트
 */
async function printReports(students, allStudents) {
  if (!students || students.length === 0) {
    alert('출력할 학생을 선택해주세요.');
    return;
  }

  const state = AppStore.getState();
  const { academyName, logoBase64, gradeColors } = state;

  // ── 기존 프린트 컨테이너 완전 제거 ──────────────────────
  const existing = document.getElementById('print-container');
  if (existing) {
    // 기존 차트 먼저 제거
    existing.querySelectorAll('canvas').forEach(c => {
      const chart = Chart.getChart(c);
      if (chart) chart.destroy();
    });
    existing.remove();
  }

  // ── 새 프린트 컨테이너 생성 ──────────────────────────────
  const printContainer = document.createElement('div');
  printContainer.id = 'print-container';
  printContainer.style.display = 'none';
  document.body.appendChild(printContainer);

  // ── 학생별 카드 생성 (uid 매핑 저장) ─────────────────────
  const uidMap = new Map(); // student → uid

  for (const student of students) {
    const uid   = `print_${student.id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const color = getGradeColor(student.grade, state);
    const html  = buildReportCard(student, allStudents, color, { academyName, logoBase64, gradeColors }, uid);

    const page = document.createElement('div');
    page.className = 'print-page';
    page.innerHTML = html;
    printContainer.appendChild(page);

    uidMap.set(student, uid);
  }

  // ── DOM 반영 후 차트 렌더링 ───────────────────────────────
  printContainer.style.display = 'block';
  await sleep(120); // DOM paint 대기

  for (const [student, uid] of uidMap) {
    const color = getGradeColor(student.grade, state);
    renderCharts(student, allStudents, color, uid);
  }

  await sleep(600); // 차트 렌더 완료 대기

  // ── 인쇄 실행 ────────────────────────────────────────────
  window.print();

  // ── 클린업 ───────────────────────────────────────────────
  setTimeout(() => {
    printContainer.querySelectorAll('canvas').forEach(c => {
      const chart = Chart.getChart(c);
      if (chart) chart.destroy();
    });
    printContainer.remove();
  }, 3000);
}

/**
 * 단일 학생 미리보기 모달
 */
function previewReport(student, allStudents, accentColor) {
  const state = AppStore.getState();
  const { academyName, logoBase64, gradeColors } = state;

  // 기존 모달 제거 (차트 포함)
  const existing = document.getElementById('preview-modal');
  if (existing) {
    existing.querySelectorAll('canvas').forEach(c => {
      const chart = Chart.getChart(c);
      if (chart) chart.destroy();
    });
    existing.remove();
  }

  const color = accentColor || '#3B82F6';
  const uid   = `preview_${Date.now()}`;
  const html  = buildReportCard(student, allStudents, color, { academyName, logoBase64, gradeColors }, uid);

  const modal = document.createElement('div');
  modal.id = 'preview-modal';
  modal.className = 'preview-modal-overlay';
  modal.innerHTML = `
    <div class="preview-modal-content">
      <div class="preview-modal-header">
        <span>📋 레포트 미리보기 — ${student.name}</span>
        <div class="preview-modal-actions">
          <button class="btn btn-primary btn-sm" id="btnPrintSingle">🖨️ 인쇄</button>
          <button class="btn btn-ghost btn-sm" id="btnClosePreview">✕ 닫기</button>
        </div>
      </div>
      <div class="preview-modal-body">${html}</div>
    </div>`;

  document.body.appendChild(modal);

  // 차트 렌더링 (DOM 반영 후)
  setTimeout(() => {
    renderCharts(student, allStudents, color, uid);
  }, 150);

  // 닫기
  const closeModal = () => {
    modal.querySelectorAll('canvas').forEach(c => {
      const chart = Chart.getChart(c);
      if (chart) chart.destroy();
    });
    modal.remove();
  };

  document.getElementById('btnClosePreview').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // 단일 인쇄
  document.getElementById('btnPrintSingle').addEventListener('click', () => {
    printReports([student], allStudents);
  });
}

// ── 유틸 ─────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }



/**
 * 인쇄 시 카드 내용이 A4 1페이지를 넘칠 때 자동 축소
 * - 코멘트 텍스트 폰트 축소 (12px → 11px → 10px)
 * - 그래도 넘치면 카드 전체 scale 축소
 */
function autoFitCards(container) {
  const MAX_HEIGHT = 792; // A4 비율 기준 최대 높이 (px)
  const cards = container.querySelectorAll('.report-card');

  cards.forEach(card => {
    // 인쇄용이므로 고정 높이 제한 해제하고 실제 높이 측정
    card.style.maxHeight = 'none';
    card.style.minHeight = 'none';

    let h = card.scrollHeight;
    if (h <= MAX_HEIGHT) {
      // 넘치지 않으면 원래대로
      card.style.maxHeight = '';
      card.style.minHeight = '';
      return;
    }

    // 1단계: 코멘트 텍스트 폰트 축소
    const commentEl = card.querySelector('.rc-comment-text');
    if (commentEl) {
      const fontSizes = [11, 10, 9];
      for (const fs of fontSizes) {
        commentEl.style.fontSize = fs + 'px';
        commentEl.style.lineHeight = '1.5';
        h = card.scrollHeight;
        if (h <= MAX_HEIGHT) break;
      }
    }

    // 2단계: 그래도 넘치면 카드 전체 CSS scale 축소
    if (card.scrollHeight > MAX_HEIGHT) {
      const ratio = MAX_HEIGHT / card.scrollHeight;
      const scale = Math.max(ratio, 0.82); // 최소 82%까지만 축소
      card.style.transform = `scale(${scale})`;
      card.style.transformOrigin = 'top center';
    }

    card.style.maxHeight = '';
    card.style.minHeight = '';
  });
}