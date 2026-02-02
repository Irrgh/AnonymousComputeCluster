import { Hash, Identity } from './Identity';

export class PeerClient {

    private signal: WebSocket;
    private conf: RTCConfiguration;
    private known: Map<Hash, RTCPeerConnection> = new Map();
    private sessionId: Promise<Hash>;

    constructor(private user: Identity) {
        this.sessionId = this.user.generateSessionId();
        this.conf = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                {
                    urls: "turns:openrelay.metered.ca:443",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                }
            ]
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
        const peer: RTCPeerConnection = new RTCPeerConnection(this.conf);

        peer.createDataChannel("control");

        peer.addEventListener("icecandidate", async (message) => {
            if (message.candidate) {
                this.signal.send(JSON.stringify({
                    type: "candidate",
                    src: await this.sessionId,
                    dest: remote,
                    candidate: message.candidate
                }));
                console.log(message.candidate.candidate);
            }
        });
        peer.addEventListener("icegatheringstatechange", () => {
            console.log("ICE gathering:", peer.iceGatheringState);
        });

        peer.addEventListener("connectionstatechange", () => {
            console.log(`New connection state: ${peer.connectionState}`);
        });


        const offer: RTCSessionDescriptionInit = await peer.createOffer();
        await peer.setLocalDescription(offer);
        this.signal.send(JSON.stringify({
            type: "offer",
            offer: offer,
            src: await this.sessionId,
            dest: remote
        }));
        this.known.set(remote, peer);
    }


    private sendAnswer = async (offer: RTCSessionDescriptionInit, remote: Hash) => {
        const peer: RTCPeerConnection = new RTCPeerConnection(this.conf);

        peer.addEventListener("icecandidate", async (message) => {
            if (message.candidate) {
                this.signal.send(JSON.stringify({
                    type: "candidate",
                    src: await this.sessionId,
                    dest: remote,
                    candidate: message.candidate
                }));
                console.log(message.candidate.candidate);
            }
        });
        peer.addEventListener("icegatheringstatechange", () => {
            console.log("ICE gathering:", peer.iceGatheringState);
        });
        peer.addEventListener("connectionstatechange", () => {
            console.log(`New connection state: ${peer.connectionState}`);
        });


        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer: RTCSessionDescriptionInit = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        this.signal.send(JSON.stringify({
            type: "answer",
            answer: answer,
            src: await this.sessionId,
            dest: remote
        }));
        this.known.set(remote, peer);



    }

    private acceptAnswer = async (answer: RTCSessionDescriptionInit, remote: Hash) => {
        if (!this.known.has(remote)) {
            throw new Error(`Remote client should be on the list of know clients.`);
        }
        const peer: RTCPeerConnection = this.known.get(remote)!;
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
    }

    private addCandidate = async (candidate: RTCIceCandidate, remote: Hash) => {
        if (!this.known.has(remote)) {
            this.known.set(remote, new RTCPeerConnection(this.conf));
        }
        const peer: RTCPeerConnection = this.known.get(remote)!;
        try {
            await peer.addIceCandidate(candidate);
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
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