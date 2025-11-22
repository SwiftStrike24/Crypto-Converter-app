import CryptoWorker from '../workers/cryptoWorker?worker';
import { WorkerResponse } from '../workers/cryptoWorker';

class WorkerService {
    private worker: Worker;

    constructor() {
        this.worker = new CryptoWorker();
    }

    public getWorker(): Worker {
        return this.worker;
    }

    public terminate() {
        this.worker.terminate();
    }
}

// Singleton instance
export const workerService = new WorkerService();

// Helper to wrap worker calls in promises
export const runWorkerTask = <T>(type: string, payload: any): Promise<T> => {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);
        const worker = workerService.getWorker();

        const handleMessage = (event: MessageEvent<WorkerResponse>) => {
            const data = event.data;
            if (data.id === id) {
                worker.removeEventListener('message', handleMessage);
                if (data.type === 'ERROR') {
                    reject(new Error(data.error));
                } else {
                    resolve(data.payload as T);
                }
            }
        };

        worker.addEventListener('message', handleMessage);
        worker.postMessage({ id, type, payload });
    });
};
