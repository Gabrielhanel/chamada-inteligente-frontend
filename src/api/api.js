// ============================================================
// api.js — Camada de serviço HTTP
// PRODUÇÃO: Conectado ao servidor Node.js (Porta 3000)
// ============================================================

const BASE_URL = 'http://localhost:3000';

// ── Helpers ─────────────────────────────────────────────────

async function _request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, options ? {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : null
  } : {});
  if (!res.ok) throw new Error("Falha na comunicação com o servidor.");
  return res.json();
}

// ── Auth ────────────────────────────────────────────────────

export async function login(email, password) {
  return await _request('/login', { method: 'POST', body: { email, password } });
}

// ── Students ────────────────────────────────────────────────

export async function getStudents() {
  return await _request('/alunos');
}

export async function createStudent({ name, tagId, email }) {
  // Mapeia para o backend: { uid, nome }
  return await _request('/cadastro/salvar', { method: 'POST', body: { uid: tagId, nome: name } });
}

export async function deleteStudent(studentId) {
  // Opcional: implementar rota no back se necessário
  console.warn("Delete não implementado no backend atual.");
  return { success: true };
}

// ── Attendances ─────────────────────────────────────────────

export async function getAttendances(date) {
  return await _request('/presencas');
}

export async function registerAttendance({ studentId, slotIndex, method = 'manual' }) {
  // Lógica delegada ao backend
  return await _request('/presenca', { method: 'POST', body: { uid: studentId } });
}

export async function registerAttendanceByTag(tagId) {
  // O cálculo de slot/atraso é feito no backend (server.js)
  return await _request('/presenca', { method: 'POST', body: { uid: tagId } });
}

// ── Settings / Session ──────────────────────────────────────

export async function getSettings() {
  return { status: "Sessão Ativa" };
}

export async function startSession() {
  return await _request('/aula/iniciar', { method: 'POST' });
}

export async function resetSession() {
  // Backend não tem rota de reset hoje, mantendo assinatura
  return await startSession();
}

// ── Tag reading (Hardware Feedback) ─────────────────────────

export async function simulateTagRead() {
  // Consulta o status da leitura serial feita pelo Arduino
  return await _request('/cadastro/status');
}

export async function waitForNewTag() {
  // Reaproveita a lógica de status serial
  return await simulateTagRead();
}