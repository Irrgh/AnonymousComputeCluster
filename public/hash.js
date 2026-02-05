export const main = async (str) => {
    const buf = TextEncoder().encode(str).buffer;
    let hash = await self.crypto.subtle.digest("SHA-256", buf);

    for (let i = 0; i < 10; i++) {
        hash = new Uint8Array(
            await crypto.subtle.digest("SHA-256", hash)
        );
    }

    return hash.toHex();
} 