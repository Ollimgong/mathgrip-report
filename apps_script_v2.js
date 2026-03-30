// ═══════════════════════════════════════════════════════════
//  매쓰그립 월말평가 — 노션 → 구글 시트 자동 동기화 v2
//  page_size: 10 + 시행월 필터로 타임아웃 방지
// ═══════════════════════════════════════════════════════════

const NOTION_TOKEN = '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';
const NOTION_DB_ID = '21fa6cf4db6a80b2a086d73538ef5b2c';

// ── 메뉴 추가 ──────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 매쓰그립')
    .addItem('📥 노션에서 가져오기 (월 선택)', 'syncPrompt')
    .addItem('🔄 현재 월 동기화', 'syncCurrentMonth')
    .addToUi();
}

// ── 월 선택 프롬프트 ────────────────────────────────────────
function syncPrompt() {
  const ui = SpreadsheetApp.getUi();
  const now = new Date();
  const defaultMonth = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월';
  
  const response = ui.prompt(
    '📥 노션에서 가져오기',
    '동기화할 시행월을 입력하세요.\n예: ' + defaultMonth,
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var month = response.getResponseText().trim();
  if (!month) return;
  
  var match = month.match(/(\d{4})년\s*(\d{1,2})월/);
  if (!match) {
    ui.alert('형식 오류', '"2026년 3월" 형식으로 입력해주세요.', ui.ButtonSet.OK);
    return;
  }
  
  syncMonth(month);
}

// ── 현재 월 자동 동기화 ─────────────────────────────────────
function syncCurrentMonth() {
  var now = new Date();
  var month = now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월';
  syncMonth(month);
}

// ── 단일 월 동기화 ──────────────────────────────────────────
function syncMonth(notionMonth) {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var tabName = monthToTabName(notionMonth);
  if (!tabName) {
    ui.alert('형식 오류', '"' + notionMonth + '" → 탭 이름 변환 실패', ui.ButtonSet.OK);
    return;
  }
  
  // 노션에서 해당 월 데이터만 필터해서 가져오기
  var pages = queryNotionByMonth(notionMonth);
  
  if (pages.length === 0) {
    ui.alert('데이터 없음', 
      '"' + notionMonth + '" 데이터를 찾을 수 없습니다.\n\n' +
      '확인사항:\n' +
      '1. 노션 DB에 해당 월 데이터가 있는지\n' +
      '2. Integration이 DB에 연결되어 있는지\n' +
      '3. 시행월 속성값이 정확히 "' + notionMonth + '"인지',
      ui.ButtonSet.OK);
    return;
  }
  
  // MASTER 추출
  var masterRows = [];
  pages.forEach(function(page) {
    var master = extractMaster(page);
    if (master) masterRows.push(master);
  });
  
  if (masterRows.length === 0) {
    ui.alert('파싱 실패', '페이지는 ' + pages.length + '건 있지만 MASTER를 추출할 수 없습니다.', ui.ButtonSet.OK);
    return;
  }
  
  // 시트에 쓰기
  writeToSheet(ss, tabName, masterRows);
  
  ui.alert('✅ 동기화 완료', tabName + ' 탭에 ' + masterRows.length + '건 동기화 완료!', ui.ButtonSet.OK);
}

// ── 노션 API: 시행월 필터 + 페이징 (page_size: 10) ─────────
function queryNotionByMonth(month) {
  var allResults = [];
  var hasMore = true;
  var startCursor = undefined;
  var batchNum = 0;
  
  while (hasMore) {
    var payload = {
      page_size: 10,
      filter: {
        property: '시행월',
        select: { equals: month }
      }
    };
    if (startCursor) payload.start_cursor = startCursor;
    
    try {
      var response = UrlFetchApp.fetch(
        'https://api.notion.com/v1/databases/' + NOTION_DB_ID + '/query',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + NOTION_TOKEN,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        }
      );
      
      var code = response.getResponseCode();
      if (code !== 200) {
        Logger.log('Notion API error ' + code + ' (batch ' + batchNum + ')');
        // 504 타임아웃이면 잠시 쉬고 재시도
        if (code === 504 && batchNum < 50) {
          Utilities.sleep(2000);
          continue;
        }
        break;
      }
      
      var data = JSON.parse(response.getContentText());
      allResults = allResults.concat(data.results);
      hasMore = data.has_more;
      startCursor = data.next_cursor;
      batchNum++;
      
      Logger.log('Batch ' + batchNum + ': ' + data.results.length + '건 (누적 ' + allResults.length + '건)');
      
      // API 속도 제한 방지
      if (hasMore) Utilities.sleep(350);
      
    } catch (e) {
      Logger.log('Notion API 호출 실패: ' + e.message);
      break;
    }
  }
  
  Logger.log('총 ' + allResults.length + '건 가져옴 (' + batchNum + '회 호출)');
  return allResults;
}

// ── MASTER 값 추출 ──────────────────────────────────────────
function extractMaster(page) {
  var props = page.properties;
  if (!props) return null;
  
  // MASTER 수식 속성에서 직접 추출
  if (props['MASTER']) {
    var p = props['MASTER'];
    if (p.type === 'formula') {
      var val = p.formula.string || '';
      if (val && val.indexOf('|') !== -1) return val;
    }
  }
  
  return null;
}

// ── 시트에 쓰기 ─────────────────────────────────────────────
function writeToSheet(ss, tabName, rows) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  } else {
    sheet.clear();
  }
  
  if (rows.length > 0) {
    var data = rows.map(function(r) { return [r]; });
    sheet.getRange(1, 1, data.length, 1).setValues(data);
  }
}

// ── 유틸: "2026년 3월" → "2026-03" ─────────────────────────
function monthToTabName(month) {
  var match = month.match(/(\d{4})년\s*(\d{1,2})월/);
  if (!match) return null;
  var m = match[2];
  if (m.length === 1) m = '0' + m;
  return match[1] + '-' + m;
}

// ── 테스트 함수 ─────────────────────────────────────────────
function testNotion() {
  var response = UrlFetchApp.fetch(
    'https://api.notion.com/v1/databases/' + NOTION_DB_ID + '/query',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        page_size: 1,
        filter: {
          property: '시행월',
          select: { equals: '2026년 3월' }
        }
      }),
      muteHttpExceptions: true
    }
  );
  
  var data = JSON.parse(response.getContentText());
  var props = data.results[0].properties;
  
  // 각 속성의 실제 값 확인
  var fields = ['학생ID','시행월','이름','학교','학년','점수','시험범위','집계시작일','집계종료일','출결집계','태도집계','숙제집계','진도','코멘트','MASTER'];
  
  fields.forEach(function(name) {
    var p = props[name];
    if (!p) { Logger.log(name + ' → 속성 없음'); return; }
    Logger.log(name + ' [' + p.type + '] → ' + JSON.stringify(p[p.type]).substring(0, 150));
  });
}

// ── 기존 doGet 함수 (웹앱용 — 그대로 유지) ─────────────────
function doGet(e) {
  var sheetId = e.parameter.sheet;
  var tabName = e.parameter.tab;
  var ss = SpreadsheetApp.openById(sheetId);
  
  if (!tabName || tabName === '__list__') {
    var names = ss.getSheets().map(function(s) { return s.getName(); });
    return ContentService
      .createTextOutput(JSON.stringify({ tabs: names }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: '탭을 찾을 수 없습니다: ' + tabName }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var data = sheet.getDataRange().getValues();
  var rows = data.map(function(row) { return row[0]; }).filter(function(v) { return v && String(v).trim(); });
  return ContentService
    .createTextOutput(rows.join('\n'))
    .setMimeType(ContentService.MimeType.TEXT);
}
