import { EventEmitter } from "./EventEmitter";
import { Hash } from "./Identity";

export interface ConnectionStateData {
    peerId: string;
    status: RTCPeerConnectionState;
    local: string;
    remote: string;
}


export class PeerConnection extends EventEmitter<{ stateChange: ConnectionStateData }> {

    private pc: RTCPeerConnection;
    private channel?: RTCDataChannel;
    private pendingCandidates: RTCIceCandidate[] = [];

    constructor(
        readonly local: Hash,
        readonly remote: Hash,
        config: RTCConfiguration,
        private readonly ws: WebSocket
    ) {
        super();
        this.remote = remote;
        this.pc = new RTCPeerConnection(config);

        this.pc.addEventListener("icecandidate", (e) => {
            if (e.candidate) {
                this.ws.send(JSON.stringify({
                    type: "candidate",
                    src: this.local,
                    dest: this.remote,
                    candidate: e.candidate
                }));
            }
        });

        this.pc.addEventListener("icegatheringstatechange", () => {
            //console.log(`[${this.remote}] ICE gathering`, this.pc.iceGatheringState);
        })

        this.pc.addEventListener("connectionstatechange", async () => {
            const status = this.pc.connectionState;
            let local = "-";
            let remote = "-";

            if (status === "connected" && this.pc.sctp) {
                const pair = this.pc.sctp.transport.iceTransport.getSelectedCandidatePair();
                if (pair) {
                    local = `${pair.local.type}[${pair.local.protocol}]`;
                    remote = `${pair.remote.type}[${pair.remote.protocol}]`;
                }
            }
            this.emit("stateChange", { peerId: this.remote, status, local, remote });
        });

        this.pc.addEventListener("icecandidateerror", (e) => {

        });

        this.pc.addEventListener("iceconnectionstatechange", async () => {
            //console.log(`[${this.remote}] ICE`, this.pc.iceConnectionState);
        });

        this.pc.addEventListener("datachannel", (e) => {
            this.channel = e.channel;
            this.channel.onopen = () => console.log(`[${this.remote}] DataChannel open`);
            this.channel.onclose = () => console.log(`[${this.remote}] DataChannel closed`);
        });
    }

    public createOffer = async () => {
        this.channel = this.pc.createDataChannel("data");
        this.channel.onopen = () => console.log(`[${this.remote}] DataChannel open`);
        this.channel.onclose = () => console.log(`[${this.remote}] DataChannel closed`);

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.ws.send(JSON.stringify({
            type: "offer",
            offer: offer,
            src: this.local,
            dest: this.remote
        }));
    }

    public createAnswer = async (offer: RTCSessionDescriptionInit) => {
        await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer: RTCSessionDescriptionInit = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.ws.send(JSON.stringify({
            type: "answer",
            answer: answer,
            src: this.local,
            dest: this.remote
        }));
        for (const c of this.pendingCandidates) {
            try {
                await this.pc.addIceCandidate(c);
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        }
        this.pendingCandidates = [];
    }

    public acceptAnswer = async (answer: RTCSessionDescriptionInit) => {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        for (const c of this.pendingCandidates) {
            try {
                await this.pc.addIceCandidate(c);
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        }
        this.pendingCandidates = [];
    }

    public addCandidate = async (candidate: RTCIceCandidate) => {
        if (this.pc.remoteDescription) {
            this.pc.addIceCandidate(candidate);
        } else {
            this.pendingCandidates.push(candidate);
        }
    }



}