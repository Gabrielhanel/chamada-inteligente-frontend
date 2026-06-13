// ============================================================
// store.js — Estado central da aplicação (padrão Observer)
// Substitui Redux/Vuex de forma leve e sem dependências
// ============================================================

const Store = (() => {
  let _state = {
    currentUser: null,
    students: [],
    attendances: [],
    settings: { slotDurationSeconds: 25, totalSlots: 4, sessionStartTime: null },
    sessionActive: false,
    currentSlot: 0,
    slotTimer: null,
    pendingTagRead: null,   // usado no fluxo de cadastro de aluno
    isLoading: false,
    toast: null,
  };

  const _listeners = new Map();

  // Inscreve um callback para mudanças em uma chave específica
  function subscribe(key, callback) {
    if (!_listeners.has(key)) _listeners.set(key, new Set());
    _listeners.get(key).add(callback);
    return () => _listeners.get(key).delete(callback); // unsubscribe
  }

  // Atualiza estado e notifica ouvintes
  function setState(partial) {
    const prev = { ..._state };
    _state = { ..._state, ...partial };

    Object.keys(partial).forEach(key => {
      if (_listeners.has(key) && prev[key] !== _state[key]) {
        _listeners.get(key).forEach(cb => cb(_state[key], prev[key]));
      }
    });

    // Notifica ouvintes globais
    if (_listeners.has('*')) {
      _listeners.get('*').forEach(cb => cb(_state, prev));
    }
  }

  function getState() {
    return { ..._state };
  }

  return { subscribe, setState, getState };
})();

export default Store;