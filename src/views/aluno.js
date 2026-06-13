// ============================================================
// views/aluno.js — Painel do Aluno
// ============================================================

import * as API from '../api/api.js';
import Store from '../store/store.js';
import { showToast } from '../components/components.js';
import { computeCurrentSlot, formatDate, formatTime, buildAttendanceMatrix } from '../utils/utils.js';

export async function initAlunoView() {
  const { currentUser } = Store.getState();
  const page = document.getElementById('page-aluno');
  page.innerHTML = buildLayout(currentUser);
  await loadData(currentUser);
}

async function loadData(user) {
  try {
    const [students, attendances, settings] = await Promise.all([
      API.getStudents(),
      API.getAttendances(),
      API.getSettings(),
    ]);
    Store.setState({ students, attendances, settings });
    renderStudentPanel(user, students, attendances, settings);
  } catch (e) {
    showToast(`Erro ao carregar dados: ${e.message}`, 'error');
  }
}

function renderStudentPanel(user, students, attendances, settings) {
  const student = students.find(s => s.id === user.studentId);
  if (!student) {
    document.getElementById('aluno-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-msg">Seu cadastro não foi encontrado.<br>Solicite ao professor que faça seu registro.</div>
      </div>`;
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const myAtt  = attendances.filter(a => a.studentId === student.id);
  const todayAtt = myAtt.filter(a => a.date === today);

  const { slotIndex, secondsLeft, finished } = settings.sessionStartTime
    ? computeCurrentSlot(settings.sessionStartTime, settings.slotDurationSeconds, settings.totalSlots)
    : { slotIndex: -1, secondsLeft: 0, finished: false };

  // Histórico agrupado por data
  const byDate = {};
  myAtt.forEach(a => {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  // Status hoje
  const todayPresent = todayAtt.length;
  const todayPct = settings.totalSlots
    ? Math.round((todayPresent / settings.totalSlots) * 100)
    : 0;

  // Render slot chips de hoje
  const todayChips = Array.from({ length: settings.totalSlots }, (_, i) => {
    const rec = todayAtt.find(a => a.slotIndex === i);
    if (rec) return `<div class="chip present" data-tip="${formatTime(rec.timestamp)}">✓</div>`;
    if (i < slotIndex || finished) return `<div class="chip absent" data-tip="Ausente">✕</div>`;
    if (i === slotIndex) return `<div class="chip pending" data-tip="Em andamento">…</div>`;
    return `<div class="chip future" data-tip="Faixa futura">—</div>`;
  }).join('');

  const pctColor = todayPct >= 75 ? 'var(--green)' : todayPct >= 50 ? 'var(--yellow)' : 'var(--red)';

  // Render histórico
  const historyRows = dates.length ? dates.map(date => {
    const recs = byDate[date];
    const chips = Array.from({ length: settings.totalSlots }, (_, i) => {
      const rec = recs.find(a => a.slotIndex === i);
      return rec
        ? `<span class="chip present" data-tip="${formatTime(rec.timestamp)} • ${rec.method === 'rfid' ? 'RFID' : 'Manual'}">✓</span>`
        : `<span class="chip absent" data-tip="Ausente">✕</span>`;
    }).join('');
    const p = recs.length;
    const col = p === settings.totalSlots ? 'var(--green)' : p >= settings.totalSlots / 2 ? 'var(--yellow)' : 'var(--red)';
    return `
      <tr>
        <td>${formatDate(date)}</td>
        <td><div class="slot-chips">${chips}</div></td>
        <td style="color:${col};font-weight:600;">${p}/${settings.totalSlots}</td>
      </tr>`;
  }).join('') : `
    <tr>
      <td colspan="3">
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <div class="empty-state-msg">Nenhuma presença registrada ainda.</div>
        </div>
      </td>
    </tr>`;

  document.getElementById('aluno-content').innerHTML = `
    <!-- Card do aluno -->
    <div class="card" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--accent-dim);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">
        👤
      </div>
      <div style="flex:1;">
        <div style="font-size:1.1rem;font-weight:700;">${student.name}</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-top:2px;">${student.email || 'Sem e-mail cadastrado'}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;">Tag ID</div>
        <span class="tag-id" style="font-size:.9rem;">${student.tagId}</span>
      </div>
    </div>

    <!-- Hoje -->
    <div class="card">
      <div class="card-title">Hoje — ${formatDate(today)}</div>
      ${settings.sessionStartTime ? `
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div>
            <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:8px;">Faixas registradas</div>
            <div class="slot-chips">${todayChips}</div>
          </div>
          <div style="margin-left:auto;text-align:center;">
            <div style="font-size:2rem;font-weight:800;color:${pctColor};line-height:1;">${todayPresent}/${settings.totalSlots}</div>
            <div style="font-size:.72rem;color:var(--text-muted);">presenças</div>
          </div>
        </div>
        ${!finished && slotIndex >= 0 ? `
          <div style="margin-top:16px;padding:10px 14px;background:var(--accent-dim);border-radius:var(--radius-sm);font-size:.82rem;color:var(--accent);">
            <strong>Faixa ${slotIndex + 1} em andamento</strong> — ${secondsLeft}s restantes
          </div>` : ''}
        ${finished ? `
          <div style="margin-top:16px;padding:10px 14px;background:var(--green-dim);border-radius:var(--radius-sm);font-size:.82rem;color:var(--green);">
            ✓ Sessão encerrada
          </div>` : ''}
      ` : `
        <div style="color:var(--text-muted);font-size:.875rem;">
          Sessão ainda não iniciada pelo professor.
        </div>`}
    </div>

    <!-- Histórico -->
    <div class="card" style="padding:0;">
      <div style="padding:20px 24px 16px;">
        <div class="section-title">Histórico de Presenças</div>
      </div>
      <div class="attendance-table-wrap">
        <table class="attendance-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Faixas</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function buildLayout(user) {
  return `
    <div class="main-content" id="aluno-content">
      <div class="empty-state">
        <div class="empty-state-icon">⏳</div>
        <div class="empty-state-msg">Carregando seus dados…</div>
      </div>
    </div>
  `;
}