import { EventEmitter } from "./EventEmitter";
import { Hash } from "./Identity";


export interface PeerInfo {
    peerId: Hash,
    connection?: ConnectionStatus,
    hardware?: HardwareUsageInfo,
    traffic?: TrafficInfo
}


export interface ConnectionStatus {
    status: RTCPeerConnectionState,
    keypair?: RTCIceCandidatePair,
}


export interface HardwareUsageInfo {
    cpus: number,
    cpus_usage: number, // 100% per cpu
    gpu?: GPUAdapterInfo,
    gpu_usage: number
    storageLimit: number,
    storageUsed: number
}

export interface TrafficInfo {
    up: number, // bytes per second
    down: number, // bytes per second
}

export interface PeerEvent {
    peerChange: PeerInfo
}


export const DEAD_STATES: RTCPeerConnectionState[] = [
    "failed",
    "closed",
    "disconnected"
];

export class PeerConnection extends EventEmitter<PeerEvent> {

    private pc: RTCPeerConnection;
    private channel?: RTCDataChannel;
    private pendingCandidates: RTCIceCandidate[] = [];
    public remoteUsage?: HardwareUsageInfo;
    private hardwareInterval?: number;

    constructor(
        readonly local: Hash,
        readonly remote: Hash,
        config: RTCConfiguration,
        private readonly ws: WebSocket,
        private readonly hardware: () => Promise<HardwareUsageInfo>
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

            let keypair = this.pc.sctp?.transport.iceTransport.getSelectedCandidatePair();

            this.emit("peerChange", {
                peerId: this.remote,
                connection: { status, keypair: keypair ? keypair : undefined }
            });
        });

        this.pc.addEventListener("icecandidateerror", (e) => {

        });

        this.pc.addEventListener("iceconnectionstatechange", async () => {
            //console.log(`[${this.remote}] ICE`, this.pc.iceConnectionState);
        });

        this.pc.addEventListener("datachannel", (e) => {
            this.channel = e.channel;
            this.channel.onopen = () => {
                console.log(`[${this.remote}] DataChannel open`);
                this.setupChannelHandlers();
                this.startHardwareReport();
            }

            this.channel.onclose = () => {
                console.log(`[${this.remote}] DataChannel closed`);
                this.stopHardwareReport();
            }
        });
    }

    private startHardwareReport = async () => {
        if (!this.channel || this.hardwareInterval) return;

        this.hardwareInterval = window.setInterval(async () => {
            if (this.channel?.readyState !== "open") return;

            const usage = await this.hardware();

            this.channel.send(JSON.stringify({
                type: "hardware",
                data: usage
            }));
        }, 1000);
    }

    private stopHardwareReport = async () => {
        if (this.hardwareInterval) {
            clearInterval(this.hardwareInterval);
            this.hardwareInterval = undefined;
        }
    }

    private setupChannelHandlers() {
        if (!this.channel) return;

        this.channel.onmessage = (e) => {
            const msg = JSON.parse(e.data);

            console.log(msg);

            if (msg.type === "hardware") {
                this.remoteUsage = msg.data;

                this.emit("peerChange", {
                    peerId: this.remote,
                    hardware: msg.data
                });
            }
        };
    }

    public destroy() {
        // Stop periodic work
        this.stopHardwareReport();

        // Close data channel
        if (this.channel) {
            this.channel.onopen = null;
            this.channel.onclose = null;
            this.channel.onmessage = null;
            this.channel.close();
            this.channel = undefined;
        }

        // Remove RTCPeerConnection listeners
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.ondatachannel = null;

        // Close peer connection
        this.pc.close();

        // Clear pending candidates
        this.pendingCandidates.length = 0;

        // Remove EventEmitter listeners
        this.offAll();
    }



    public createOffer = async () => {
        this.channel = this.pc.createDataChannel("data");

        this.channel.onopen = () => {
            console.log(`[${this.remote}] DataChannel open (offerer)`);
            this.setupChannelHandlers();
            this.startHardwareReport();
        };

        this.channel.onclose = () => {
            console.log(`[${this.remote}] DataChannel closed`);
            this.stopHardwareReport();
        };


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