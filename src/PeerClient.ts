import { Hash, Identity } from './Identity';
import { PeerConnection } from './PeerConnection';

export const domain: string = "adbc-acc-test.duckdns.org";

export class PeerClient {

    private signal: WebSocket;
    private conf: RTCConfiguration;
    private known: Map<Hash, PeerConnection> = new Map();
    private sessionId: Promise<Hash>;

    constructor(private user: Identity) {
        this.sessionId = this.user.generateSessionId();
        this.conf = {
            iceServers: [
                {
                    urls: `stun:${domain}:3478`
                },
                {
                    urls: `turn:${domain}:3478`,
                    username:"test",
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
    }

    private offerConnectionToRemoteHost = async (remote: Hash) => {
        const peer: PeerConnection = new PeerConnection(await this.sessionId, remote, this.conf, this.signal);
        peer.createOffer();
        this.known.set(remote, peer);
    }


    private sendAnswer = async (offer: RTCSessionDescriptionInit, remote: Hash) => {
        const peer: PeerConnection = new PeerConnection(await this.sessionId, remote, this.conf, this.signal);
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