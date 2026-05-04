/**
 * Wrapper sobre socket.io com ligação lazy:
 *  1. Regista handlers com .on() a qualquer momento
 *  2. Só liga ao servidor quando .connect(nick) é chamado
 *  3. Handlers registados antes de connect() são aplicados
 *     sincronamente ao criar o socket — sem risco de perder eventos
 */
export class Network {
  constructor() {
    this.socket           = null;
    this._connected       = false;
    this._pendingHandlers = []; // handlers registados antes de connect()
  }

  // ── Registo de eventos ───────────────────────────────────────────────────────

  /**
   * Regista um handler de evento.
   * Pode ser chamado ANTES de connect() — fica em fila e é aplicado
   * sincronamente quando o socket é criado.
   */
  on(event, fn) {
    if (this.socket) {
      this.socket.on(event, fn);
    } else {
      this._pendingHandlers.push([event, fn]);
    }
    return this;
  }

  // ── Ligação ──────────────────────────────────────────────────────────────────

  /**
   * Liga ao servidor com o nick dado.
   * Devolve Promise que:
   *   - resolve() se o servidor aceitar o nick
   *   - reject(Error) se nick duplicado ou inválido
   */
  connect(nick) {
    return new Promise((resolve, reject) => {
      // Passa o nick como auth do socket.io
      this.socket = io({ auth: { nick } });

      // Aplica TODOS os handlers pendentes antes de qualquer evento chegar
      for (const [event, fn] of this._pendingHandlers) {
        this.socket.on(event, fn);
      }
      this._pendingHandlers = [];

      // Resposta do servidor ao login
      this.socket.once('login:ok', () => {
        this._connected = true;
        resolve();
      });

      this.socket.once('login:error', ({ message }) => {
        // Servidor rejeitou — desliga e devolve o erro
        this.socket.disconnect();
        this.socket = null;
        reject(new Error(message));
      });

      this.socket.once('connect_error', () => {
        this.socket = null;
        reject(new Error('Não foi possível ligar ao servidor. Tenta de novo.'));
      });

      this.socket.on('disconnect', () => {
        this._connected = false;
      });
    });
  }

  // ── Emissores ────────────────────────────────────────────────────────────────

  sendMove(x, y, z, rotY, moving = false) {
    if (!this._connected) return;
    this.socket.emit('player:move', { x, y, z, rotY, moving });
  }

  sendBlockBreak(x, y, z) {
    if (!this._connected) return;
    this.socket.emit('block:break', { x, y, z });
  }

  sendBlockPlace(x, y, z, type) {
    if (!this._connected) return;
    this.socket.emit('block:place', { x, y, z, type });
  }
}
