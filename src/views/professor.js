import * as API from '../api/api.js';
import Store from '../store/store.js';
import {
  showToast, openModal, closeModal, createModal,
  setButtonLoading, createAutocomplete, initTabs, confirmAction
} from '../components/components.js';
import { formatTime, formatDate } from '../utils/utils.js';

let _tickInterval = null;

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
    const [students, attendances] = await Promise.all([
      API.getStudents(),
      API.getAttendances(),
    ]);
    Store.setState({ students, attendances });
  } catch (e) {
    showToast(`Erro ao carregar dados: ${e.message}`, 'error');
  } finally {
    Store.setState({ isLoading: false });
  }
}

// ── Tick engine ───────────────────────────────────────────────

function startTick() {
  stopTick();
  _tickInterval = setInterval(() => {
    renderAttendanceTable();
    renderStats();
  }, 1000);
}

function stopTick() {
  if (_tickInterval) clearInterval(_tickInterval);
}

// ── Render helpers ────────────────────────────────────────────

function renderAll() {
  renderAttendanceTable();
  renderStats();
  renderStudentList();
}

function renderStats() {
  const { students, attendances } = Store.getState();

  const totalAlunos   = students.length;
  const presentesHoje = new Set(attendances.filter(a => a.faltas < 4).map(a => a.uid)).size;
  const ausentesHoje  = totalAlunos - presentesHoje;

  setEl('stat-total',    totalAlunos);
  setEl('stat-present',  presentesHoje);
  setEl('stat-absent',   ausentesHoje);
  setEl('stat-slot-att', attendances.length);
}

function renderAttendanceTable() {
  const { students, attendances } = Store.getState();
  const tbody = document.getElementById('att-tbody');
  if (!tbody) return;

  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-msg">Nenhum aluno cadastrado</div></td></tr>`;
    return;
  }

  tbody.innerHTML = students.map(student => {
    const presenca = attendances.find(a => a.uid === student.uid);

    let statusHtml    = '';
    let fatiasPresenca = '';

    if (presenca) {
      const corStatus = presenca.status === 'PRESENTE' ? 'var(--green)' : 'var(--yellow)';
      statusHtml = `<span class="badge" style="background:${corStatus};color:#fff;padding:2px 6px;border-radius:4px;">${presenca.status}</span>`;

      const presencasRestantes = 4 - presenca.faltas;
      fatiasPresenca = `
        ${'<span class="chip present" data-tip="Presente">✓</span>'.repeat(presencasRestantes)}
        ${'<span class="chip absent"  data-tip="Falta">✕</span>'.repeat(presenca.faltas)}
      `;
    } else {
      statusHtml     = `<span class="badge" style="background:var(--red);color:#fff;padding:2px 6px;border-radius:4px;">AUSENTE</span>`;
      fatiasPresenca = '<span class="chip future" data-tip="Sem registros">—</span>'.repeat(4);
    }

    return `
      <tr>
        <td><span class="student-name">${student.name}</span></td>
        <td><span class="tag-id">${student.uid}</span></td>
        <td><div class="slot-chips">${fatiasPresenca}</div></td>
        <td>${statusHtml}</td>
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
      <td><span class="tag-id">${s.uid}</span></td>
      <td>
        <button class="btn btn-danger btn-sm" data-delete="${s.id}" title="Remover aluno">🗑</button>
      </td>
    </tr>
  `).join('');

  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteStudent(btn.dataset.delete));
  });
}

// ── Actions ───────────────────────────────────────────────────

function bindActions() {
  document.getElementById('btn-manual-att')?.addEventListener('click', openManualAttModal);
  document.getElementById('btn-add-student')?.addEventListener('click', openAddStudentModal);

  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    await loadData();
    renderAll();
    showToast('Dados atualizados!', 'success');
  });
}

async function handleDeleteStudent(studentId) {
  const { students } = Store.getState();
  const s  = students.find(x => x.id == studentId);
  const ok = await confirmAction(`Remover <b>${s?.name}</b>?`);
  if (!ok) return;
  try {
    await API.deleteStudent(studentId);
    Store.setState({ students: students.filter(x => x.id != studentId) });
    renderStudentList();
    renderStats();
    showToast('Aluno removido.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Modal: Presença Manual ────────────────────────────────────

function openManualAttModal() {
  const { students, attendances } = Store.getState();

  // Apenas alunos sem presença registrada hoje
  const absent = students.filter(s => !attendances.some(a => a.uid === s.uid));

  const modal = createModal({
    id: 'modal-manual-att',
    title: '📝 Registrar presença manual',
    bodyHtml: `
      <div class="form-group">
        <label class="form-label">Buscar aluno ausente</label>
        <div class="autocomplete-wrap">
          <input type="text" id="manual-att-search" class="form-input" placeholder="Digite o nome do aluno…" autocomplete="off"/>
          <div id="manual-att-list" class="autocomplete-list"></div>
        </div>
      </div>
      <div id="manual-att-selected" style="display:none;margin-top:16px;" class="card card-sm">
        <div style="font-size:.78rem;color:var(--text-muted);">Aluno selecionado</div>
        <div id="manual-att-name" style="font-weight:600;margin-top:4px;"></div>
        <div id="manual-att-tag"  style="margin-top:4px;"></div>
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

  createAutocomplete({
    inputEl:    modal.querySelector('#manual-att-search'),
    listEl:     modal.querySelector('#manual-att-list'),
    items:      absent,
    renderItem: s => `<span class="student-name">${s.name}</span>&nbsp;<span class="tag-id" style="font-size:.72rem;">${s.uid}</span>`,
    onSelect:   s => {
      selectedStudent = s;
      const sel = modal.querySelector('#manual-att-selected');
      sel.style.display = 'block';
      modal.querySelector('#manual-att-name').textContent = s.name;
      modal.querySelector('#manual-att-tag').innerHTML    = `<span class="tag-id">${s.uid}</span>`;
      modal.querySelector('#btn-confirm-manual').disabled = false;
    },
  });

  modal.querySelector('#btn-confirm-manual').addEventListener('click', async () => {
    if (!selectedStudent) return;
    const btn = modal.querySelector('#btn-confirm-manual');
    setButtonLoading(btn, true);
    try {
      // Usa registerAttendanceManual com uid (alinhado ao backend)
      const record = await API.registerAttendanceManual({ uid: selectedStudent.uid });
      const { attendances: prev } = Store.getState();

      Store.setState({ attendances: [...prev, record] });
      closeModal('modal-manual-att');
      renderAll();
      showToast(`✓ Presença de ${selectedStudent.name} registrada. Status: ${record.status}`, 'success');
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
          <label class="form-label">E-mail</label>
          <input type="email" id="new-student-email" class="form-input" placeholder="aluno@email.com (opcional)" />
        </div>
        <div class="form-group">
          <label class="form-label">Tag RFID *</label>
          <div class="tag-scanner" id="tag-scanner" style="cursor:pointer;padding:15px;border:2px dashed #ccc;text-align:center;border-radius:8px;">
            <div class="tag-scanner-icon">📡</div>
            <div class="tag-scanner-text" id="tag-scanner-text">Clique para ativar o Modo Cadastro no Arduino</div>
            <input type="text" id="new-student-uid" class="form-input"
              placeholder="UID preenchido automaticamente ou digite manualmente…"
              style="margin-top:10px;text-align:center;" readonly />
          </div>
          <span class="form-error" id="err-tag" style="display:none;"></span>
        </div>
      </div>
    `,
    footerHtml: `
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button class="btn btn-secondary btn-sm" data-close="modal-add-student">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="btn-save-student">Cadastrar aluno</button>
      </div>
    `,
  });

  openModal('modal-add-student');

  const scanner    = modal.querySelector('#tag-scanner');
  const txtScanner = modal.querySelector('#tag-scanner-text');
  const inputUid   = modal.querySelector('#new-student-uid');

  let pollInterval = null;

  // Ao clicar na área do scanner, ativa o modo cadastro e checa o status
  scanner.addEventListener('click', async (e) => {
    if (e.target === inputUid) return;

    txtScanner.textContent = 'Enviando comando ao Arduino…';
    scanner.style.borderColor = '#ccc';

    try {
      await API.iniciarModoCadastroArduino();
      txtScanner.textContent    = '⏳ Arduino em MODO CADASTRO — aproxime a tag do sensor…';
      scanner.style.borderColor = 'var(--accent)';

      if (pollInterval) clearInterval(pollInterval);
      
      pollInterval = setInterval(async () => {
        try {
          const status = await API.getCadastroStatus();
          if (status && status.uid) {
            inputUid.value            = status.uid;
            inputUid.readOnly         = false;
            txtScanner.textContent    = `✅ Tag lida: ${status.uid}`;
            scanner.style.borderColor = 'var(--green)';
            clearInterval(pollInterval);
          }
        } catch (pollingErr) {
          console.error("Erro ao checar status da tag:", pollingErr);
        }
      }, 1500);

    } catch (err) {
      txtScanner.textContent    = 'Erro ao conectar com o Arduino.';
      scanner.style.borderColor = 'var(--red)';
      showToast('Falha ao mudar o modo do hardware.', 'error');
    }
  });

  // Fecha o intervalo se o modal for fechado sem salvar
  modal.querySelector('[data-close]')?.addEventListener('click', () => {
    if (pollInterval) clearInterval(pollInterval);
  });

  modal.querySelector('#btn-save-student').addEventListener('click', async () => {
    const name  = modal.querySelector('#new-student-name').value.trim();
    const uid   = inputUid.value.trim();
    const email = modal.querySelector('#new-student-email').value.trim();

    modal.querySelectorAll('.form-error').forEach(e => { e.style.display = 'none'; });

    let valid = true;
    if (!name) { showError(modal, 'err-name', 'Nome é obrigatório.');        valid = false; }
    if (!uid)  { showError(modal, 'err-tag',  'UID da tag é obrigatório.');  valid = false; }
    if (!valid) return;

    const btn = modal.querySelector('#btn-save-student');
    setButtonLoading(btn, true);

    try {
      const novoAluno = await API.createStudent({
    name,
    tagId: uid,
    email: email || undefined
});

      const { students } = Store.getState();
      Store.setState({ students: [...students, novoAluno] });

      if (pollInterval) clearInterval(pollInterval);
      closeModal('modal-add-student');
      renderStudentList();
      renderStats();
      showToast(`✓ ${name} cadastrado com sucesso!`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────

function showError(modal, id, msg) {
  const el = modal.querySelector(`#${id}`);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Layout HTML ───────────────────────────────────────────────

function buildLayout() {
  return `
    <div class="main-content">
      <div class="stats-row">
        <div class="stat-card accent">
          <div class="stat-value" id="stat-total">—</div>
          <div class="stat-label">Total de alunos</div>
        </div>
        <div class="stat-card green">
          <div class="stat-value" id="stat-present">—</div>
          <div class="stat-label">Presentes / Atrasados</div>
        </div>
        <div class="stat-card red">
          <div class="stat-value" id="stat-absent">—</div>
          <div class="stat-label">Total Ausentes</div>
        </div>
        <div class="stat-card yellow">
          <div class="stat-value" id="stat-slot-att">—</div>
          <div class="stat-label">Total de Leituras</div>
        </div>
      </div>

      <div class="card">
        <div class="section-header" style="margin-bottom:16px;">
          <div>
            <div class="section-title">Status do Sistema Dinâmico</div>
            <div class="section-sub">Atrasos calculados em blocos de 25 segundos (Máx: 4 faltas)</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" id="btn-refresh">↻ Atualizar Grade</button>
          </div>
        </div>
      </div>

      <div class="card" style="padding:0;">
        <div style="padding:20px 24px 0;">
          <div class="tabs">
            <button class="tab-btn active" data-tab="tab-attendance">📋 Grade de Chamada</button>
            <button class="tab-btn"        data-tab="tab-students">👥 Lista de Alunos</button>
          </div>
        </div>

        <div class="tab-panel active" id="tab-attendance" style="padding:0 24px 24px;">
          <div class="section-header" style="margin-bottom:16px;">
            <div>
              <div class="section-title">Acompanhamento em Tempo Real</div>
              <div class="section-sub">Aproximação recomendada: 8cm a 12cm do sensor</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-manual-att">+ Inserir Presença Manual</button>
          </div>
          <div class="attendance-table-wrap">
            <table class="attendance-table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>UID da Tag</th>
                  <th>Presenças computadas (Máx 4)</th>
                  <th>Status Final</th>
                </tr>
              </thead>
              <tbody id="att-tbody">
                <tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">⏳</div><div class="empty-state-msg">Carregando…</div></div></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="tab-panel" id="tab-students" style="padding:0 24px 24px;">
          <div class="section-header" style="margin-bottom:16px;">
            <div>
              <div class="section-title">Alunos Cadastrados no Banco</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-add-student">+ Cadastrar Novo Aluno</button>
          </div>
          <div class="attendance-table-wrap">
            <table class="attendance-table">
              <thead>
                <tr><th>Nome</th><th>UID Cadastrado</th><th style="width:60px;"></th></tr>
              </thead>
              <tbody id="student-list-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}