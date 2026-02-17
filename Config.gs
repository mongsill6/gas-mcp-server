/**
 * gas-mcp-server — Configuration
 * 배포 전 반드시 API_KEY를 변경하세요.
 */

const CONFIG = {
  // ── 인증 ──
  API_KEY: 'CHANGE_ME_TO_A_SECURE_RANDOM_STRING',

  // ── 허용 도메인/IP (빈 배열 = 제한 없음) ──
  ALLOWED_ORIGINS: [],
  // 예: ['https://your-app.com', 'https://claude.ai']

  // ── 서비스 ON/OFF ──
  SERVICES: {
    sheets:   true,
    docs:     true,
    drive:    true,
    gmail:    true,
    calendar: true,
  },

  // ── 기본값 ──
  DEFAULT_DRIVE_FOLDER: '',       // Drive 기본 폴더 ID (빈 문자열 = 루트)
  MAX_RESULTS: 100,               // 목록 조회 최대 건수
  LOG_ENABLED: true,              // 요청 로깅
};
