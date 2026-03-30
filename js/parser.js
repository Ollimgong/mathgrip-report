// ============================================================
//  parser.js — CSV / MASTER 파싱 함수
// ============================================================
//  MASTER 필드 순서:
//  0:id | 1:month | 2:name | 3:teacher | 4:school | 5:grade |
//  6:score | 7:scope | 8:att | 9:att2 | 10:hw | 11:progress | 12:comment
// ============================================================

/**
 * MASTER 문자열 하나를 파싱해서 객체로 반환
 * @param {string} raw - pipe(|) 구분 MASTER 문자열
 * @returns {Object|null}
 */
function parseMaster(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('|');
  if (parts.length < 10) return null; // 최소 필드 수 체크 (v4: 15필드)

  const [
    id, month, name, teacher, school, grade,
    scoreRaw, scope, dateStartRaw, dateEndRaw,
    attRaw, att2Raw, hwRaw, progress, ...commentParts
  ] = parts;

  // 코멘트는 나머지 파트를 합침 (파이프가 포함될 수 있으므로)
  const comment = commentParts.join('|').trim();

  // 점수 파싱
  const score = scoreRaw && scoreRaw.trim() !== '' ? Number(scoreRaw.trim()) : null;

  // 집계 기간 파싱 (YYMMDD → "YY.MM.DD")
  const dateStart = parseDateField(dateStartRaw);
  const dateEnd   = parseDateField(dateEndRaw);

  // 출결 파싱: "present,late,absent,total"
  const att = parseSubField(attRaw, 4);

  // 태도 파싱: "3star,2star,1star,avgPct"
  const att2 = parseSubField(att2Raw, 4);

  // 숙제 파싱: "3star,2star,1star,zero,avgPct"
  const hw = parseSubField(hwRaw, 5);

  // 출결 지표 계산
  const attStats = calcAttStats(att);
  // 태도 지표 계산
  const att2Stats = calcRatingStats(att2, 3);
  // 숙제 지표 계산
  const hwStats = calcRatingStats(hw, 4);

  return {
    id: (id || '').trim(),
    month: (month || '').trim(),
    name: (name || '').trim(),
    teacher: (teacher || '').trim(),
    school: (school || '').trim(),
    grade: (grade || '').trim(),
    score,
    scope: (scope || '').trim(),
    dateStart,
    dateEnd,
    att,
    att2,
    hw,
    progress: (progress || '').trim(),
    comment,
    attStats,
    att2Stats,
    hwStats,
  };
}

/**
 * YYMMDD 형식 날짜 문자열을 "MM.DD" 표시용 문자열로 변환
 * @param {string} raw - "260301" 등
 * @returns {string} "3.1" 또는 빈 문자열
 */
function parseDateField(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim();
  if (s.length !== 6) return s; // 형식이 다르면 그대로 반환
  const yy = s.slice(0, 2);
  const mm = String(Number(s.slice(2, 4)));
  const dd = String(Number(s.slice(4, 6)));
  return `${mm}.${dd}`;
}

/**
 * 하위 필드 문자열을 숫자 배열로 파싱
 * @param {string} raw - 콤마 구분 문자열
 * @param {number} expectedLen - 기대 길이
 * @returns {number[]}
 */
function parseSubField(raw, expectedLen) {
  if (!raw || typeof raw !== 'string') return new Array(expectedLen).fill(0);
  const arr = raw.trim().split(',').map(v => {
    const n = Number(v.trim());
    return isNaN(n) ? 0 : n;
  });
  // 부족하면 0으로 채움
  while (arr.length < expectedLen) arr.push(0);
  return arr;
}

/**
 * 출결 통계 계산
 * att = [present, late, absent, total]
 * 출석률 = (present + late*0.5) / total * 100
 */
function calcAttStats(att) {
  const [present, late, absent, total] = att;
  if (!total || total === 0) return { rate: 0, present, late, absent, total };
  const rate = Math.round((present + late * 0.5) / total * 100 * 10) / 10;
  return { rate, present, late, absent, total };
}

/**
 * 태도/숙제 통계 계산 (별점 기반)
 * att2: [3star, 2star, 1star, avgPct] (valueCnt=3)
 * hw:   [3star, 2star, 1star, zero, avgPct] (valueCnt=4)
 * 별점 평균 = avgPct / 100 * 3
 */
function calcRatingStats(arr, valueCnt) {
  const counts = arr.slice(0, valueCnt);
  const avgPct = arr[valueCnt] || 0;
  const total = counts.reduce((s, v) => s + v, 0);
  const starAvg = Math.round(avgPct / 100 * 3 * 10) / 10;
  return { counts, avgPct, total, starAvg };
}

/**
 * CSV 문자열 전체를 파싱해서 학생 배열로 반환
 * - 한 줄 = 레코드 하나 (MASTER 형식)
 * - 빈 줄, 헤더(#으로 시작), ID가 없는 줄은 건너뜀
 * @param {string} csvText - CSV 파일 내용
 * @returns {Object[]} students 배열
 */
function parseCSV(csvText) {
  if (!csvText) return [];
  const lines = csvText.split(/\r?\n/);
  const students = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;               // 빈 줄
    if (trimmed.startsWith('#')) continue; // 주석 줄
    if (trimmed.startsWith('id|') || trimmed.startsWith('ID|')) continue; // 헤더 줄

    const parsed = parseMaster(trimmed);
    if (parsed && parsed.id && parsed.name) {
      students.push(parsed);
    }
  }

  return students;
}

/**
 * 학생 배열에서 연간 성적 추이를 추출
 * 같은 studentId의 모든 월 성적을 모아 반환
 * @param {Object[]} allStudents - 전체 학생 데이터
 * @param {string} studentId - 학생 ID
 * @returns {Array<{month, score}>} 월별 성적 배열 (시간순)
 */
function getAnnualScores(allStudents, studentId) {
  const records = allStudents
    .filter(s => s.id === studentId && s.score !== null)
    .map(s => ({ month: s.month, score: s.score }));

  // 월 정렬: "2025년 3월" → 년*100+월로 정렬
  records.sort((a, b) => parseMonthLabel(a.month) - parseMonthLabel(b.month));
  return records;
}

/**
 * "2025년 3월" → 202503 (정렬용 숫자)
 */
function parseMonthLabel(label) {
  if (!label) return 0;
  const m = label.match(/(\d{4})년\s*(\d{1,2})월/);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

/**
 * 전체 데이터에서 유니크한 선생님 목록 추출
 */
function getTeachers(students) {
  return [...new Set(students.map(s => s.teacher).filter(Boolean))].sort();
}

/**
 * 전체 데이터에서 유니크한 학교 목록 추출
 */
function getSchools(students) {
  return [...new Set(students.map(s => s.school).filter(Boolean))].sort();
}

/**
 * 전체 데이터에서 유니크한 학년 목록 추출
 */
function getGrades(students) {
  return [...new Set(students.map(s => s.grade).filter(Boolean))].sort((a, b) => gradeOrder(a) - gradeOrder(b));
}

/**
 * 전체 데이터에서 유니크한 시행월 목록 추출
 */
function getMonths(students) {
  const months = [...new Set(students.map(s => s.month).filter(Boolean))];
  months.sort((a, b) => parseMonthLabel(b) - parseMonthLabel(a)); // 최신순
  return months;
}

function gradeOrder(grade) {
  const map = { '초1':1,'초2':2,'초3':3,'초4':4,'초5':5,'초6':6,'중1':7,'중2':8,'중3':9,'고1':10,'고2':11,'고3':12 };
  return map[grade] || 99;
}