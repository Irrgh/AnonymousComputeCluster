import { ConnectionStatus, PeerInfo } from "./PeerConnection";
export class ConnectionTable {
    private tbody: HTMLTableSectionElement;
    private peers = new Map<string, PeerInfo>();

    constructor() {
        const tbodyEl = document.querySelector("#connections tbody");
        if (!tbodyEl || !(tbodyEl instanceof HTMLTableSectionElement)) {
            throw new Error("Invalid tbody element ID");
        }
        this.tbody = tbodyEl;
    }


    handleEvent(event: PeerInfo) {
        const peer = this.peers.get(event.peerId) ?? { peerId: event.peerId };

        if (event.connection) peer.connection = event.connection;
        if (event.hardware) peer.hardware = event.hardware;
        if (event.traffic) peer.traffic = event.traffic;

        this.peers.set(event.peerId, peer);
        this.renderPeer(peer);
    }

    private renderPeer(peer: PeerInfo) {
        let row = document.getElementById(
            `row-${peer.peerId}`
        ) as HTMLTableRowElement | null;

        if (!row) {
            row = document.createElement("tr");
            row.id = `row-${peer.peerId}`;
            row.innerHTML = `
                <td></td>
                <td></td>
                <td></td>
                <td><div class="spinner-border spinner-border-sm" role="status"></div></td>
                <td><div class="spinner-border spinner-border-sm" role="status"></div></td>
                <td><div class="spinner-border spinner-border-sm" role="status"></div></td>
            `;
            this.tbody.appendChild(row);
        }

        this.updateCells(row, peer);
        this.updateRowStyle(row, peer.connection?.status);
    }

    private updateCells(row: HTMLTableRowElement, peer: PeerInfo) {
        const { connection, hardware, traffic } = peer;

        row.cells[0].textContent = peer.peerId;

        // Status
        row.cells[1].textContent =
            connection?.status ?? "unknown";

        // ICE info
        if (connection?.keypair) {
            const { local, remote } = connection.keypair;
            row.cells[2].textContent =
                `${local.type}[${local.protocol}] : ${remote.type}[${remote.protocol}]`;
        } else {
            row.cells[2].textContent = "-";
        }

        // Traffic
        if (traffic) {
            row.cells[3].innerHTML = `
              <i class="bi bi-arrow-down"></i> ${this.formatBps(traffic.down)}
              /
              <i class="bi bi-arrow-up"></i> ${this.formatBps(traffic.up)}
            `;
        } 
        
        
        if (hardware) {
            row.cells[4].textContent =
                `${hardware.cpus_usage}% / ${hardware.cpus * 100}%`;
            row.cells[5].textContent =
                `${this.formatBytes(hardware.storageUsed)} / ${this.formatBytes(hardware.storageLimit)}`;
        } 
        
    }

    private updateRowStyle(
        row: HTMLTableRowElement,
        status?: RTCPeerConnectionState
    ) {
        row.className = "";

        switch (status) {
            case "new":
                row.classList.add("table-info");
                break;
            case "connecting":
                row.classList.add("table-warning");
                break;
            case "connected":
                row.classList.add("table-success");
                break;
            case "failed":
            case "disconnected":
                row.classList.add("table-danger");
                break;
        }
    }

    private formatBps(bytesPerSec: number): string {
        if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
        if (bytesPerSec < 1024 ** 2) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
        if (bytesPerSec < 1024 ** 3) return `${(bytesPerSec / 1024).toFixed(1)} MB/s`;
        return `${(bytesPerSec / 1024 ** 3).toFixed(1)} MB/s`;
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
        if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
        return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
    }

}