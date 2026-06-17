// ============================================================
// views/aluno.js — Painel do Aluno
// ============================================================

import * as API from '../api/api.js';
import Store from '../store/store.js';
import { showToast } from '../components/components.js';
import { formatDate } from '../utils/utils.js';

export async function initAlunoView() {
  const { currentUser } = Store.getState();
  const page = document.getElementById('page-aluno');
  page.innerHTML = buildLayout();
  await loadData(currentUser);
}

async function loadData(user) {
  try {
    const [students, attendances] = await Promise.all([
      API.getStudents(),
      API.getAttendances()
    ]);
    Store.setState({ students, attendances });
    renderStudentPanel(user, students, attendances);
  } catch (e) {
    showToast(`Erro ao carregar dados: ${e.message}`, 'error');
  }
}

function renderStudentPanel(user, students, attendances) {
  // Relaciona o usuário logado com o aluno no banco
  const student = students.find(s => s.id === user.studentId);
  
  if (!student) {
    document.getElementById('aluno-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-msg">Seu cadastro não foi encontrado.<br>Solicite ao professor que faça seu registro.</div>
      </div>`;
    return;
  }

  // Busca o registro de presença atualizado do aluno baseado no uid
  const presenca = attendances.find(a => a.uid === student.uid);
  const maxPresencas = 4; // Fixo conforme o backend

  let statusText = 'AUSENTE';
  let pctColor = 'var(--red)';
  let presencasComputadas = 0;
  let todayChips = '';

  if (presenca) {
    statusText = presenca.status; // 'PRESENTE' ou 'ATRASADO' vindo do backend
    presencasComputadas = maxPresencas - presenca.faltas;
    
    // Cor do texto baseada na quantidade de presenças (4 ou 3 = verde, 1 ou 2 = amarelo, 0 = vermelho)
    pctColor = presencasComputadas >= 3 ? 'var(--green)' : presencasComputadas > 0 ? 'var(--yellow)' : 'var(--red)';
    
    // Renderiza a quantidade de checks (presenças) e X (faltas do atraso)
    todayChips = `
      ${'<div class="chip present" data-tip="Presença confirmada">✓</div>'.repeat(presencasComputadas)}
      ${'<div class="chip absent" data-tip="Falta por atraso">✕</div>'.repeat(presenca.faltas)}
    `;
  } else {
    // Aluno ainda não passou no sensor
    todayChips = '<div class="chip future" data-tip="Sem registro">—</div>'.repeat(maxPresencas);
  }

  const today = new Date().toISOString().split('T')[0];

  document.getElementById('aluno-content').innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--accent-dim);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">
        👤
      </div>
      <div style="flex:1;">
        <div style="font-size:1.1rem;font-weight:700;">${student.name}</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-top:2px;">${student.email || 'Sem e-mail cadastrado'}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;">UID da Tag</div>
        <span class="tag-id" style="font-size:.9rem;">${student.uid}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Situação de Hoje — ${formatDate(today)}</div>
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
        <div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:8px;">Fração de Presenças (Total: 4)</div>
          <div class="slot-chips">${todayChips}</div>
        </div>
        <div style="margin-left:auto;text-align:center;">
          <div style="font-size:2rem;font-weight:800;color:${pctColor};line-height:1;">${presencasComputadas}/${maxPresencas}</div>
          <div style="font-size:.72rem;color:${pctColor}; font-weight:bold; margin-top:5px; text-transform:uppercase;">${statusText}</div>
        </div>
      </div>
      
      ${presenca && presenca.faltas > 0 ? `
        <div style="margin-top:16px;padding:10px 14px;background:var(--yellow-dim);border-radius:var(--radius-sm);font-size:.82rem;color:var(--yellow);">
          <strong>Atenção:</strong> Você teve ${presenca.faltas} falta(s) por registrar sua tag após o horário oficial.
        </div>
      ` : ''}
    </div>
  `;
}

function buildLayout() {
  return `
    <div class="main-content" id="aluno-content">
      <div class="empty-state">
        <div class="empty-state-icon">⏳</div>
        <div class="empty-state-msg">Carregando seus dados…</div>
      </div>
    </div>
  `;
}