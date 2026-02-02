import { Identity } from "./Identity";
import { PeerClient } from "./PeerClient";


const init = async () => {

    let user: Identity;
    let client: PeerClient;

    const btn = <HTMLButtonElement>document.querySelector("#register");
    const upload = <HTMLInputElement>document.querySelector("#login");
    const name = <HTMLSpanElement>document.querySelector("#user");

    btn.addEventListener("click", async () => {
        user = await Identity.generate();
        client = new PeerClient(user);
        await user.exportToFile();
        name.innerText = await user.generateSessionId();
        console.log(user);
    });

    upload.addEventListener("change", async () => {
        if (!upload.files) return;
        user = await Identity.FromFile(upload.files[0]);
        client = new PeerClient(user);
        name.innerText = await user.generateSessionId();
        console.log(user);
    });

    //const tbody = <HTMLElement>document.querySelector("#user-display");
    //tbody.innerHTML = "";

    //this.known.forEach((con, hash) => {

    //    let tr = document.createElement("tr");
    //    let h = document.createElement("td");
    //    let s = document.createElement("td");
    //    h.innerText = hash;
    //    s.innerText = con.connectionState;

    //    tr.appendChild(h);
    //    tr.appendChild(s);
    //    tbody.appendChild(tr);

    //});

}
init();