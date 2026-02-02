import { Hash } from "./Identity";

export class PeerConnection {

    private pc: RTCPeerConnection;
    private channel?: RTCDataChannel;
    private pendingCandidates: RTCIceCandidate[] = [];

    constructor(
        readonly local: Hash,
        readonly remote: Hash,
        config: RTCConfiguration,
        private readonly ws: WebSocket
    ) {
        this.remote = remote;
        this.pc = new RTCPeerConnection(config);

        this.pc.addEventListener("icecandidate", (e) => {
            if (e.candidate) {
                this.ws.send(JSON.stringify({
                    type: "candidate",
                    dest: this.remote,
                    candidate: e.candidate
                }));
            }
        });

        this.pc.addEventListener("connectionstatechange", () => {
            console.log(`[${this.remote}] PC`, this.pc.connectionState);
        });

        this.pc.addEventListener("iceconnectionstatechange", () => {
            console.log(`[${this.remote}] ICE`, this.pc.iceConnectionState);
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
    }

    private acceptAnswer = async (answer: RTCSessionDescriptionInit) => {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        for (const c of this.pendingCandidates) {
            await this.pc.addIceCandidate(c);
        }
        this.pendingCandidates.length = 0;
    }

    private addCandidate = async (candidate : RTCIceCandidate) => {
        if (this.pc.remoteDescription) {
            this.pc.addIceCandidate(candidate);
        } else {
            this.pendingCandidates.push(candidate);
        }
    }



}