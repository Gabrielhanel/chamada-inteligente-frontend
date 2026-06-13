// ============================================================
// utils.js — Funções utilitárias puras
// ============================================================

/**
 * Calcula o slot atual com base no startTime e duração
 * @returns {{ slotIndex: number, secondsInSlot: number, secondsLeft: number, finished: boolean }}
 */
export function computeCurrentSlot(sessionStartTime, slotDurationSec, totalSlots) {
  if (!sessionStartTime) {
    return { slotIndex: 0, secondsInSlot: 0, secondsLeft: slotDurationSec, finished: false };
  }
  const start = new Date(sessionStartTime).getTime();
  const elapsed = (Date.now() - start) / 1000;
  const totalDuration = slotDurationSec * totalSlots;

  if (elapsed >= totalDuration) {
    return {
      slotIndex: totalSlots - 1,
      secondsInSlot: slotDurationSec,
      secondsLeft: 0,
      finished: true,
    };
  }

  const slotIndex = Math.floor(elapsed / slotDurationSec);
  const secondsInSlot = elapsed % slotDurationSec;
  const secondsLeft = Math.ceil(slotDurationSec - secondsInSlot);

  return { slotIndex, secondsInSlot, secondsLeft, finished: false };
}

/**
 * Formata data ISO para pt-BR
 */
export function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

/**
 * Formata hora ISO para HH:MM:SS
 */
export function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/**
 * Agrupa presenças por studentId e calcula resumo por faixa
 */
export function buildAttendanceMatrix(students, attendances, totalSlots) {
  return students.map(student => {
    const slots = Array.from({ length: totalSlots }, (_, i) => {
      const record = attendances.find(
        a => a.studentId === student.id && a.slotIndex === i
      );
      return record
        ? { present: true, method: record.method, timestamp: record.timestamp }
        : { present: false, method: null, timestamp: null };
    });

    const presentCount = slots.filter(s => s.present).length;
    return { student, slots, presentCount };
  });
}

/**
 * Retorna alunos que ainda não registraram na faixa atual
 */
export function getAbsentStudents(students, attendances, slotIndex) {
  const today = new Date().toISOString().split('T')[0];
  return students.filter(student =>
    !attendances.find(
      a => a.studentId === student.id && a.slotIndex === slotIndex && a.date === today
    )
  );
}

/**
 * Gera ID único simples
 */
export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}