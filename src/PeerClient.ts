import { Hash, Identity } from './Identity';
import { PeerConnection, HardwareUsageInfo, PeerInfo, DEAD_STATES } from './PeerConnection';
import { ConnectionTable } from './ConnectionTable';
import { TaskPool } from './TaskPool';

export const domain: string = "adbc-acc-test.duckdns.org";

export class PeerClient {

    private signal: WebSocket;
    private conf: RTCConfiguration;
    private known: Map<Hash, PeerConnection> = new Map();
    private sessionId: Promise<Hash>;

    private advertisingInterval?: number;

    constructor(private user: Identity, private table: ConnectionTable, private taskPool : TaskPool) {
        this.sessionId = this.user.generateSessionId();
        this.conf = {
            iceServers: [
                {
                    urls: `stun:${domain}:3478`
                },
                {
                    urls: `turn:${domain}:3478`,
                    username: "test",
                    credential: "test"
                },
                {
                    urls: `turns:${domain}:5349`,
                    username: "test",
                    credential: "test"
                }
            ],
        };

        this.signal = new WebSocket(`wss://${window.location.hostname}:${window.location.port}`);

        this.signal.addEventListener("message", this.message);
        this.signal.addEventListener("error", this.error);
        this.signal.addEventListener("close", this.close);
        this.signal.addEventListener("open", this.advertise);


    }

    private advertise = async () => {
        let info = {
            type: "advertise",
            hash: await this.sessionId,
        };

        this.signal.send(JSON.stringify(info));

        window.setTimeout(() => {
            this.signal.send(JSON.stringify(info));
        }, 5_000);
    }

    private peerChange = (info: PeerInfo) => {
        this.table.handleEvent(info);
        if (info.connection && DEAD_STATES.includes(info.connection.status)) {
            this.known.get(info.peerId)?.destroy();
            this.known.delete(info.peerId);
        }
    }

    private offerConnectionToRemoteHost = async (remote: Hash) => {
        if (this.known.has(remote)) return;
        const peer: PeerConnection = new PeerConnection(await this.sessionId, remote, this.conf, this.signal, this.taskPool);
        peer.on("peerChange", this.peerChange);
        peer.createOffer();
        this.known.set(remote, peer);
    }


    private sendAnswer = async (offer: RTCSessionDescriptionInit, remote: Hash) => {
        if (this.known.has(remote)) return;
        const peer: PeerConnection = new PeerConnection(await this.sessionId, remote, this.conf, this.signal, this.taskPool);
        peer.on("peerChange", this.peerChange);
        peer.createAnswer(offer);
        this.known.set(remote, peer);
    }

    private acceptAnswer = async (answer: RTCSessionDescriptionInit, remote: Hash) => {
        if (!this.known.has(remote)) {
            throw new Error(`Remote client should be on the list of know clients.`);
        }
        const peer: PeerConnection = this.known.get(remote)!;
        peer.acceptAnswer(answer);
    }

    private addCandidate = async (candidate: RTCIceCandidate, remote: Hash) => {
        if (!this.known.has(remote)) {
            console.warn("Candidate for unknown peer", remote);
        }
        const peer: PeerConnection = this.known.get(remote)!;
        peer.addCandidate(candidate);
    }

    private message = async (event: MessageEvent) => {
        const message = JSON.parse(event.data);

        const { type } = message;

        console.log(message);

        switch (type) {
            case "advertise": this.offerConnectionToRemoteHost(message.hash); break;
            case "offer": this.sendAnswer(message.offer, message.src); break;
            case "answer": this.acceptAnswer(message.answer, message.src); break;
            case "candidate": this.addCandidate(message.candidate, message.src); break;
        }
    };

    private error = (event: Event) => {
        console.error(event);
    }

    private close = (event: CloseEvent) => {
        console.error(event);
    };
}