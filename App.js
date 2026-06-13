// ============================================================
// app.js — Ponto de entrada e roteador da aplicação
// ============================================================

import * as API from './src/api/api.js';
import Store from './src/store/store.js';
import { showToast, setButtonLoading } from './src/components/components.js';
import { initProfessorView } from './src/views/professor.js';
import { initAlunoView } from './src/views/aluno.js';

// ── Boot ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initRouter();
  checkAutoLogin();

  // Data atual no header
  const dateEl = document.getElementById('today-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
  }
});

// ── Auto-login via sessionStorage ─────────────────────────────

function checkAutoLogin() {
  const saved = sessionStorage.getItem('ci_user');
  if (saved) {
    try {
      const user = JSON.parse(saved);
      Store.setState({ currentUser: user });
      showApp(user);
      return;
    } catch {}
  }
  showPage('page-login');
}

// ── Router ────────────────────────────────────────────────────

function initRouter() {
  // Login form
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);

  // Demo buttons
  document.querySelectorAll('[data-demo-login]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [email, pwd] = btn.dataset.demoLogin.split(':');
      document.getElementById('login-email').value = email;
      document.getElementById('login-password').value = pwd;
    });
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errEl.style.display = 'none';
  setButtonLoading(btn, true);

  try {
    const user = await API.login(email, password);
    Store.setState({ currentUser: user });
    sessionStorage.setItem('ci_user', JSON.stringify(user));
    showApp(user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    setButtonLoading(btn, false);
  }
}

function handleLogout() {
  sessionStorage.removeItem('ci_user');
  Store.setState({ currentUser: null, students: [], attendances: [] });
  document.getElementById('topbar').style.display = 'none';
  showPage('page-login');
  showToast('Sessão encerrada.', 'info');
}

// ── App shell ─────────────────────────────────────────────────

function showApp(user) {
  // Atualiza topbar
  const topbar = document.getElementById('topbar');
  topbar.style.display = 'flex';
  document.getElementById('topbar-name').textContent  = user.name;
  document.getElementById('topbar-badge').textContent = user.role === 'professor' ? 'Professor' : 'Aluno';
  document.getElementById('topbar-badge').className   = `topbar-badge ${user.role}`;

  if (user.role === 'professor') {
    showPage('page-professor');
    initProfessorView();
  } else {
    showPage('page-aluno');
    initAlunoView();
  }
}

// ── Util ──────────────────────────────────────────────────────

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}