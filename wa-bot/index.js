const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        protocolTimeout: Number(process.env.PUPPETEER_PROTOCOL_TIMEOUT || 300000),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

let isReady = false;

client.on('qr', (qr) => {
    console.log('\n--- SCAN QR CODE INI DENGAN WHATSAPP ANDA ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    isReady = true;
    console.log('WhatsApp Bot is Ready!');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    isReady = false;
});

client.initialize();

// API endpoint untuk mengirim pesan
app.post('/api/send', async (req, res) => {
    if (!isReady) {
        return res.status(503).json({ success: false, error: 'WhatsApp client belum siap.' });
    }

    try {
        const { number, message } = req.body;
        if (!number || !message) {
            return res.status(400).json({ success: false, error: 'number dan message wajib diisi.' });
        }

        // Format nomor agar sesuai dengan WhatsApp (tambahkan @c.us jika belum ada)
        let formattedNumber = number;
        // Ubah 08xxx menjadi 628xxx
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        }
        if (!formattedNumber.endsWith('@c.us')) {
            formattedNumber = `${formattedNumber}@c.us`;
        }

        const response = await client.sendMessage(formattedNumber, message);
        res.json({ success: true, messageId: response.id._serialized });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ success: false, error: error.toString() });
    }
});

app.get('/api/status', (req, res) => {
    res.json({ ready: isReady });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`WhatsApp API Gateway berjalan di port ${PORT}`);
});
