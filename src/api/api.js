// ============================================================
// api/api.js — Camada de serviço HTTP + WebSocket
// ============================================================

const BASE_URL = 'http://localhost:3000';
const WS_URL   = 'ws://localhost:5000';

// ── Auth ─────────────────────────────────────────────────────

// role: 'professor' | 'aluno'
export async function login(email, password, role = 'professor') {
  const res = await fetch(`${BASE_URL}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, senha: password, role }),
  });
  if (!res.ok) throw new Error('Credenciais inválidas ou erro no servidor.');
  return await res.json();
}

// ── Students ──────────────────────────────────────────────────

export async function getStudents() {
  const res = await fetch(`${BASE_URL}/alunos`);
  if (!res.ok) throw new Error('Erro ao buscar alunos');
  return await res.json();
}

// createStudent: { uid, nome, email, senha }
export async function createStudent({ uid, nome, email, senha }) {
  const res = await fetch(`${BASE_URL}/cadastro/salvar`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ uid, nome, email, senha }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.erro || 'Erro ao cadastrar aluno.');
  }
  return await res.json();
}

export async function deleteStudent(studentId) {
  const res = await fetch(`${BASE_URL}/alunos/${studentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erro ao deletar aluno');
  return { success: true };
}

// ── Attendances ───────────────────────────────────────────────

// data: 'YYYY-MM-DD' (padrão: hoje)
export async function getAttendances(date) {
  const target = date || new Date().toISOString().split('T')[0];
  const res    = await fetch(`${BASE_URL}/presencas?data=${target}`);
  if (!res.ok) throw new Error('Erro ao buscar presenças');
  return await res.json();
}

// Registrar presença via RFID (Arduino → backend)
// Body: { uid }
export async function registerAttendance({ uid }) {
  const res = await fetch(`${BASE_URL}/presenca`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ uid }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.erro || 'Erro ao registrar presença.');
  }
  return await res.json();
}

// Registrar presença manualmente pelo professor
// Body: { uid }
export async function registerAttendanceManual({ uid }) {
  const res = await fetch(`${BASE_URL}/presencas/manual`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ uid }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.erro || 'Erro ao registrar presença manual.');
  }
  return await res.json();
}

// ── Settings / Session ────────────────────────────────────────

export async function getSettings() {
  const res = await fetch(`${BASE_URL}/configuracoes`);
  if (!res.ok) return { sessionActive: false };
  return await res.json();
}

export async function startSession() {
  const res = await fetch(`${BASE_URL}/sessao/iniciar`, { method: 'POST' });
  if (!res.ok) throw new Error('Erro ao iniciar sessão');
  return await res.json();
}

export async function resetSession() {
  const res = await fetch(`${BASE_URL}/sessao/reiniciar`, { method: 'POST' });
  if (!res.ok) throw new Error('Erro ao reiniciar sessão');
  return await res.json();
}

// ── Hardware / Cadastro ───────────────────────────────────────

// Coloca o Arduino em modo cadastro e retorna ok.
// O UID lido chegará via WebSocket (veja connectWebSocket abaixo).
export async function iniciarModoCadastroArduino() {
  const res = await fetch(`${BASE_URL}/cadastro/iniciar`, { method: 'POST' });
  if (!res.ok) throw new Error('Erro ao comunicar com o hardware.');
  return await res.json();
}

// Alias mantido para compatibilidade com professor.js
export const startHardwareRegistration = iniciarModoCadastroArduino;

// ── WebSocket — receber UID lido pelo Arduino em tempo real ───

// Uso:
//   const ws = connectWebSocket(({ uid }) => {
//     console.log('UID lido:', uid);
//   });
//   // Para desconectar: ws.close();
//
export function connectWebSocket(onUidLido) {
  const ws = new WebSocket(WS_URL);

  ws.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.tipo === 'uid_lido' && data.uid) {
        onUidLido(data);
      }
    } catch (_) {
      // mensagem não-JSON — ignora
    }
  });

  ws.addEventListener('error', (err) => {
    console.error('WebSocket erro:', err);
  });

  return ws;
}