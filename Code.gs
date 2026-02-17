/**
 * gas-mcp-server — Main Entry Point
 * Claude/AI 에이전트 ↔ Google Workspace MCP 서버
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HTTP Handlers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { apiKey, action, params } = body;

    // 인증
    if (!apiKey || apiKey !== CONFIG.API_KEY) {
      return _json(401, { error: 'Unauthorized: invalid API key' });
    }

    // Origin 체크
    if (CONFIG.ALLOWED_ORIGINS.length > 0) {
      const origin = e.parameter._origin || '';
      if (!CONFIG.ALLOWED_ORIGINS.includes(origin)) {
        return _json(403, { error: 'Forbidden: origin not allowed' });
      }
    }

    if (!action) {
      return _json(400, { error: 'Missing "action" field' });
    }

    // 서비스 활성 확인
    const [service] = action.split('.');
    if (CONFIG.SERVICES[service] === false) {
      return _json(403, { error: `Service "${service}" is disabled` });
    }

    // 로깅
    if (CONFIG.LOG_ENABLED) {
      console.log(`MCP ← ${action}`, JSON.stringify(params || {}).slice(0, 500));
    }

    // 라우팅
    const handler = ROUTES[action];
    if (!handler) {
      return _json(400, { error: `Unknown action: ${action}` });
    }

    const result = handler(params || {});
    return _json(200, { ok: true, data: result });

  } catch (err) {
    console.error('doPost error:', err);
    return _json(500, { error: err.message || String(err) });
  }
}

function doGet() {
  return _json(200, {
    service: 'gas-mcp-server',
    version: '1.0.0',
    status: 'running',
    actions: Object.keys(ROUTES),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Route Map
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ROUTES = {
  'sheets.read':      sheetsRead,
  'sheets.write':     sheetsWrite,
  'sheets.append':    sheetsAppend,
  'docs.read':        docsRead,
  'docs.create':      docsCreate,
  'drive.list':       driveList,
  'drive.upload':     driveUpload,
  'gmail.send':       gmailSend,
  'gmail.search':     gmailSearch,
  'calendar.list':    calendarList,
  'calendar.create':  calendarCreate,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sheets
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sheetsRead(p) {
  _require(p, ['spreadsheetId', 'range']);
  const ss = SpreadsheetApp.openById(p.spreadsheetId);
  const values = ss.getRange(p.range).getValues();
  return { values };
}

function sheetsWrite(p) {
  _require(p, ['spreadsheetId', 'range', 'values']);
  const ss = SpreadsheetApp.openById(p.spreadsheetId);
  const range = ss.getRange(p.range);
  range.setValues(p.values);
  return { updatedRange: p.range, updatedRows: p.values.length };
}

function sheetsAppend(p) {
  _require(p, ['spreadsheetId', 'values']);
  const ss = SpreadsheetApp.openById(p.spreadsheetId);
  const sheet = p.sheetName ? ss.getSheetByName(p.sheetName) : ss.getActiveSheet();
  if (!sheet) throw new Error(`Sheet "${p.sheetName}" not found`);
  const rows = Array.isArray(p.values[0]) ? p.values : [p.values];
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { appendedRows: rows.length };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Docs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function docsRead(p) {
  _require(p, ['documentId']);
  const doc = DocumentApp.openById(p.documentId);
  return { title: doc.getName(), body: doc.getBody().getText() };
}

function docsCreate(p) {
  _require(p, ['title']);
  const doc = DocumentApp.create(p.title);
  if (p.body) doc.getBody().setText(p.body);
  return { documentId: doc.getId(), url: doc.getUrl() };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Drive
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function driveList(p) {
  const folderId = p.folderId || CONFIG.DEFAULT_DRIVE_FOLDER || 'root';
  const folder = folderId === 'root' ? DriveApp.getRootFolder() : DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const results = [];
  let count = 0;
  while (files.hasNext() && count < (p.maxResults || CONFIG.MAX_RESULTS)) {
    const f = files.next();
    results.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType(), size: f.getSize() });
    count++;
  }
  return { files: results, count };
}

function driveUpload(p) {
  _require(p, ['fileName', 'content']);
  const blob = Utilities.newBlob(
    p.base64 ? Utilities.base64Decode(p.content) : p.content,
    p.mimeType || 'text/plain',
    p.fileName
  );
  let file;
  if (p.folderId) {
    file = DriveApp.getFolderById(p.folderId).createFile(blob);
  } else if (CONFIG.DEFAULT_DRIVE_FOLDER) {
    file = DriveApp.getFolderById(CONFIG.DEFAULT_DRIVE_FOLDER).createFile(blob);
  } else {
    file = DriveApp.createFile(blob);
  }
  return { fileId: file.getId(), url: file.getUrl() };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gmail
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function gmailSend(p) {
  _require(p, ['to', 'subject', 'body']);
  const opts = {};
  if (p.cc) opts.cc = p.cc;
  if (p.bcc) opts.bcc = p.bcc;
  if (p.htmlBody) opts.htmlBody = p.htmlBody;
  if (p.name) opts.name = p.name;
  GmailApp.sendEmail(p.to, p.subject, p.body, opts);
  return { sent: true, to: p.to };
}

function gmailSearch(p) {
  _require(p, ['query']);
  const threads = GmailApp.search(p.query, 0, p.maxResults || 10);
  return {
    threads: threads.map(t => ({
      id: t.getId(),
      subject: t.getFirstMessageSubject(),
      lastDate: t.getLastMessageDate().toISOString(),
      messageCount: t.getMessageCount(),
      snippet: t.getMessages()[0].getPlainBody().slice(0, 200),
    })),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Calendar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function calendarList(p) {
  const cal = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const start = p.startDate ? new Date(p.startDate) : now;
  const end = p.endDate ? new Date(p.endDate) : new Date(now.getTime() + 7 * 86400000);
  const events = cal.getEvents(start, end);
  return {
    events: events.slice(0, p.maxResults || CONFIG.MAX_RESULTS).map(e => ({
      id: e.getId(),
      title: e.getTitle(),
      start: e.getStartTime().toISOString(),
      end: e.getEndTime().toISOString(),
      location: e.getLocation(),
      description: e.getDescription(),
    })),
  };
}

function calendarCreate(p) {
  _require(p, ['title', 'startTime', 'endTime']);
  const cal = CalendarApp.getDefaultCalendar();
  const opts = {};
  if (p.location) opts.location = p.location;
  if (p.description) opts.description = p.description;
  const event = cal.createEvent(p.title, new Date(p.startTime), new Date(p.endTime), opts);
  return { eventId: event.getId(), title: p.title };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function _require(params, keys) {
  for (const k of keys) {
    if (params[k] === undefined || params[k] === null || params[k] === '') {
      throw new Error(`Missing required param: "${k}"`);
    }
  }
}

function _json(status, payload) {
  return ContentService
    .createTextOutput(JSON.stringify({ status, ...payload }))
    .setMimeType(ContentService.MimeType.JSON);
}
