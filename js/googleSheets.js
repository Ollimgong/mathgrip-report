// ============================================================
//  googleSheets.js — 구글 앱스 스크립트 연동
// ============================================================
//
//  Apps Script 웹 앱 URL을 통해 CORS 없이 시트 데이터를 읽어옴
//
//  Apps Script 코드 (구글 시트 → 확장 프로그램 → Apps Script):
//
//  function doGet(e) {
//    const sheetId = e.parameter.sheet;
//    const tabName = e.parameter.tab;
//    const ss = SpreadsheetApp.openById(sheetId);
//    if (!tabName || tabName === '__list__') {
//      const names = ss.getSheets().map(s => s.getName());
//      return ContentService
//        .createTextOutput(JSON.stringify({ tabs: names }))
//        .setMimeType(ContentService.MimeType.JSON);
//    }
//    const sheet = ss.getSheetByName(tabName);
//    if (!sheet) {
//      return ContentService
//        .createTextOutput(JSON.stringify({ error: '탭을 찾을 수 없습니다: ' + tabName }))
//        .setMimeType(ContentService.MimeType.JSON);
//    }
//    const data = sheet.getDataRange().getValues();
//    const rows = data.map(row => row[0]).filter(v => v && String(v).trim());
//    return ContentService
//      .createTextOutput(rows.join('\n'))
//      .setMimeType(ContentService.MimeType.TEXT);
//  }
//
// ============================================================

/**
 * Apps Script URL 유효성 검사
 */
export function isValidScriptUrl(url) {
  return typeof url === 'string' &&
    url.trim().startsWith('https://script.google.com/macros/s/');
}

/**
 * 구글 시트의 탭 목록을 가져오기
 * @returns {Promise<string[]>} 탭 이름 배열
 */
export async function fetchTabList(scriptUrl, sheetId) {
  const url = `${scriptUrl.trim()}?sheet=${encodeURIComponent(sheetId)}&tab=__list__`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`탭 목록 조회 실패 (HTTP ${res.status})`);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json.tabs) return json.tabs;
    if (json.error) throw new Error(json.error);
  } catch (e) {
    if (e.message.includes('JSON')) {
      // 구버전 Apps Script — 탭 목록 미지원, 빈 배열 반환
      return [];
    }
    throw e;
  }
  return [];
}

/**
 * Apps Script를 통해 특정 탭 데이터 가져오기
 * @param {string} scriptUrl - Apps Script 웹 앱 URL
 * @param {string} sheetId   - 구글 시트 ID
 * @param {string} tabName   - 탭 이름 (예: "2026-03")
 * @returns {Promise<string>} CSV 텍스트 (한 줄 = MASTER 레코드)
 */
export async function fetchSheetTab(scriptUrl, sheetId, tabName) {
  const url = `${scriptUrl.trim()}?sheet=${encodeURIComponent(sheetId)}&tab=${encodeURIComponent(tabName)}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`데이터를 불러오지 못했습니다 (HTTP ${res.status})`);
  }

  const text = await res.text();

  // Apps Script가 JSON 에러를 반환하는 경우
  if (text.trim().startsWith('{')) {
    try {
      const json = JSON.parse(text);
      if (json.error) throw new Error(json.error);
    } catch (e) {
      if (e.message !== 'Unexpected token') throw e;
    }
  }

  return text;
}

/**
 * Apps Script 연결 테스트
 * - tab 파라미터 없이 요청해서 오류 여부만 확인
 * @param {string} scriptUrl
 * @param {string} sheetId
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function validateConnection(scriptUrl, sheetId) {
  if (!scriptUrl) return { ok: false, message: 'Apps Script URL을 입력해주세요.' };
  if (!isValidScriptUrl(scriptUrl)) {
    return { ok: false, message: 'URL 형식이 올바르지 않습니다.\nhttps://script.google.com/macros/s/... 형식이어야 해요.' };
  }
  if (!sheetId) return { ok: false, message: '구글 시트 ID를 입력해주세요.' };

  try {
    // 존재하지 않는 탭으로 요청 → 에러 JSON이 오면 연결은 성공
    const url = `${scriptUrl.trim()}?sheet=${encodeURIComponent(sheetId)}&tab=__test__`;
    const res = await fetch(url);

    if (!res.ok) {
      if (res.status === 403) return { ok: false, message: '접근 거부 (403). Apps Script 배포 시 액세스를 "모든 사용자"로 설정했는지 확인해주세요.' };
      return { ok: false, message: `연결 실패 (HTTP ${res.status})` };
    }

    const text = await res.text();

    // 에러 JSON이 오면 → 연결은 성공, 탭만 없는 것
    if (text.includes('탭을 찾을 수 없습니다') || text.includes('error')) {
      return { ok: true, message: '연결 성공! ✅ Apps Script가 정상 작동하고 있어요.' };
    }

    return { ok: true, message: '연결 성공! ✅' };

  } catch (e) {
    return { ok: false, message: `연결 실패: ${e.message}\n\n브라우저가 요청을 차단했을 수 있어요. Apps Script 배포 설정을 확인해주세요.` };
  }
}

/**
 * 구글 시트 URL 또는 ID에서 순수 ID만 추출
 */
export function extractSheetId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return trimmed;
}

/**
 * "YYYY-MM" 형식의 탭 이름 생성
 */
export function makeTabName(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * "YYYY-MM" → "2026년 3월" (Notion month 필드와 매칭)
 */
export function tabNameToNotionMonth(tabName) {
  const m = tabName.match(/^(\d{4})-(\d{2})$/);
  if (!m) return tabName;
  return `${m[1]}년 ${Number(m[2])}월`;
}
