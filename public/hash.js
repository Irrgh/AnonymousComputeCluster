export const main = async (arrayBuffer) => {
    const hash = await self.crypto.subtle.digest("SHA-512",arrayBuffer);
    return hash;
} 