import { Game } from './game.js';

// ── Validação do nick ─────────────────────────────────────────────────────────
const NICK_RE = /^[a-zA-Z0-9_]{2,16}$/;

function validateNick(nick) {
  if (nick.length < 2)             return 'Mínimo 2 caracteres.';
  if (nick.length > 16)            return 'Máximo 16 caracteres.';
  if (!NICK_RE.test(nick))         return 'Só letras, números e _ (sem espaços).';
  return null; // válido
}

// ── Setup da tela de login ────────────────────────────────────────────────────
const game     = new Game();
const input    = document.getElementById('nick-input');
const errorEl  = document.getElementById('nick-error');
const btnEnter = document.getElementById('btn-enter');

// Preenche o nick da sessão anterior
const saved = localStorage.getItem('mc2_nick');
if (saved) input.value = saved;

// Validação em tempo real enquanto escreve
input.addEventListener('input', () => {
  const err = validateNick(input.value.trim());
  errorEl.textContent = err ?? '';
  input.classList.toggle('error', !!err && input.value.length > 0);
  input.classList.toggle('valid', !err && input.value.length > 0);
});

// Enter no input = submeter
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnEnter.click();
});

// Botão "Entrar no mundo"
btnEnter.addEventListener('click', async () => {
  const nick = input.value.trim();
  const err  = validateNick(nick);

  if (err) {
    errorEl.textContent = err;
    input.classList.add('error');
    input.focus();
    return;
  }

  // Desabilitar UI durante a ligação
  btnEnter.disabled      = true;
  btnEnter.textContent   = '⏳ A ligar...';
  errorEl.textContent    = '';
  input.disabled         = true;

  try {
    // Inicializa Three.js (só agora, porque precisa do canvas no DOM)
    game.init();

    // Liga ao servidor com o nick
    await game.login(nick);

    // Esconde a tela de login, arranca o jogo
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('overlay').style.display      = 'flex';
    document.getElementById('overlay-msg').textContent    = 'Clica para entrar no mundo';
    document.getElementById('btn-play').style.display     = 'block';

    game.start();

  } catch (e) {
    // Servidor rejeitou (nick duplicado, etc.)
    errorEl.textContent  = e.message;
    input.classList.add('error');
    btnEnter.disabled    = false;
    btnEnter.textContent = '▶ ENTRAR NO MUNDO';
    input.disabled       = false;
    input.focus();
  }
});

// Foca o input ao carregar
input.focus();
