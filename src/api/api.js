// ============================================================
// api.js — Camada de serviço HTTP
// Comunicação real com o backend
// ============================================================

const BASE_URL = 'http://localhost:5000'; // Ajuste para a porta do seu backend

// ── Auth ────────────────────────────────────────────────────

export async function login(email, password) {
  // Exemplo chamando uma rota de login real
  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  if (!res.ok) throw new Error('Credenciais inválidas ou erro no servidor.');
  return await res.json();
}

// ── Students ────────────────────────────────────────────────

export async function getStudents() {
  const res = await fetch(`${BASE_URL}/alunos`);
  if (!res.ok) throw new Error('Erro ao buscar alunos');
  return await res.json();
}

export async function createStudent({ name, tagId, email }) {
  // Utilizando a rota mencionada anteriormente
  const res = await fetch(`${BASE_URL}/cadastro/salvar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: tagId, nome: name, email }) // Ajustado para o payload esperado
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Erro ao cadastrar aluno.');
  }
  return await res.json();
}

export async function deleteStudent(studentId) {
  const res = await fetch(`${BASE_URL}/alunos/${studentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erro ao deletar aluno');
  return { success: true };
}

// ── Attendances ─────────────────────────────────────────────

export async function getAttendances(date) {
  // Caso o backend aceite filtro de data via query string: /presencas?data=YYYY-MM-DD
  const target = date || new Date().toISOString().split('T')[0];
  const res = await fetch(`${BASE_URL}/presencas?data=${target}`);
  if (!res.ok) throw new Error('Erro ao buscar presenças');
  return await res.json();
}

export async function registerAttendanceManual({ studentId }) {
  // Lançar presença manual se o professor clicar no front-end
  const res = await fetch(`${BASE_URL}/presencas/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId })
  });
  if (!res.ok) throw new Error('Erro ao registrar presença manual.');
  return await res.json();
}

// ── Settings / Session ──────────────────────────────────────

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

// ── Tag reading (Comunicação com Arduino via Back-end) ──────

export async function iniciarModoCadastroArduino() {
  // Dispara o comando para o backend avisar o Arduino para ler uma nova tag
  const res = await fetch(`${BASE_URL}/cadastro/iniciar`, { method: 'POST' });
  if (!res.ok) throw new Error('Erro ao comunicar com o hardware.');
  return await res.json();
}