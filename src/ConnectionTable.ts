import { ConnectionStateData } from "./PeerConnection";

export class ConnectionTable {
    private tbody: HTMLTableSectionElement;

    constructor() {
        const tbodyEl = document.querySelector("#connections tbody");
        if (!tbodyEl || !(tbodyEl instanceof HTMLTableSectionElement)) {
            throw new Error("Invalid tbody element ID");
        }
        this.tbody = tbodyEl;
    }

    update({ peerId, status, local, remote }: ConnectionStateData) {
        let row = document.getElementById(`row-${peerId}`) as HTMLTableRowElement | null;

        if (!row) {
            row = document.createElement("tr");
            row.id = `row-${peerId}`;
            row.innerHTML = `
                <td>${peerId}</td>
                <td>${status}</td>
                <td>${local}</td>
                <td>${remote}</td>
            `;
            this.tbody.appendChild(row);
        } else {
            row.cells[1].textContent = status;
            row.cells[2].textContent = local;
            row.cells[3].textContent = remote;
        }

        switch (status) {
            case "new" : row.className = "table-info"; break;
            case "connecting" : row.className = "table-warning"; break;
            case "connected" : row.className = "table-success"; break;
            default: row.className = "table-danger"; break;
        }

    }
}