// ============================================================
//  store.js — 앱 상태 관리
// ============================================================

const STORAGE_KEY = 'mg_report_settings';

// 기본 학년별 색상
const DEFAULT_GRADE_COLORS = [
  { name: '블루', value: '#3B82F6' },
  { name: '그린', value: '#10B981' },
  { name: '퍼플', value: '#8B5CF6' },
  { name: '오렌지', value: '#F59E0B' },
  { name: '로즈', value: '#EC4899' },
  { name: '틸', value: '#14B8A6' },
];

const AppStore = (() => {
  let state = {
    // 데이터
    allStudents: [],
    currentMonthStudents: [],
    filteredStudents: [],
    selectedStudentIds: new Set(),

    // 필터
    selectedMonth: '',
    filterTeachers: new Set(),   // 다중 선택
    filterGrades: new Set(),     // 다중 선택
    filterSearch: '',

    // 설정
    academyName: '매쓰그립수학학원',
    logoBase64: '',
    gradeColors: {},

    // UI 상태
    isLoaded: false,
    fileName: '',
  };

  const listeners = [];

  function notify() {
    listeners.forEach(fn => fn({ ...state }));
  }

  return {
    getState() {
      return { ...state };
    },

    subscribe(fn) {
      listeners.push(fn);
      return () => {
        const idx = listeners.indexOf(fn);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    // ── 데이터 설정 ──────────────────────────────────────────
    setAllStudents(students, fileName = '') {
      state.allStudents = students;
      state.fileName = fileName;
      state.isLoaded = students.length > 0;

      const months = getUniqueMonths(students);
      if (months.length > 0 && !state.selectedMonth) {
        state.selectedMonth = months[0];
      } else if (!months.includes(state.selectedMonth) && months.length > 0) {
        state.selectedMonth = months[0];
      }

      // 필터 초기화
      state.filterTeachers = new Set();
      state.filterGrades = new Set();

      this.applyFilters();
      notify();
    },

    setSelectedMonth(month) {
      state.selectedMonth = month;
      state.selectedStudentIds = new Set();
      this.applyFilters();
      notify();
    },

    setFilter(key, value) {
      state[key] = value;
      this.applyFilters();
      notify();
    },

    toggleFilterTeacher(teacher) {
      if (state.filterTeachers.has(teacher)) {
        state.filterTeachers.delete(teacher);
      } else {
        state.filterTeachers.add(teacher);
      }
      this.applyFilters();
      notify();
    },

    toggleFilterGrade(grade) {
      if (state.filterGrades.has(grade)) {
        state.filterGrades.delete(grade);
      } else {
        state.filterGrades.add(grade);
      }
      this.applyFilters();
      notify();
    },

    clearFilterTeachers() {
      state.filterTeachers = new Set();
      this.applyFilters();
      notify();
    },

    clearFilterGrades() {
      state.filterGrades = new Set();
      this.applyFilters();
      notify();
    },

    applyFilters() {
      const monthStudents = state.selectedMonth
        ? state.allStudents.filter(s => s.month === state.selectedMonth)
        : state.allStudents;

      state.currentMonthStudents = monthStudents;

      let result = [...monthStudents];

      if (state.filterTeachers.size > 0) {
        result = result.filter(s => state.filterTeachers.has(s.teacher));
      }
      if (state.filterGrades.size > 0) {
        result = result.filter(s => state.filterGrades.has(s.grade));
      }
      if (state.filterSearch) {
        const q = state.filterSearch.toLowerCase();
        result = result.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.school.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
        );
      }

      state.filteredStudents = result;
    },

    // ── 선택 관리 ──────────────────────────────────────────
    toggleSelect(studentKey) {
      if (state.selectedStudentIds.has(studentKey)) {
        state.selectedStudentIds.delete(studentKey);
      } else {
        state.selectedStudentIds.add(studentKey);
      }
      notify();
    },

    selectAll() {
      state.selectedStudentIds = new Set(
        state.filteredStudents.map(s => makeKey(s))
      );
      notify();
    },

    clearSelection() {
      state.selectedStudentIds = new Set();
      notify();
    },

    getSelectedStudents() {
      return state.currentMonthStudents.filter(s =>
        state.selectedStudentIds.has(makeKey(s))
      );
    },

    // ── 설정 저장/로드 ──────────────────────────────────────
    loadSettings() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          state.academyName = parsed.academyName || '매쓰그립수학학원';
          state.logoBase64 = parsed.logoBase64 || '';
          state.gradeColors = parsed.gradeColors || {};
        }
      } catch (e) {
        console.warn('[Store] 설정 로드 실패:', e);
      }
    },

    saveSettings(settings) {
      if (settings.academyName !== undefined) state.academyName = settings.academyName;
      if (settings.logoBase64 !== undefined) state.logoBase64 = settings.logoBase64;
      if (settings.gradeColors !== undefined) state.gradeColors = settings.gradeColors;

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          academyName: state.academyName,
          logoBase64: state.logoBase64,
          gradeColors: state.gradeColors,
        }));
      } catch (e) {
        console.warn('[Store] 설정 저장 실패:', e);
      }
      notify();
    },

    setGradeColor(teacher, color) {
      state.gradeColors = { ...state.gradeColors, [teacher]: color };
      this.saveSettings({});
      notify();
    },

    getGradeColor(teacher) {
      return state.gradeColors[teacher] || null;
    },
  };
})();

// 복합 키 생성 (id + month)
function makeKey(student) {
  return `${student.id}::${student.month}`;
}

// 유니크 월 목록 (최신순)
function getUniqueMonths(students) {
  const months = [...new Set(students.map(s => s.month).filter(Boolean))];
  months.sort((a, b) => parseMonthLabel(b) - parseMonthLabel(a));
  return months;
}



// default export: AppStore;