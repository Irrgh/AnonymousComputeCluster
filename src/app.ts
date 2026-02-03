import { ConnectionTable } from "./ConnectionTable";
import { Identity } from "./Identity";
import { PeerClient } from "./PeerClient";


const init = async () => {

    let user: Identity;
    let client: PeerClient;

    const table = new ConnectionTable();

    const btn = <HTMLButtonElement>document.querySelector("#register");
    const upload = <HTMLInputElement>document.querySelector("#login");
    const name = <HTMLSpanElement>document.querySelector("#user");

    btn.addEventListener("click", async () => {
        user = await Identity.generate();
        client = new PeerClient(user,table);
        await user.exportToFile();
        name.innerText = await user.generateSessionId();
        console.log(user);
    });

    upload.addEventListener("change", async () => {
        if (!upload.files) return;
        user = await Identity.FromFile(upload.files[0]);
        client = new PeerClient(user,table);
        name.innerText = await user.generateSessionId();
        console.log(user);
    });



}
init();