export interface MockConnection {
  id: string;
  query: (payload: any) => Promise<void>;
  isAvailable: boolean
}

export class ConnectionPoolManager {
  private pool: MockConnection[] = [];
  private connectionWaitingQueue: ((conn: MockConnection) => void)[] = [];

  constructor(
    private readonly poolSize:            number = 5,
    private readonly connectionTimeoutMs: number = 3000
  ) {
    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push({
        id: `db-conn-00${i + 1}`,
        isAvailable: true,
        query: async (payload: any) => {
          await new Promise((res) => setTimeout(res, 50));
        }
      });
    }
  }

  public acquire(): Promise<MockConnection> {
    const availableConnection = this.pool.find(c => c.isAvailable);
    
    if (availableConnection) {
      availableConnection.isAvailable = false;
      return Promise.resolve(availableConnection);
    }

    return new Promise((res, rej) => {
      const timeout = setTimeout(() => {
        this.connectionWaitingQueue = this.connectionWaitingQueue.filter(q => q !== res);
        rej(new Error('POOL_CONNECTION_TIMEOUT: The data server is overloaded.'));
      }, this.connectionTimeoutMs);

      this.connectionWaitingQueue.push((conn: MockConnection) => {
        clearTimeout(timeout);
        conn.isAvailable = false;
        res(conn);
      });
    });
  }

  public release(conn: MockConnection): void {
    const poolConn = this.pool.find(c => c.id === conn.id);
    if (!poolConn) return;

    if (this.connectionWaitingQueue.length > 0) {
      const nextInLine = this.connectionWaitingQueue.shift();
      if(nextInLine) {
        nextInLine(poolConn);
        return;
      }
    }

    poolConn.isAvailable = true;
  }

  public getPoolStats() {
    return {
      availableConnections: this.pool.filter(c => c.isAvailable).length,
      pendingRequestsInQueue: this.connectionWaitingQueue.length
    };
  }
}
