import express from "express";
import https from "https";
import { WebSocketServer } from "ws";
import fs from "fs";


const app = express();

app.use(express.static("public", {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store");
    }
}));

const options = {
  key: fs.readFileSync("key.pem"),
  cert: fs.readFileSync("cert.pem"),
};

const server = https.createServer(options,app);
const wss = new WebSocketServer({ server });

server.listen(3001, () => {
    console.log("Server running at https://localhost:3001");
});

const clients = new Map();

wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        console.log(data);

        switch (data.type) {
            case "advertise": advertise(data,ws); break;
            default: pass(data); break;
        }


    });

    ws.on("close", () => {
        
    });
});



const advertise = (data, ws) => {
    const { hash } = data;
    clients.set(hash,ws);
    for (const [peerHash,socket] of clients) {
        if (peerHash !== hash && socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify(data));
        }
    }

}

const pass = (data) => {
    const ws = clients.get(data.dest);
    if (ws) {
        ws.send(JSON.stringify(data));
    }
}