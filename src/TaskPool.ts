import { HardwareUsageInfo } from "./PeerConnection";

export interface TaskInit {
    id: string,
    code: ArrayBuffer, // code always has a main(args[]) function
}

export interface Task {
    id: string,
    funcArgs: any
}


export class TaskPool {

    private workerCode?: string;
    private workers: Worker[] = [];
    private idleWorkers: number[] = [];
    private taskQueue: Task[] = [];
    private pending = new Map<
        string,
        { resolve: Function; reject: Function; timeout: any; workerId: number }
    >();
    private gpu? : GPUAdapter;
    private triedGPU : boolean = false;

    private readonly TIMEOUT_MS = 5000;

    constructor(private size: number) {
        for (let i = 0; i < size; i++) {
            this.initWorkerCode();
            this.workers[i] = this.createWorker(i);
        }
    }

    public enqueueTask(task: Task): Promise<any> {
        return new Promise((resolve, reject) => {
            this.taskQueue.push(task);
            this.processQueue(resolve, reject);
        });
    }

    public queryUsage = async () => {
        if (!this.gpu && !this.triedGPU) {
            const adapter = await navigator.gpu.requestAdapter();
            this.triedGPU = true;
            if (adapter) this.gpu = adapter;
        }
        const estimate = await navigator.storage.estimate();

        const usage: HardwareUsageInfo = {
            cpus: navigator.hardwareConcurrency,
            cpus_usage: 0,
            gpu: this.gpu?.info,
            gpu_usage: 0,
            storageLimit: estimate.quota ? estimate.quota : 0,
            storageUsed: estimate.usage ? estimate.usage : 0
        }

        return usage;
    }


    private processQueue(resolve?: Function, reject?: Function) {
        if (this.taskQueue.length === 0) return;
        if (this.idleWorkers.length === 0) return;

        const workerId = this.idleWorkers.pop()!;
        const worker = this.workers[workerId];
        const task = this.taskQueue.shift()!;

        const timeout = setTimeout(() => {
            // hard kill
            worker.terminate();
            this.workers[workerId] = this.createWorker(workerId);
            this.idleWorkers.push(workerId);

            this.pending.get(task.id)?.reject(
                new Error("Task timed out")
            );
            this.pending.delete(task.id);

            // continue processing
            this.processQueue();
        }, this.TIMEOUT_MS);

        const onMessage = (e: MessageEvent) => {
            if (e.data.id !== task.id) return;

            clearTimeout(timeout);
            worker.removeEventListener("message", onMessage);
            this.idleWorkers.push(workerId);

            if (e.data.type === "result") {
                this.pending.get(task.id)?.resolve(e.data.result);
            } else {
                this.pending.get(task.id)?.reject(new Error(e.data.error));
            }

            this.pending.delete(task.id);
            this.processQueue();
        };

        worker.addEventListener("message", onMessage);

        this.pending.set(task.id, {
            resolve: resolve!,
            reject: reject!,
            timeout,
            workerId,
        });

        worker.postMessage({
            id: task.id,
            type: "execute",
            args: { funcArgs: task.funcArgs },
        });
    }



    public uploadTask = async (task: TaskInit) => {
        const blob = new Blob([task.code], {
            type: "application/javascript",
        });
        const url = URL.createObjectURL(blob);

        await Promise.all(
            this.workers.map((worker, workerId) => {
                return new Promise<void>((resolve, reject) => {
                    const handler = (e: MessageEvent) => {
                        if (e.data.id === task.id && e.data.type === "uploaded") {
                            worker.removeEventListener("message", handler);
                            resolve();
                        } else {
                            reject();
                        }
                    };

                    worker.addEventListener("message", handler);
                    worker.postMessage({
                        type: 'upload',
                        id: task.id,
                        args: { codeURL: url },
                    });
                });
            })
        );
    }

    private initWorkerCode = () => {
        const workerCode = `
        //# sourceURL = task-pool-worker
        const userCode = {};

        const importCode = async (taskId, codeURL) => {
            import(codeURL).then((module) => {
                userCode[taskId] = module.main;
        });
        }
    
        self.onmessage = async (event) => {
            const { id, type, args } = event.data;
        
            try {
                if (type === 'upload') {
                    await importCode(id, args.codeURL);
                    postMessage({ id, type: "uploaded" });
                }
                if (type === 'execute') {   
                    userCode[id].main(...(args.funcArgs)).then((res) => {
                        postMessage({id, type:"result", data:res});
                    });
                }
            } catch {
                postMessage({
                    id,
                    type: "error",
                    error: err?.message ?? String(err)
                });
            }
            
        }`;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.workerCode = URL.createObjectURL(blob);
    }

    private createWorker = (workerId : number) => {
        return new Worker(this.workerCode!, {name:`task-pool-worker-${workerId}`});
    };

}



