import { ConnectionTable } from "./ConnectionTable";
import { Identity } from "./Identity";
import { PeerClient } from "./PeerClient";
import { TaskPool } from "./TaskPool";


async function collectFilesAsStrings(
    dirHandle: FileSystemDirectoryHandle
): Promise<string[]> {
    const files: string[] = [];

    for await (const entry of dirHandle.values()) {
        if (entry.kind === "file") {
            const file = await entry.getFile();
            const text = await file.text();
            files.push(text);
        } else if (entry.kind === "directory") {
            // recurse into subdirectories
            const nestedFiles = await collectFilesAsStrings(entry);
            files.push(...nestedFiles);
        }
    }

    return files;
}

const init = async () => {

    let user: Identity;
    let client: PeerClient;

    const table = new ConnectionTable();

    const btn = <HTMLButtonElement>document.querySelector("#register");
    const upload = <HTMLInputElement>document.querySelector("#login");
    const name = <HTMLSpanElement>document.querySelector("#user");
    const dispatch = <HTMLButtonElement>document.querySelector("#dispatch");

    const pool: TaskPool = new TaskPool(4);

    btn.addEventListener("click", async () => {
        user = await Identity.generate();
        client = new PeerClient(user, table, pool);
        await user.exportToFile();
        name.innerText = await user.generateSessionId();
        console.log(user);
    });

    upload.addEventListener("change", async () => {
        if (!upload.files) return;
        user = await Identity.FromFile(upload.files[0]);
        client = new PeerClient(user, table, pool);
        name.innerText = await user.generateSessionId();
        console.log(user);
    });



    dispatch.addEventListener("click", async () => {
        if (!client) {
            alert("not connected!");
            return;
        }

        const dirHandle = await window.showDirectoryPicker();

        const files = await collectFilesAsStrings(dirHandle);

        const code = `
            export const main = async (str) => {
                const buf = new TextEncoder().encode(str).buffer;
                let hash = await self.crypto.subtle.digest("SHA-512", buf);

                for (let i = 0; i < 5000; i++) {
                    hash = new Uint8Array(
                        await crypto.subtle.digest("SHA-512", hash)
                    );
                }

                return hash.toHex();
            } 
        `;

        let args : any[][] = [];

        files.forEach(file => {
            args.push([file]);
        });

        client.submitTasks("hashing",code,args)
    });




}
init();