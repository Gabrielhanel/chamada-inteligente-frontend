const API_URL = "http://10.1.24.27:3000";
let timerInterval = null;
let listaAlunosCache = []; 
let loopVerificacao = null;
let presencasInterval = null; // Controle limpo do loop de presenças

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
        await fetch(`${API_URL}/aula/iniciar`, { method: 'POST' });
        document.getElementById('aula-status').innerHTML = `✅ Aula Iniciada!`;
        gerenciarTimerVisual(Date.now());
        await carregarPresencas(); // Força a atualização da tabela no exato segundo que inicia
    } catch (e) {
        document.getElementById('aula-status').innerHTML = `❌ Erro ao conectar com a API`;
    }
}

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
    try {
        await fetch(`${API_URL}/cadastro/cancelar`, { method: 'POST' });
    } catch (e) {
        console.error("Erro ao cancelar rota:", e);
    }
    const feedback = document.getElementById('cadastro-feedback');
    feedback.className = "text-danger";
    feedback.innerText = "🚫 Modo cadastro cancelado.";
    restaurarBotoesCadastro();
}

async function capturarNovaTag() {
    const feedback = document.getElementById('cadastro-feedback');
    const btn = document.getElementById('btn-capturar');
    const btnCancelar = document.getElementById('btn-cancelar');
    
    document.getElementById('uid-input').value = ""; 

    try {
        feedback.className = "text-muted";
        feedback.innerText = "📡 Acionando Arduino...";
        await fetch(`${API_URL}/cadastro/iniciar`, { method: 'POST' }); 
        
        feedback.innerText = "📡 Sensor Pronto! Aproxime a tag no leitor...";
        
        btn.disabled = true;
        btn.innerText = "⏳ Aguardando leitura...";
        btn.style.background = "#475569";
        btnCancelar.style.display = "block"; 

        let tentativas = 0; 
        const maxTentativas = 15; 

        if (loopVerificacao) clearInterval(loopVerificacao);

        loopVerificacao = setInterval(async () => {
            tentativas++;
            try {
                const res = await fetch(`${API_URL}/cadastro/status`);
                const data = await res.json();
                
                if (data.uid) {
                    clearInterval(loopVerificacao);
                    document.getElementById('uid-input').value = data.uid;
                    
                    const jaExiste = listaAlunosCache.some(aluno => aluno.uid.toUpperCase() === data.uid.toUpperCase());
                    
                    if (jaExiste || data.status === "NEGADO") {
                        feedback.className = "text-danger";
                        feedback.innerText = "❌ Negado: Esta tag já está cadastrada!";
                    } else {
                        feedback.className = "text-muted";
                        feedback.innerText = "✅ Tag capturada com sucesso!";
                    }
                    restaurarBotoesCadastro();
                } else if (tentativas >= maxTentativas) {
                    clearInterval(loopVerificacao);
                    await fetch(`${API_URL}/cadastro/cancelar`, { method: 'POST' });
                    feedback.className = "text-danger";
                    feedback.innerText = "⚠️ Tempo esgotado! Nenhuma tag detectada.";
                    restaurarBotoesCadastro();
                }
            } catch (e) {
                clearInterval(loopVerificacao);
                feedback.innerText = "❌ Erro ao ler resposta do sensor.";
                restaurarBotoesCadastro();
            }
        }, 1500);

    } catch (e) {
        feedback.innerText = "❌ Erro ao ativar modo cadastro";
        restaurarBotoesCadastro();
    }
}

async function salvarAluno() {
    const feedback = document.getElementById('cadastro-feedback');
    const uid = document.getElementById('uid-input').value;
    const nome = document.getElementById('nome-input').value.trim();
    
    if (!uid || !nome) {
        feedback.innerText = "⚠️ Preencha o nome e capture a Tag primeiro!";
        return;
    }

    try {
        await fetch(`${API_URL}/cadastro/salvar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, nome })
        });
        
        feedback.className = "text-muted";
        feedback.innerText = "💾 Salvo com sucesso!";
        document.getElementById('uid-input').value = "";
        document.getElementById('nome-input').value = "";
        await carregarAlunos();
    } catch (e) {
        feedback.className = "text-danger";
        feedback.innerText = "❌ Erro ao salvar aluno";
    }
}

async function carregarAlunos() {
    try {
        const res = await fetch(`${API_URL}/alunos`);
        listaAlunosCache = await res.json();
        const tbody = document.getElementById('tabela-alunos');
        
        if (!listaAlunosCache.length) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Nenhum aluno cadastrado.</td></tr>`;
            return;
        }
        tbody.innerHTML = listaAlunosCache.map(a => `<tr><td>${a.id}</td><td><span class="tag-id">${a.uid}</span></td><td class="student-name">${a.nome}</td></tr>`).join('');
    } catch (e) {
        document.getElementById('tabela-alunos').innerHTML = `<tr><td colspan="3" style="color:var(--red);">Erro ao buscar alunos.</td></tr>`;
    }
}

// =============== AQUI ESTAVA O PROBLEMA ===============
// Esta agora é a ÚNICA função carregarPresencas.
// O "?t=" impede que o navegador esconda os dados atualizados com o cache.
async function carregarPresencas() {
    try {
        const res = await fetch(`${API_URL}/presencas?t=${Date.now()}`);
        const presencas = await res.json();
        const tbody = document.getElementById('tabela-presencas');
        
        if (!presencas || presencas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nenhuma leitura registrada hoje.</td></tr>`;
            return;
        }

        tbody.innerHTML = presencas.map(p => {
            let badgeClass = 'badge-atrasado';
            if (p.status === 'PRESENTE') badgeClass = 'badge-presente';
            else if (p.status === 'AUSENTE' || p.status === 'SAIU') badgeClass = 'badge-ausente';

            const totalFaltas = p.faltas !== undefined && p.faltas !== null ? p.faltas : 0;
            const classeFalta = totalFaltas === 0 ? 'coluna-faltas zero-faltas' : 'coluna-faltas';

            let nomeAluno = p.nome || "Não Identificado";
            if (nomeAluno === "Não Identificado" && listaAlunosCache.length > 0) {
                const alunoEncontrado = listaAlunosCache.find(a => a.uid === p.uid);
                if (alunoEncontrado) nomeAluno = alunoEncontrado.nome;
            }

            return `
                <tr>
                    <td>${p.id}</td>
                    <td><span class="tag-id">${p.uid}</span></td>
                    <td class="student-name"><b>${nomeAluno}</b></td>
                    <td><span class="badge ${badgeClass}">${p.status}</span></td>
                    <td class="${classeFalta}">${totalFaltas} bloco(s) de falta</td>
                </tr>`;
        }).join('');
    } catch (e) {
        console.error("Erro no polling de presenças:", e);
    }
}

window.onload = async () => {
    await carregarAlunos();
    await carregarPresencas();
    
    // Garante que só vai existir 1 loop rodando a cada 2 segundos
    if (presencasInterval) clearInterval(presencasInterval);
    presencasInterval = setInterval(carregarPresencas, 2000);
};