import { HardwareUsageInfo } from "./PeerConnection";

export interface TaskInit {
    progId: string,
    code: string, // code always has a main(args[]) function
}

export interface Task {
    progId: string,
    taskId: string,
    funcArgs: any
}


export class TaskPool {

    private workerCode?: string;
    private workers: Worker[] = [];
    private idleWorkers: number[] = [];
    private idleWaiters: ((id: number) => void)[] = [];

    private gpu?: GPUAdapter;
    private triedGPU: boolean = false;
    private usage: number[] = [];

    private codeCache: Map<string, ArrayBuffer> = new Map();

    private readonly TIMEOUT_MS = 5000;

    constructor(private size: number) {
        for (let i = 0; i < size; i++) {
            this.workers[i] = this.createWorker(i);
            this.idleWorkers.push(i);

            this.workers[i].addEventListener("message", (e) => {
                
                if (e.data.type === "usage") {
                    this.usage[e.data.thread] = Math.round(e.data.cpu * 100);
                }


            });


        }
    }



    public queryUsage = async () => {
        if (!this.gpu && !this.triedGPU) {
            const adapter = await navigator.gpu.requestAdapter();
            this.triedGPU = true;
            if (adapter) this.gpu = adapter;
        }
        const estimate = await navigator.storage.estimate();

        let cpuUsage = 0.0;

        this.usage.forEach(element => {
            cpuUsage += element;
        });


        const usage: HardwareUsageInfo = {
            cpus: navigator.hardwareConcurrency,
            cpus_usage: cpuUsage,
            gpu: this.gpu?.info,
            gpu_usage: 0,
            storageLimit: estimate.quota ? estimate.quota : 0,
            storageUsed: estimate.usage ? estimate.usage : 0
        }

        return usage;
    }

    public enqueueTask(task: Task): Promise<any> {
        return new Promise(async (resolve, reject) => {
            try {
                const workerId = await this.scheduleIdleWorkerId();
                const worker = this.workers[workerId];
                console.log(`processing on worker ${workerId}`);

                let timeout: number;

                const onMessage = (e: MessageEvent) => {
                    if (e.data.taskId !== task.taskId) return;

                    if (e.data.type === "result") {
                        //console.log("finished!");
                        clearTimeout(timeout);
                        worker.removeEventListener("message", onMessage);
                        this.releaseWorker(workerId);
                        resolve(e.data.data);
                    } else if (e.data.type === "started") {
                        //console.log("started");
                        timeout = setTimeout(async () => {
                            this.regenerateWorker(worker, workerId);
                            reject(new Error("Task timed out"));
                        }, this.TIMEOUT_MS);
                    } else if (e.data.type === "error") {
                        this.regenerateWorker(worker, workerId);
                        reject(new Error(e.data.error));
                    }
                };

                worker.addEventListener("message", onMessage);

                worker.postMessage({
                    type: "execute",
                    progId: task.progId,
                    taskId: task.taskId,
                    args: { funcArgs: task.funcArgs },
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    private regenerateWorker = async (worker: Worker, workerId: number) => {
        worker.terminate();
        this.workers[workerId] = this.createWorker(workerId);
        // TODO: maybe reupload code here
        this.releaseWorker(workerId);
    }


    private scheduleIdleWorkerId(): Promise<number> {
        return new Promise((resolve) => {
            const workerId = this.idleWorkers.pop();
            if (workerId !== undefined) {
                resolve(workerId);
            } else {
                this.idleWaiters.push(resolve);
            }
        });
    }

    private releaseWorker(workerId: number) {
        const waiter = this.idleWaiters.shift();
        if (waiter) {
            waiter(workerId);
        } else {
            this.idleWorkers.push(workerId);
        }
    }

    public uploadTask = async (task: TaskInit) => {
        const blob = new Blob([task.code], {
            type: "application/javascript",
        });
        const url = URL.createObjectURL(blob);

        return Promise.all(
            this.workers.map((worker, workerId) => {
                return new Promise<void>((resolve, reject) => {
                    const handler = (e: MessageEvent) => {
                        if (e.data.progId === task.progId && e.data.type === "uploaded") {
                            worker.removeEventListener("message", handler);
                            resolve();
                        } else {
                            reject();
                        }
                    };

                    worker.addEventListener("message", handler);
                    worker.postMessage({
                        type: 'upload',
                        progId: task.progId,
                        args: { codeURL: url },
                    });
                });
            })
        );
    }

    private createWorker = (workerId: number) => {
        const workerCode = `
        //# sourceURL = task-pool-worker
        const programs = {};
        const thread = ${workerId}

        let busyTime = 0;
        let windowStart = performance.now();

        setInterval(() => {
            const now = performance.now();
            const elapsed = now - windowStart;

            const utilization = Math.min(busyTime / elapsed, 1);

            postMessage({
                type: "usage",
                cpu: utilization, // 0.0 → 1.0
                thread
            });

            // reset window
            busyTime = 0;
            windowStart = now;
        }, 1000);

        const importCode = async (progId, codeURL) => {
            return import(codeURL).then((module) => {
                programs[progId] = module.main;
            });
        }
    
        self.onmessage = async (event) => {
            const { type, progId, taskId, args } = event.data;
            const start = performance.now();

            try {
                if (type === 'upload') {
                    await importCode(progId, args.codeURL);
                    postMessage({ type: "uploaded", progId });
                }
                if (type === 'execute') {   
                    const fn = programs[progId];
                    if (!fn) throw new Error("Program not uploaded: " + progId);

                    postMessage({type:"started", taskId});
                    const result = await fn(...args.funcArgs);
                    postMessage({type:"result", taskId, data:result});
                }
            } catch (err) {
                postMessage({
                    type: "error",
                    progId,
                    taskId,
                    error: err?.message ?? String(err)
                });
            }  
            busyTime += performance.now() - start;  
        }`;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);

        const worker = new Worker(url, { name: `task-pool-worker-${workerId}` });

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);

        return worker;
    };

}



