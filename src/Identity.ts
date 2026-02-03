
export type Hash = string;

export class Identity {

    private keyPair: CryptoKeyPair;

    constructor(keyPair: CryptoKeyPair) {
        this.keyPair = keyPair;
    }

    public async generateSessionId(): Promise<string> {
        const exported = await crypto.subtle.exportKey("spki", this.keyPair.publicKey);
        const hash = await crypto.subtle.digest("SHA-256", exported);
        return new Uint8Array(hash).toBase64({omitPadding:true});
    }

    public static async FromFile(file: File): Promise<Identity> {
        const text = await file.text();
        const { publicKey: jwkPublic, privateKey: jwkPrivate } = JSON.parse(text);

        const publicKey = await crypto.subtle.importKey(
            "jwk",
            jwkPublic,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["verify"]
        );

        const privateKey = await crypto.subtle.importKey(
            "jwk",
            jwkPrivate,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign"]
        );

        return new Identity({ publicKey, privateKey });
    }

    public async exportToFile(): Promise<void> {
        const jwkPrivate = await crypto.subtle.exportKey("jwk", this.keyPair.privateKey);
        const jwkPublic = await crypto.subtle.exportKey("jwk", this.keyPair.publicKey);

        const blob = new Blob(
            [JSON.stringify({ publicKey: jwkPublic, privateKey: jwkPrivate }, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "session-key.json";
        a.click();
        URL.revokeObjectURL(url);
    }


    public static async generate(): Promise<Identity> {
        const keyPair: CryptoKeyPair = await crypto.subtle.generateKey(
            {
                name: "ECDSA",
                namedCurve: "P-256",
            },
            true,
            ["sign", "verify"]
        );
        return new Identity(keyPair);
    }


}