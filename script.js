const API_URL = "http://192.168.0.111:3000";
let timerInterval = null;
let listaAlunosCache = []; 
let loopVerificacao = null;

// --- FUNÇÕES DE CONTROLE DE AULA ---

function gerenciarTimerVisual(tempoInicial) {
    if (timerInterval) clearInterval(timerInterval);
    const display = document.getElementById("timer-regressivo");
    const statusBloco = document.getElementById("timer-status-bloco");
    const barra = document.getElementById("timer-progress");

    timerInterval = setInterval(() => {
        const segundosDecorridos = Math.floor((Date.now() - tempoInicial) / 1000);
        if (segundosDecorridos >= 100) {
            display.innerText = "100s";
            statusBloco.innerText = "Aula Encerrada";
            statusBloco.style.color = "var(--red)";
            barra.style.width = "100%";
            barra.style.backgroundColor = "var(--red)";
            clearInterval(timerInterval);
            return;
        }
        display.innerText = `${String(segundosDecorridos).padStart(3, '0')}s`;
        barra.style.width = `${segundosDecorridos}%`;

        if (segundosDecorridos < 25) {
            statusBloco.innerText = "Bloco 1: 0 Faltas";
            statusBloco.style.color = "var(--green)";
            barra.style.backgroundColor = "var(--green)";
        } else if (segundosDecorridos < 50) {
            statusBloco.innerText = "Bloco 2: +1 Falta";
            statusBloco.style.color = "var(--yellow)";
            barra.style.backgroundColor = "var(--yellow)";
        } else if (segundosDecorridos < 75) {
            statusBloco.innerText = "Bloco 3: +2 Faltas";
            statusBloco.style.color = "var(--orange)";
            barra.style.backgroundColor = "var(--orange)";
        } else {
            statusBloco.innerText = "Bloco 4: +3 Faltas";
            statusBloco.style.color = "var(--red)";
            barra.style.backgroundColor = "var(--red)";
        }
    }, 1000);
}

async function iniciarAula() {
    try {
        const res = await fetch(`${API_URL}/aula/iniciar`, { method: 'POST' });
        document.getElementById('aula-status').innerHTML = `✅ Aula Iniciada!`;
        gerenciarTimerVisual(Date.now());
    } catch (e) {
        document.getElementById('aula-status').innerHTML = `❌ Erro na API`;
    }
}

// --- FUNÇÕES DE CADASTRO ---

function restaurarBotoesCadastro() {
    const btn = document.getElementById('btn-capturar');
    const btnCancelar = document.getElementById('btn-cancelar');
    btn.disabled = false;
    btn.innerText = "📡 Capturar Nova Tag";
    btn.style.background = "#2980b9";
    btnCancelar.style.display = "none";
}

async function cancelarCaptura() {
    if (loopVerificacao) clearInterval(loopVerificacao);
    try { await fetch(`${API_URL}/cadastro/cancelar`, { method: 'POST' }); } catch (e) {}
    document.getElementById('cadastro-feedback').innerText = "🚫 Modo cadastro cancelado.";
    restaurarBotoesCadastro();
}

async function capturarNovaTag() {
    const feedback = document.getElementById('cadastro-feedback');
    const btn = document.getElementById('btn-capturar');
    const btnCancelar = document.getElementById('btn-cancelar');
    document.getElementById('uid-input').value = ""; 

    try {
        await fetch(`${API_URL}/cadastro/iniciar`, { method: 'POST' }); 
        btn.disabled = true;
        btn.innerText = "⏳ Aguardando leitura...";
        btnCancelar.style.display = "block";
        feedback.innerText = "📡 Aproxime a tag no leitor...";

        if (loopVerificacao) clearInterval(loopVerificacao);
        loopVerificacao = setInterval(async () => {
            const res = await fetch(`${API_URL}/cadastro/status`);
            const data = await res.json();
            if (data.uid) {
                clearInterval(loopVerificacao);
                document.getElementById('uid-input').value = data.uid;
                feedback.innerText = "✅ Tag capturada!";
                restaurarBotoesCadastro();
            }
        }, 1000);
    } catch (e) { feedback.innerText = "❌ Erro ao ativar sensor"; }
}

async function salvarAluno() {
    const uid = document.getElementById('uid-input').value;
    const nome = document.getElementById('nome-input').value.trim();
    if (!uid || !nome) return;
    await fetch(`${API_URL}/cadastro/salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, nome })
    });
    document.getElementById('nome-input').value = "";
    carregarAlunos();
}

// --- FUNÇÕES DE DADOS (TEMPO REAL) ---

async function carregarAlunos() {
    const res = await fetch(`${API_URL}/alunos`);
    listaAlunosCache = await res.json();
    const tbody = document.getElementById('tabela-alunos');
    tbody.innerHTML = listaAlunosCache.map(a => `<tr><td>${a.id}</td><td><span class="tag-id">${a.uid}</span></td><td class="student-name">${a.nome}</td></tr>`).join('');
}

async function carregarPresencas() {
    try {
        const res = await fetch(`${API_URL}/presencas?t=${Date.now()}`);
        const presencas = await res.json();
        const tbody = document.getElementById("tabela-presencas");

        tbody.innerHTML = presencas.map(p => {
            const aluno = listaAlunosCache.find(a => a.uid === p.uid);
            const nomeExibicao = aluno ? aluno.nome : "Visitante";
            const badgeClass = p.status === 'PRESENTE' ? 'badge-presente' : 'badge-atrasado';
            
            return `<tr>
                <td>${p.id}</td>
                <td>${p.uid}</td>
                <td><b>${nomeExibicao}</b></td>
                <td><span class="badge ${badgeClass}">${p.status}</span></td>
                <td>${p.faltas} bloco(s)</td>
            </tr>`;
        }).join('');
    } catch (e) { console.error("Erro ao atualizar presenças"); }
}

window.onload = () => {
    carregarAlunos();
    setInterval(carregarPresencas, 2000); // Polling de 2s para tempo real
};