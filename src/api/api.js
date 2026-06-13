// ============================================================
// api.js — Camada de serviço HTTP
// MOCK: lê/escreve no db.json em memória.
// Para produção: trocar BASE_URL e remover _mockDb.
// ============================================================

const BASE_URL = '/api'; // trocar para URL real do Flask

// ── Mock in-memory (substitui chamadas HTTP durante dev) ────

let _mockDb = null;

async function _loadMock() {
  if (_mockDb) return _mockDb;
  const res = await fetch('../data/db.json');
  _mockDb = await res.json();
  // Inicia sessão se não houver uma
  if (!_mockDb.settings.sessionStartTime) {
    _mockDb.settings.sessionStartTime = new Date().toISOString();
  }
  return _mockDb;
}

function _saveMock(db) {
  _mockDb = db;
  // Em produção, isso seria um POST/PUT para o backend
}

// ── Helpers ─────────────────────────────────────────────────

function _delay(ms = 120) {
  return new Promise(r => setTimeout(r, ms));
}

function _generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Auth ────────────────────────────────────────────────────

export async function login(email, password) {
  await _delay();
  const db = await _loadMock();
  const user = db.users.find(u => u.email === email && u.password === password);
  if (!user) throw new Error('Credenciais inválidas.');
  // Não retornamos a senha
  const { password: _, ...safeUser } = user;
  return safeUser;
}

// ── Students ────────────────────────────────────────────────

export async function getStudents() {
  await _delay();
  const db = await _loadMock();
  return [...db.students];
}

export async function createStudent({ name, tagId, email }) {
  await _delay();
  const db = await _loadMock();

  // Validações
  if (db.students.find(s => s.tagId === tagId)) {
    throw new Error(`Tag ${tagId} já está cadastrada para outro aluno.`);
  }
  if (email && db.students.find(s => s.email === email)) {
    throw new Error(`E-mail ${email} já cadastrado.`);
  }

  const newStudent = {
    id: _generateId('s'),
    name: name.trim(),
    tagId: tagId.trim().toUpperCase(),
    email: email?.trim() || '',
  };

  db.students.push(newStudent);
  _saveMock(db);
  return newStudent;
}

export async function deleteStudent(studentId) {
  await _delay();
  const db = await _loadMock();
  db.students = db.students.filter(s => s.id !== studentId);
  _saveMock(db);
  return { success: true };
}

// ── Attendances ─────────────────────────────────────────────

export async function getAttendances(date) {
  await _delay();
  const db = await _loadMock();
  const target = date || new Date().toISOString().split('T')[0];
  return db.attendances.filter(a => a.date === target);
}

export async function registerAttendance({ studentId, slotIndex, method = 'manual' }) {
  await _delay(200);
  const db = await _loadMock();

  const today = new Date().toISOString().split('T')[0];
  const student = db.students.find(s => s.id === studentId);
  if (!student) throw new Error('Aluno não encontrado.');

  // Verifica duplicata na mesma faixa
  const duplicate = db.attendances.find(
    a => a.studentId === studentId && a.date === today && a.slotIndex === slotIndex
  );
  if (duplicate) {
    throw new Error(
      `Presença já registrada para ${student.name} na faixa ${slotIndex + 1} de hoje.`
    );
  }

  const record = {
    id: _generateId('att'),
    studentId,
    tagId: student.tagId,
    date: today,
    slotIndex,
    timestamp: new Date().toISOString(),
    method,
  };

  db.attendances.push(record);
  _saveMock(db);
  return record;
}

export async function registerAttendanceByTag(tagId) {
  await _delay(200);
  const db = await _loadMock();

  const student = db.students.find(s => s.tagId === tagId.toUpperCase());
  if (!student) throw new Error(`Tag ${tagId} não está cadastrada.`);

  // Slot atual calculado via sessionStartTime
  const settings = db.settings;
  const start = new Date(settings.sessionStartTime).getTime();
  const elapsed = (Date.now() - start) / 1000;
  const slotIndex = Math.min(
    Math.floor(elapsed / settings.slotDurationSeconds),
    settings.totalSlots - 1
  );

  return registerAttendance({ studentId: student.id, slotIndex, method: 'rfid' });
}

// ── Settings / Session ──────────────────────────────────────

export async function getSettings() {
  await _delay();
  const db = await _loadMock();
  return { ...db.settings };
}

export async function startSession() {
  await _delay();
  const db = await _loadMock();
  db.settings.sessionStartTime = new Date().toISOString();
  _saveMock(db);
  return { ...db.settings };
}

export async function resetSession() {
  await _delay();
  const db = await _loadMock();
  db.settings.sessionStartTime = new Date().toISOString();
  db.attendances = db.attendances.filter(
    a => a.date !== new Date().toISOString().split('T')[0]
  );
  _saveMock(db);
  return { ...db.settings };
}

// ── Tag reading (simula leitura RFID via backend) ────────────

export async function simulateTagRead() {
  await _delay(800);
  const db = await _loadMock();
  // Retorna uma tag aleatória do banco (simula Arduino enviando tag)
  const tags = db.students.map(s => s.tagId);
  const fakeTag = tags[Math.floor(Math.random() * tags.length)];
  // Em produção: GET /api/rfid/pending
  return { tagId: fakeTag };
}

export async function waitForNewTag() {
  await _delay(1500);
  // Gera um ID de tag novo (não cadastrado) — simula novo cartão
  const chars = '0123456789ABCDEF';
  let tag = '';
  for (let i = 0; i < 8; i++) tag += chars[Math.floor(Math.random() * chars.length)];
  return { tagId: tag };
}