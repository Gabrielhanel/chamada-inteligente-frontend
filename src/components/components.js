// ============================================================
// components.js — Componentes de UI reutilizáveis
// ============================================================

// ── Toast ────────────────────────────────────────────────────

const TOAST_ICONS = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };

export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ'}</span>
    <span class="toast-msg">${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = '0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

// ── Modal ────────────────────────────────────────────────────

export function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

export function createModal({ id, title, bodyHtml, footerHtml = '' }) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = id;
  el.className = 'modal-backdrop';
  el.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="modal-close" data-close="${id}">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;
  document.body.appendChild(el);

  // Fechar ao clicar no backdrop
  el.addEventListener('click', e => {
    if (e.target === el) closeModal(id);
  });
  el.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  return el;
}

// ── Loader (botão com spinner) ───────────────────────────────

export function setButtonLoading(btn, loading, originalText = null) {
  if (loading) {
    btn._originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>`;
    btn.disabled = true;
  } else {
    btn.innerHTML = originalText || btn._originalText || '';
    btn.disabled = false;
  }
}

// ── Autocomplete ─────────────────────────────────────────────

export function createAutocomplete({ inputEl, listEl, items, onSelect, renderItem }) {
  function render(filtered) {
    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.classList.remove('open');
      return;
    }
    filtered.forEach(item => {
      const li = document.createElement('div');
      li.className = 'autocomplete-item';
      li.innerHTML = renderItem(item);
      li.addEventListener('click', () => {
        onSelect(item);
        listEl.classList.remove('open');
        inputEl.value = '';
      });
      listEl.appendChild(li);
    });
    listEl.classList.add('open');
  }

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.toLowerCase().trim();
    if (!q) { listEl.classList.remove('open'); return; }
    const filtered = items.filter(it => JSON.stringify(it).toLowerCase().includes(q));
    render(filtered.slice(0, 8));
  });

  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
      listEl.classList.remove('open');
    }
  });

  // Permite atualizar os itens dinamicamente
  return { update: newItems => { items = newItems; } };
}

// ── Tabs ──────────────────────────────────────────────────────

export function initTabs(containerEl) {
  const buttons = containerEl.querySelectorAll('.tab-btn');
  const panels  = containerEl.querySelectorAll('.tab-panel');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = containerEl.querySelector(`#${btn.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });
}

// ── Confirm Dialog ────────────────────────────────────────────

export function confirmAction(message) {
  return new Promise(resolve => {
    const id = 'confirm-modal';
    const modal = createModal({
      id,
      title: 'Confirmar ação',
      bodyHtml: `<p style="color:var(--text-secondary);font-size:.9rem;">${message}</p>`,
      footerHtml: `
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" data-close="${id}">Cancelar</button>
          <button class="btn btn-danger btn-sm" id="confirm-yes">Confirmar</button>
        </div>
      `,
    });
    openModal(id);
    modal.querySelector('#confirm-yes').addEventListener('click', () => {
      closeModal(id);
      setTimeout(() => modal.remove(), 300);
      resolve(true);
    });
    modal.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => {
        setTimeout(() => modal.remove(), 300);
        resolve(false);
      });
    });
  });
}