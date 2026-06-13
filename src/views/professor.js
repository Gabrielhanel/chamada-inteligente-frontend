// ============================================================
// views/professor.js — Dashboard do Professor
// ============================================================

import * as API from '../api/api.js';
import Store from '../store/store.js';
import { showToast, openModal, closeModal, createModal, setButtonLoading, createAutocomplete, initTabs, confirmAction } from '../components/components.js';
import { computeCurrentSlot, buildAttendanceMatrix, getAbsentStudents, formatTime, formatDate } from '../utils/utils.js';

let _tickInterval   = null;
let _refreshTimeout = null;
let _acInstance     = null;  // autocomplete instance

// ── Entry point ───────────────────────────────────────────────

export async function initProfessorView() {
  const page = document.getElementById('page-professor');
  page.innerHTML = buildLayout();
  initTabs(page);
  await loadData();
  renderAll();
  startTick();
  bindActions();
}

// ── Data loading ──────────────────────────────────────────────

async function loadData() {
  Store.setState({ isLoading: true });
  try {
    const [students, attendances, settings] = await Promise.all([
      API.getStudents(),
      API.getAttendances(),
      API.getSettings(),
    ]);
    Store.setState({ students, attendances, settings });
  } catch (e) {
    showToast(`Erro ao carregar dados: ${e.message}`, 'error');
  } finally {
    Store.setState({ isLoading: false });
  }
}

// ── Tick engine (atualiza a cada segundo) ─────────────────────

function startTick() {
  stopTick();
  _tickInterval = setInterval(() => {
    renderSlotTimeline();
    renderStats();
    checkSlotTransition();
  }, 1000);
}

function stopTick() {
  if (_tickInterval) clearInterval(_tickInterval);
}

let _lastSlot = -1;
function checkSlotTransition() {
  const { settings } = Store.getState();
  if (!settings.sessionStartTime) return;
  const { slotIndex, finished } = computeCurrentSlot(
    settings.sessionStartTime,
    settings.slotDurationSeconds,
    settings.totalSlots
  );
  if (slotIndex !== _lastSlot) {
    _lastSlot = slotIndex;
    if (!finished) {
      showToast(`🔔 Faixa ${slotIndex + 1} de ${settings.totalSlots} iniciada!`, 'info');
      refreshAttendances();
    } else {
      showToast('✅ Sessão encerrada! Todas as faixas foram concluídas.', 'success', 5000);
      stopTick();
    }
  }
}

async function refreshAttendances() {
  const attendances = await API.getAttendances();
  Store.setState({ attendances });
  renderAttendanceTable();
  renderStats();
}

// ── Render helpers ────────────────────────────────────────────

function renderAll() {
  renderSlotTimeline();
  renderAttendanceTable();
  renderStats();
  renderStudentList();
}

function renderStats() {
  const { students, attendances, settings } = Store.getState();
  if (!settings.sessionStartTime) return;

  const { slotIndex, finished } = computeCurrentSlot(
    settings.sessionStartTime,
    settings.slotDurationSeconds,
    settings.totalSlots
  );
  const today = new Date().toISOString().split('T')[0];
  const todayAtt = attendances.filter(a => a.date === today);
  const currentSlotAtt = todayAtt.filter(a => a.slotIndex === slotIndex);
  const presentToday = new Set(todayAtt.map(a => a.studentId)).size;

  setEl('stat-total',    students.length);
  setEl('stat-present',  presentToday);
  setEl('stat-absent',   students.length - presentToday);
  setEl('stat-slot-att', `${currentSlotAtt.length}/${students.length}`);
}

function renderSlotTimeline() {
  const { settings } = Store.getState();
  const timeline = document.getElementById('slot-timeline');
  if (!timeline || !settings.sessionStartTime) return;

  const { slotIndex, secondsLeft, finished } = computeCurrentSlot(
    settings.sessionStartTime,
    settings.slotDurationSeconds,
    settings.totalSlots
  );

  let html = '';
  for (let i = 0; i < settings.totalSlots; i++) {
    let stateClass = 'upcoming';
    let statusText = 'Aguardando';
    let timerHtml  = '';

    if (finished || i < slotIndex) {
      stateClass = 'done';
      statusText = 'Encerrada';
    } else if (i === slotIndex && !finished) {
      stateClass = 'active';
      const pct = ((settings.slotDurationSeconds - secondsLeft) / settings.slotDurationSeconds) * 100;
      const circ = 2 * Math.PI * 10; // r=10
      const dash = circ * (pct / 100);
      statusText = `${secondsLeft}s restantes`;
      timerHtml = `
        <svg class="timer-ring" viewBox="0 0 24 24">
          <circle class="track" cx="12" cy="12" r="10"/>
          <circle class="fill" cx="12" cy="12" r="10"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${circ - dash}"
            transform="rotate(-90 12 12)"/>
        </svg>`;
    }

    html += `
      <div class="slot-card ${stateClass}">
        ${timerHtml}
        <div class="slot-num">Faixa ${i + 1}</div>
        <div class="slot-label">${String(i + 1).padStart(2,'0')}</div>
        <div class="slot-status">${statusText}</div>
      </div>`;
  }
  timeline.innerHTML = html;
}

function renderAttendanceTable() {
  const { students, attendances, settings } = Store.getState();
  const tbody = document.getElementById('att-tbody');
  if (!tbody) return;

  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-msg">Nenhum aluno cadastrado</div></td></tr>`;
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const todayAtt = attendances.filter(a => a.date === today);
  const { slotIndex, finished } = settings.sessionStartTime
    ? computeCurrentSlot(settings.sessionStartTime, settings.slotDurationSeconds, settings.totalSlots)
    : { slotIndex: 0, finished: false };

  const matrix = buildAttendanceMatrix(students, todayAtt, settings.totalSlots);

  tbody.innerHTML = matrix.map(({ student, slots, presentCount }) => {
    const chips = slots.map((s, i) => {
      let cls, label, tip;
      if (s.present) {
        cls = 'present'; label = '✓';
        tip = `${i < slotIndex || finished ? '' : ''}${formatTime(s.timestamp)} • ${s.method === 'rfid' ? 'RFID' : 'Manual'}`;
      } else if (i < slotIndex || finished) {
        cls = 'absent'; label = '✕'; tip = 'Ausente';
      } else if (i === slotIndex && !finished) {
        cls = 'pending'; label = '…'; tip = 'Em andamento';
      } else {
        cls = 'future'; label = '—'; tip = 'Faixa futura';
      }
      return `<span class="chip ${cls}" data-tip="${tip}">${label}</span>`;
    }).join('');

    const pct = Math.round((presentCount / settings.totalSlots) * 100);
    const pctColor = pct >= 75 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';

    return `
      <tr>
        <td><span class="student-name">${student.name}</span></td>
        <td><span class="tag-id">${student.tagId}</span></td>
        <td><div class="slot-chips">${chips}</div></td>
        <td style="color:${pctColor};font-weight:600;">${presentCount}/${settings.totalSlots}</td>
      </tr>`;
  }).join('');
}

function renderStudentList() {
  const { students } = Store.getState();
  const list = document.getElementById('student-list-body');
  if (!list) return;

  if (!students.length) {
    list.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-msg">Nenhum aluno cadastrado ainda.</div></div></td></tr>`;
    return;
  }

  list.innerHTML = students.map(s => `
    <tr>
      <td><span class="student-name">${s.name}</span></td>
      <td><span class="tag-id">${s.tagId}</span></td>
      <td>
        <button class="btn btn-danger btn-sm" data-delete="${s.id}" title="Remover aluno">
          🗑
        </button>
      </td>
    </tr>
  `).join('');

  // Bind delete buttons
  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteStudent(btn.dataset.delete));
  });
}

// ── Actions ───────────────────────────────────────────────────

function bindActions() {
  // Iniciar / Resetar sessão
  document.getElementById('btn-start-session')?.addEventListener('click', handleStartSession);
  document.getElementById('btn-reset-session')?.addEventListener('click', handleResetSession);

  // Cadastro manual de presença
  document.getElementById('btn-manual-att')?.addEventListener('click', openManualAttModal);

  // Cadastro de aluno
  document.getElementById('btn-add-student')?.addEventListener('click', openAddStudentModal);

  // Refresh
  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    await loadData();
    renderAll();
    showToast('Dados atualizados!', 'success');
  });
}

async function handleStartSession() {
  const btn = document.getElementById('btn-start-session');
  setButtonLoading(btn, true);
  try {
    const settings = await API.startSession();
    Store.setState({ settings });
    _lastSlot = -1;
    startTick();
    renderAll();
    showToast('Sessão iniciada! Faixa 1 em andamento.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleResetSession() {
  const ok = await confirmAction('Isso irá apagar todas as presenças de hoje e reiniciar o timer. Continuar?');
  if (!ok) return;
  try {
    const settings = await API.resetSession();
    Store.setState({ settings, attendances: [] });
    _lastSlot = -1;
    startTick();
    renderAll();
    showToast('Sessão reiniciada.', 'info');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function handleDeleteStudent(studentId) {
  const { students } = Store.getState();
  const s = students.find(x => x.id === studentId);
  const ok = await confirmAction(`Remover <b>${s?.name}</b>? As presenças do aluno serão mantidas.`);
  if (!ok) return;
  try {
    await API.deleteStudent(studentId);
    Store.setState({ students: students.filter(x => x.id !== studentId) });
    renderStudentList();
    renderStats();
    showToast('Aluno removido.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Modal: Presença Manual ────────────────────────────────────

function openManualAttModal() {
  const { settings, students, attendances } = Store.getState();
  if (!settings.sessionStartTime) {
    showToast('Inicie a sessão primeiro.', 'warn');
    return;
  }
  const { slotIndex, finished } = computeCurrentSlot(
    settings.sessionStartTime, settings.slotDurationSeconds, settings.totalSlots
  );
  if (finished) {
    showToast('A sessão já foi encerrada.', 'warn');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const absent = getAbsentStudents(students, attendances, slotIndex);

  const modal = createModal({
    id: 'modal-manual-att',
    title: '📝 Registrar presença manual',
    bodyHtml: `
      <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px;">
        Faixa <strong style="color:var(--accent)">${slotIndex + 1}</strong> em andamento •
        Data: <strong>${formatDate(today)}</strong>
      </p>
      <div class="form-group">
        <label class="form-label">Buscar aluno ausente</label>
        <div class="autocomplete-wrap">
          <input type="text" id="manual-att-search" class="form-input" placeholder="Digite o nome do aluno…" autocomplete="off"/>
          <div id="manual-att-list" class="autocomplete-list"></div>
        </div>
        <span class="form-hint">Apenas alunos que ainda não registraram presença nesta faixa são listados.</span>
      </div>
      <div id="manual-att-selected" style="display:none;margin-top:16px;" class="card card-sm">
        <div style="font-size:.78rem;color:var(--text-muted);">Aluno selecionado</div>
        <div id="manual-att-name" style="font-weight:600;margin-top:4px;"></div>
        <div id="manual-att-tag" style="margin-top:4px;"></div>
      </div>
    `,
    footerHtml: `
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button class="btn btn-secondary btn-sm" data-close="modal-manual-att">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-confirm-manual" disabled>Confirmar presença</button>
      </div>
    `,
  });

  openModal('modal-manual-att');

  let selectedStudent = null;

  _acInstance = createAutocomplete({
    inputEl:    modal.querySelector('#manual-att-search'),
    listEl:     modal.querySelector('#manual-att-list'),
    items:      absent,
    renderItem: s => `<span class="student-name">${s.name}</span>&nbsp;<span class="tag-id" style="font-size:.72rem;">${s.tagId}</span>`,
    onSelect:   s => {
      selectedStudent = s;
      const sel = modal.querySelector('#manual-att-selected');
      sel.style.display = 'block';
      modal.querySelector('#manual-att-name').textContent = s.name;
      modal.querySelector('#manual-att-tag').innerHTML = `<span class="tag-id">${s.tagId}</span>`;
      modal.querySelector('#btn-confirm-manual').disabled = false;
    },
  });

  modal.querySelector('#btn-confirm-manual').addEventListener('click', async () => {
    if (!selectedStudent) return;
    const btn = modal.querySelector('#btn-confirm-manual');
    setButtonLoading(btn, true);
    try {
      const record = await API.registerAttendance({ studentId: selectedStudent.id, slotIndex });
      const { attendances: prev } = Store.getState();
      Store.setState({ attendances: [...prev, record] });
      closeModal('modal-manual-att');
      renderAttendanceTable();
      renderStats();
      showToast(`✓ Presença de ${selectedStudent.name} registrada (faixa ${slotIndex + 1}).`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
      setButtonLoading(btn, false);
    }
  });
}

// ── Modal: Cadastro de Aluno ──────────────────────────────────

function openAddStudentModal() {
  const modal = createModal({
    id: 'modal-add-student',
    title: '👤 Cadastrar novo aluno',
    bodyHtml: `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="form-group">
          <label class="form-label">Nome completo *</label>
          <input type="text" id="new-student-name" class="form-input" placeholder="Ex: João da Silva" />
          <span class="form-error" id="err-name" style="display:none;"></span>
        </div>
        <div class="form-group">
          <label class="form-label">E-mail (opcional)</label>
          <input type="email" id="new-student-email" class="form-input" placeholder="aluno@escola.edu.br" />
        </div>
        <div class="form-group">
          <label class="form-label">Tag RFID *</label>
          <div class="tag-scanner" id="tag-scanner">
            <div class="tag-scanner-icon">📡</div>
            <div class="tag-scanner-text" id="tag-scanner-text">Clique para simular leitura da tag</div>
            <div class="tag-scanner-id" id="tag-scanner-id" style="display:none;"></div>
          </div>
          <span class="form-error" id="err-tag" style="display:none;"></span>
        </div>
      </div>
    `,
    footerHtml: `
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button class="btn btn-secondary btn-sm" data-close="modal-add-student">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-save-student" disabled>Cadastrar aluno</button>
      </div>
    `,
  });

  openModal('modal-add-student');
  Store.setState({ pendingTagRead: null });

  // Simula leitura da tag ao clicar no scanner
  const scanner = modal.querySelector('#tag-scanner');
  scanner.addEventListener('click', async () => {
    if (scanner.classList.contains('scanning')) return;
    scanner.classList.add('scanning');
    modal.querySelector('#tag-scanner-text').textContent = 'Aguardando leitura da tag…';
    try {
      const { tagId } = await API.waitForNewTag();
      scanner.classList.remove('scanning');
      scanner.classList.add('success');
      modal.querySelector('#tag-scanner-text').textContent = 'Tag detectada!';
      const idEl = modal.querySelector('#tag-scanner-id');
      idEl.textContent = tagId;
      idEl.style.display = 'block';
      Store.setState({ pendingTagRead: tagId });
      modal.querySelector('#btn-save-student').disabled = false;
    } catch (e) {
      scanner.classList.remove('scanning');
      modal.querySelector('#tag-scanner-text').textContent = 'Erro na leitura. Tente novamente.';
      showToast('Falha na leitura da tag.', 'error');
    }
  });

  modal.querySelector('#btn-save-student').addEventListener('click', async () => {
    const name  = modal.querySelector('#new-student-name').value.trim();
    const email = modal.querySelector('#new-student-email').value.trim();
    const { pendingTagRead } = Store.getState();

    // Limpa erros
    modal.querySelectorAll('.form-error').forEach(e => { e.style.display = 'none'; e.textContent = ''; });

    let valid = true;
    if (!name) {
      showError(modal, 'err-name', 'Nome é obrigatório.'); valid = false;
    }
    if (!pendingTagRead) {
      showError(modal, 'err-tag', 'Realize a leitura da tag antes de salvar.'); valid = false;
    }
    if (!valid) return;

    const btn = modal.querySelector('#btn-save-student');
    setButtonLoading(btn, true);
    try {
      const student = await API.createStudent({ name, tagId: pendingTagRead, email });
      const { students } = Store.getState();
      Store.setState({ students: [...students, student], pendingTagRead: null });
      closeModal('modal-add-student');
      renderStudentList();
      renderStats();
      showToast(`✓ ${student.name} cadastrado com sucesso!`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
      setButtonLoading(btn, false);
    }
  });
}

function showError(modal, id, msg) {
  const el = modal.querySelector(`#${id}`);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// ── Layout HTML ───────────────────────────────────────────────

function buildLayout() {
  return `
    <!-- Topbar slot -->
    <div class="main-content">

      <!-- Stats Row -->
      <div class="stats-row">
        <div class="stat-card accent">
          <div class="stat-value" id="stat-total">—</div>
          <div class="stat-label">Total de alunos</div>
        </div>
        <div class="stat-card green">
          <div class="stat-value" id="stat-present">—</div>
          <div class="stat-label">Presentes hoje</div>
        </div>
        <div class="stat-card red">
          <div class="stat-value" id="stat-absent">—</div>
          <div class="stat-label">Ausentes hoje</div>
        </div>
        <div class="stat-card yellow">
          <div class="stat-value" id="stat-slot-att">—</div>
          <div class="stat-label">Nesta faixa</div>
        </div>
      </div>

      <!-- Slot Timeline -->
      <div class="card">
        <div class="section-header" style="margin-bottom:16px;">
          <div>
            <div class="section-title">Timeline de Faixas</div>
            <div class="section-sub">4 faixas de 25 segundos por sessão</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" id="btn-refresh">↻ Atualizar</button>
            <button class="btn btn-secondary btn-sm" id="btn-reset-session">⟳ Reiniciar</button>
            <button class="btn btn-primary btn-sm" id="btn-start-session">▶ Iniciar sessão</button>
          </div>
        </div>
        <div class="slot-timeline" id="slot-timeline">
          ${[1,2,3,4].map(i => `
            <div class="slot-card upcoming">
              <div class="slot-num">Faixa ${i}</div>
              <div class="slot-label">${String(i).padStart(2,'0')}</div>
              <div class="slot-status">Aguardando início</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Tabs: Presenças / Alunos -->
      <div class="card" style="padding:0;">
        <div style="padding:20px 24px 0;">
          <div class="tabs">
            <button class="tab-btn active" data-tab="tab-attendance">📋 Presenças</button>
            <button class="tab-btn" data-tab="tab-students">👥 Alunos</button>
          </div>
        </div>

        <!-- Tab Presenças -->
        <div class="tab-panel active" id="tab-attendance" style="padding:0 24px 24px;">
          <div class="section-header" style="margin-bottom:16px;">
            <div>
              <div class="section-title">Registro de Presenças</div>
              <div class="section-sub" id="today-date"></div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-manual-att">+ Presença manual</button>
          </div>
          <div class="attendance-table-wrap">
            <table class="attendance-table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Tag ID</th>
                  <th>Faixas (1–4)</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody id="att-tbody">
                <tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-msg">Carregando…</div></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tab Alunos -->
        <div class="tab-panel" id="tab-students" style="padding:0 24px 24px;">
          <div class="section-header" style="margin-bottom:16px;">
            <div>
              <div class="section-title">Alunos Cadastrados</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-add-student">+ Cadastrar aluno</button>
          </div>
          <div class="attendance-table-wrap">
            <table class="attendance-table">
              <thead>
                <tr><th>Nome</th><th>Tag ID</th><th style="width:60px;"></th></tr>
              </thead>
              <tbody id="student-list-body"></tbody>
            </table>
          </div>
        </div>
      </div>

    </div><!-- /main-content -->
  `;
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}