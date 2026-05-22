export interface DeliveryTask {
    id: string;
    lat: number;
    lon: number;
    packageID: string;
    timestamp: number;
}

export type ShaperResult<T> =
    | { success: true; data: T }
    | { success: false; error: 'QUEUE_OVERFLOW' | 'CIRCUIT_OPEN' | "INVALID_PAYLOAD"};

export class HydraulicTrafficShaper {
    private queue: DeliveryTask[] = [];
    private isCircuitOpen: boolean = false;
    private errorCount: number = 0;

    constructor(
        private readonly maxQueueCapacity: number   = 1000,
        private readonly errorThreshold: number     = 5,
        private readonly cooldownTimeMs: number     = 5000
    ) {}

    /**
     * Surgical Ingest Method (shock absorber)
     * Receives the high spike request and decides whether it's accepted or flow is cut.
     */
    public ingest(task: Partial<DeliveryTask>): ShaperResult<string> {
        
        // Protection 1: Quick memory validation (0(1))
        if (!task.id || !task.lat || !task.lon || !task.packageID) {
            return { success: false, error: 'INVALID_PAYLOAD'}
        }

        // Protection 2: Fuse (Circuit Breaker)
        if (this.isCircuitOpen) {
            return { success: false, error: 'CIRCUIT_OPEN'}
        }

        // Protection 3: Hydraulic pressure control
        if (this.queue.length >= this.maxQueueCapacity) {
            this.triggerCircuitBreaker();
            return { success: false, error: 'QUEUE_OVERFLOW'}
        }

        // Clean insertion into the memory queue
        this.queue.push(task as DeliveryTask);

        return { success: true, data: `Task ${task.id} queued successfully.`};
    }

    /**
     * Worker: Consumes the data in a controlled way (Decoupling)
     * This method simulates to empty the queue in batches of 50 
     * to the database or routing algorithm.
     */
    public async processBatch(batchSize: number): Promise<void> {
        if (this.queue.length === 0) return;

        // We extract the segment that the OS can process safely.
        const batch = this.queue.splice(0, batchSize);

        try {
            // Here the heavy routing algorithm is simulated.
            await this.mockDatabaseInsertion(batch);

            // If the batch is successful, we reduce the voltage of the circuit breaker.
            if (this.errorCount > 0) this.errorCount--;
            
        } catch (error) {
            this.errorCount++;
            if (this.errorCount >= this.errorThreshold) {
                this.triggerCircuitBreaker();
            }
        }
    }

    private triggerCircuitBreaker(): void {
        this.isCircuitOpen = true;
        this.queue = []; // We empty the queue to mitigate the RAM saturation

        // Automatic cooldown timer (come back to half-open / closed)
        setTimeout(() => {
            this.isCircuitOpen = false;
            this.errorCount = 0;
        }, this.cooldownTimeMs);
    }

    private mockDatabaseInsertion(task: DeliveryTask[]): Promise<void> {
        return new Promise((res) => setTimeout(res, 50)); // Simulates the 50ms I/O latency
    }

    // Diagnostic method so K6 can inspect the internal status in the workload tests
    public getMetrics() {
        return {
            currentQueueSize: this.queue.length,
            isCircuitOpen: this.isCircuitOpen,
            errorCount: this.errorCount
        };
    }
}
