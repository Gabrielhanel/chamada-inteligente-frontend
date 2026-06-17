import * as API from '../api/api.js';
import Store from '../store/store.js';
import { showToast, openModal, closeModal, createModal, setButtonLoading, createAutocomplete, initTabs, confirmAction } from '../components/components.js';
import { formatTime, formatDate } from '../utils/utils.js';

let _tickInterval   = null;

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
    // Carrega os alunos e as presenças diretamente das novas rotas do back-end
    const [students, attendances] = await Promise.all([
      API.getStudents(),     // Deve mapear para GET /alunos (ou rota equivalente no seu api.js)
      API.getAttendances(),   // Mapeia para GET /presencas
    ]);
    Store.setState({ students, attendances });
  } catch (e) {
    showToast(`Erro ao carregar dados: ${e.message}`, 'error');
  } finally {
    Store.setState({ isLoading: false });
  }
}

// ── Tick engine (Atualiza a tela a cada 1 segundo) ────────────

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
  
  const totalAlunos = students.length;
  // No novo back-end, quem tem 4 faltas seguidas é considerado ausente na totalidade das faixas
  const presentesHoje = new Set(attendances.filter(a => a.faltas < 4).map(a => a.uid)).size;
  const ausentesHoje = totalAlunos - presentesHoje;

  setEl('stat-total', totalAlunos);
  setEl('stat-present', presentesHoje);
  setEl('stat-absent', ausentesHoje);
  setEl('stat-slot-att', `${attendances.length}`); // Total de registros efetuados
}

function renderAttendanceTable() {
  const { students, attendances } = Store.getState();
  const tbody = document.getElementById('att-tbody');
  if (!tbody) return;

  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-msg">Nenhum aluno cadastrado</div></td></tr>`;
    return;
  }

  // Gera as linhas cruzando Alunos x Presenças baseado no 'uid'
  tbody.innerHTML = students.map(student => {
    // Busca a presença do aluno se houver
    const presenca = attendances.find(a => a.uid === student.uid);
    
    let statusHtml = '';
    let fatiasPresenca = '';

    if (presenca) {
      const corStatus = presenca.status === 'PRESENTE' ? 'var(--green)' : 'var(--yellow)';
      statusHtml = `<span class="badge" style="background:${corStatus}; color:#fff; padding:2px 6px; borderRadius:4px;">${presenca.status}</span>`;
      
      // O back-end calcula faltas de 0 a 4 (onde 0 faltas = 4 presenças, 1 falta = 3 presenças...)
      const presencasRestantes = 4 - presenca.faltas;
      fatiasPresenca = `
        ${'<span class="chip present" data-tip="Presente">✓</span>'.repeat(presencasRestantes)}
        ${'<span class="chip absent" data-tip="Falta">✕</span>'.repeat(presenca.faltas)}
      `;
    } else {
      statusHtml = `<span class="badge" style="background:var(--red); color:#fff; padding:2px 6px; borderRadius:4px;">AUSENTE</span>`;
      fatiasPresenca = '<span class="chip future" data-tip="Sem registros">—</span>'.repeat(4);
    }

    return `
      <tr>
        <td><span class="student-name">${student.name}</span></td>
        <td><span class="tag-id">${student.uid}</span></td> <td><div class="slot-chips">${fatiasPresenca}</div></td>
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
      <td><span class="tag-id">${s.uid}</span></td> <td>
        <button class="btn btn-danger btn-sm" data-delete="${s.id}" title="Remover aluno">
          🗑
        </button>
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
  const s = students.find(x => x.id === studentId);
  const ok = await confirmAction(`Remover <b>${s?.name}</b>?`);
  if (!ok) return;
  try {
    await API.deleteStudent(studentId); // Certifique-se de que sua API trata essa rota
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
  const { students, attendances } = Store.getState();
  
  // Filtra estudantes que ainda não possuem nenhuma presença registrada hoje
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

  createAutocomplete({
    inputEl:  modal.querySelector('#manual-att-search'),
    listEl:   modal.querySelector('#manual-att-list'),
    items:    absent,
    renderItem: s => `<span class="student-name">${s.name}</span>&nbsp;<span class="tag-id" style="font-size:.72rem;">${s.uid}</span>`,
    onSelect: s => {
      selectedStudent = s;
      const sel = modal.querySelector('#manual-att-selected');
      sel.style.display = 'block';
      modal.querySelector('#manual-att-name').textContent = s.name;
      modal.querySelector('#manual-att-tag').innerHTML = `<span class="tag-id">${s.uid}</span>`;
      modal.querySelector('#btn-confirm-manual').disabled = false;
    },
  });

  modal.querySelector('#btn-confirm-manual').addEventListener('click', async () => {
    if (!selectedStudent) return;
    const btn = modal.querySelector('#btn-confirm-manual');
    setButtonLoading(btn, true);
    try {
      // Chama a rota POST /presenca passando o { uid } esperado pelo backend
      const record = await API.registerAttendance({ uid: selectedStudent.uid });
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
          <label class="form-label">Tag RFID (Coloque o Arduino em Modo Cadastro) *</label>
          <div class="tag-scanner" id="tag-scanner" style="cursor:pointer; padding:15px; border:2px dashed #ccc; text-align:center;">
            <div class="tag-scanner-icon">📡</div>
            <div class="tag-scanner-text" id="tag-scanner-text">Clique para ativar o Modo Cadastro no Arduino</div>
            <input type="text" id="new-student-uid" class="form-input" placeholder="Ou digite o UID manualmente..." style="margin-top:10px; text-align:center;" />
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

  const scanner = modal.querySelector('#tag-scanner');
  const txtScanner = modal.querySelector('#tag-scanner-text');
  const inputUid = modal.querySelector('#new-student-uid');

  // Ao clicar na área do scanner, ativa a rota POST /cadastro/iniciar do backend
  scanner.addEventListener('click', async (e) => {
    if(e.target === inputUid) return; // Se clicou no input, não reinicia o comando
    
    txtScanner.textContent = 'Enviando comando de cadastro ao Arduino...';
    try {
      await API.startHardwareRegistration(); // Deve disparar POST /cadastro/iniciar
      txtScanner.textContent = 'Arduino em MODO CADASTRO! Aproxime a tag do sensor e digite o ID retornado abaixo.';
      scanner.style.borderColor = 'var(--accent)';
    } catch (e) {
      txtScanner.textContent = 'Erro ao conectar com o Arduino.';
      showToast('Falha ao mudar o modo do hardware.', 'error');
    }
  });

  modal.querySelector('#btn-save-student').addEventListener('click', async () => {
    const name = modal.querySelector('#new-student-name').value.trim();
    const uid = inputUid.value.trim();

    modal.querySelectorAll('.form-error').forEach(e => { e.style.display = 'none'; });

    let valid = true;
    if (!name) { showError(modal, 'err-name', 'Nome é obrigatório.'); valid = false; }
    if (!uid) { showError(modal, 'err-tag', 'O campo UID da Tag é obrigatório.'); valid = false; }
    if (!valid) return;

    const btn = modal.querySelector('#btn-save-student');
    setButtonLoading(btn, true);
    try {
      // Envia os dados estruturados idênticos ao POST /cadastro/salvar do backend
      await API.createStudent({ uid, nome: name });
      
      const { students } = Store.getState();
      Store.setState({ students: [...students, { uid, name }] });
      
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
            <button class="tab-btn" data-tab="tab-students">👥 Lista de Alunos</button>
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