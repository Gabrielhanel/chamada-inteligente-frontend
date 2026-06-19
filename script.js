const API_URL = "http://192.168.0.111:3000";
let timerInterval = null;
let listaAlunosCache = []; 
let loopVerificacao = null;

// --- FUNÇÕES DE AULA E TIMER ---
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
        } else if (segundosDecorridos < 74) {
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
        carregarPresencas();
    } catch (e) {
        document.getElementById('aula-status').innerHTML = `❌ Erro na conexão`;
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

async function capturarNovaTag() {
    const feedback = document.getElementById('cadastro-feedback');
    document.getElementById('uid-input').value = ""; 
    try {
        await fetch(`${API_URL}/cadastro/iniciar`, { method: 'POST' });
        feedback.innerText = "📡 Sensor Pronto! Aproxime a tag...";
        
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
        }, 1500);
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
    carregarAlunos();
}

// --- DADOS E TABELAS (TEMPO REAL) ---
async function carregarAlunos() {
    try {
        const res = await fetch(`${API_URL}/alunos`);
        listaAlunosCache = await res.json();
    } catch (e) { console.error("Erro ao carregar alunos"); }
}

async function carregarPresencas() {
    try {
        // Adicionamos ?t=${Date.now()} para evitar cache e garantir tempo real
        const res = await fetch(`${API_URL}/presencas?t=${Date.now()}`);
        const presencas = await res.json();
        const tbody = document.getElementById('tabela-presencas');
        
        if (!presencas || presencas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nenhuma leitura registrada hoje.</td></tr>`;
            return;
        }

        tbody.innerHTML = presencas.map(p => {
            const aluno = listaAlunosCache.find(a => a.uid === p.uid);
            const nomeExibicao = aluno ? aluno.nome : "Visitante";
            const badgeClass = p.status === 'PRESENTE' ? 'badge-presente' : 'badge-atrasado';
            
            return `<tr>
                <td>${p.id}</td>
                <td><span class="tag-id">${p.uid}</span></td>
                <td class="student-name"><b>${nomeExibicao}</b></td>
                <td><span class="badge ${badgeClass}">${p.status}</span></td>
                <td>${p.faltas} bloco(s)</td>
            </tr>`;
        }).join('');
    } catch (e) { console.error("Erro no polling de presenças:", e); }
}

window.onload = async () => {
    await carregarAlunos();
    carregarPresencas();
    // Atualiza a tabela a cada 2 segundos
    setInterval(carregarPresencas, 2000);
};