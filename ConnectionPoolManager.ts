// 1. Contrato del Socket Simulado (El plano del cable de red)
export interface MockConnection {
  id: string;
  query: (payload: any) => Promise<void>;
  isAvailable: boolean;
}

// 2. Administrador y Gobernador de Sockets (El guardia del banco)
export class ConnectionPoolManager {
  private pool: MockConnection[] = [];
  // Cola pasiva que suspende funciones de resolución en la memoria RAM
  private connectionWaitingQueue: ((conn: MockConnection) => void)[] = [];

  constructor(
    private readonly poolSize: number = 5,           // Límite estricto de ventanillas físicas
    private readonly connectionTimeoutMs: number = 3000 // Umbral de asfixia por espera
  ) {
    this.initializePool();
  }

  /**
   * Precalentamiento de Infraestructura
   * Abre físicamente los canales de comunicación al arrancar el servidor.
   */
  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push({
        id: `db-conn-00${i + 1}`,
        isAvailable: true,
        query: async (payload: any) => {
          // Simula la latencia hidráulica de escritura en disco duro (50ms I/O)
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      });
    }
  }

  /**
   * Adquisición Quirúrgica de Conexión
   * Entrega un recurso libre en O(1) o congela la petición en el Event Loop de forma pasiva.
   */
  public acquire(): Promise<MockConnection> {
    const availableConnection = this.pool.find(c => c.isAvailable);

    // Camino Feliz: Hay un cable libre, lo marcamos como ocupado y lo entregamos ya mismo
    if (availableConnection) {
      availableConnection.isAvailable = false;
      return Promise.resolve(availableConnection);
    }

    // Camino de Alta Presión: No hay recursos. Suspendemos la petición de forma cuántica
    return new Promise((resolve, reject) => {
      // Fusible de seguridad por si la base de datos tarda una eternidad
      const timeout = setTimeout(() => {
        // Limpiamos la función moribunda de la cola para evitar Memory Leaks
        this.connectionWaitingQueue = this.connectionWaitingQueue.filter(q => q !== resolve);
        reject(new Error('POOL_CONNECTION_TIMEOUT: El servidor de datos está saturado.'));
      }, this.connectionTimeoutMs);

      // Encolamos el disparador asíncrono en el pasillo de espera
      this.connectionWaitingQueue.push((conn: MockConnection) => {
        clearTimeout(timeout); // Cancelamos el fusible de muerte, la conexión ya es nuestra
        conn.isAvailable = false;
        resolve(conn);
      });
    });
  }

  /**
   * Liberación Mecánica de Conexión
   * Devuelve el recurso a la piscina o lo inyecta directamente al siguiente en la fila.
   */
  public release(connection: MockConnection): void {
    const poolConn = this.pool.find(c => c.id === connection.id);
    if (!poolConn) return;

    // Si hay alguien congelado en el pasillo, le transferimos el cable de inmediato (Pass-Through)
    if (this.connectionWaitingQueue.length > 0) {
      const nextInLine = this.connectionWaitingQueue.shift();
      if (nextInLine) {
        nextInLine(poolConn); // Despierta la función asíncrona suspendida sin tocar ciclos de CPU
        return;
      }
    }

    // Si el pasillo está vacío, la luz del cable vuelve a verde
    poolConn.isAvailable = true;
  }

  /**
   * Telemetría de Diagnóstico
   * Expone el estado interno para que los scripts de k6 analicen las costuras del sistema.
   */
  public getPoolStats() {
    return {
      availableConnections: this.pool.filter(c => c.isAvailable).length,
      pendingRequestsInQueue: this.connectionWaitingQueue.length
    };
  }
}
