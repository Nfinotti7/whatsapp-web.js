const { Client, MessageMedia, LocalAuth} = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const WEBHOOK_URL = 'http://localhost:5678/webhook/receive-message';


// Middleware para parsear JSON
app.use(express.json());

// Servir arquivos estáticos da pasta Downloads
app.use('/files', express.static(path.join(__dirname, 'Downloads')));

// Inicializa o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),

    puppeteer: {
        args: ['--disable-logging', '--no-sandbox', '--disable-setuid-sandbox'],
    },
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('Client is ready!'));

client.initialize();



// Função para converter áudio para OGG Opus
function convertToOpus(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const command = `ffmpeg -i "${inputPath}" -c:a libopus -b:a 64k "${outputPath}" -y`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Erro no FFmpeg:', stderr);
                return reject(error);
            }
            resolve(outputPath);
        });
    });
}

// Função para download do arquivo
async function downloadFromUrl(url, outputPath) {
    try {
        if (url.includes('drive.google.com')) {
            const fileId = url.includes('/d/') ? url.split('/d/')[1].split('/')[0] : url.split('id=')[1];
            url = `https://drive.google.com/uc?export=download&id=${fileId}`;
        }
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(outputPath, Buffer.from(response.data, 'binary'));
    } catch (err) {
        throw new Error(`Erro ao baixar o arquivo: ${err.message}`);
    }
}

// Função para garantir que a pasta exista
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
}

// Enviar mensagens recebidas para o Webhook
client.on('message_create', async message => {
    try {
        console.log('Mensagem recebida:', message.body);

        // Envia mensagem para o webhook
        await axios.post(WEBHOOK_URL, {
            from: message.from,
            body: message.body,
            timestamp: message.timestamp,
            type: message.type,
        });
        console.log('Mensagem enviada ao Webhook com sucesso.');
    } catch (err) {
        console.error('Erro ao enviar mensagem ao Webhook:', err.message);
    }
});

// Endpoint para enviar áudio como mensagem de voz
app.post('/send-voice', async (req, res) => {
    const { to, mediaUrl } = req.body;

    if (!to || !mediaUrl) return res.status(400).send('É necessário enviar "to" e "mediaUrl".');

    const inputPath = path.join(__dirname, 'Downloads', 'temp_audio.mp3');
    const outputPath = path.join(__dirname, 'Downloads', 'temp_audio.ogg');

    try {
        ensureDirectoryExistence(inputPath);

        await downloadFromUrl(mediaUrl, inputPath); // Baixar arquivo

        await convertToOpus(inputPath, outputPath); // Converter para Opus

        const media = MessageMedia.fromFilePath(outputPath);
        await client.sendMessage(to, media, { sendAudioAsVoice: true });

        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);

        res.send('Áudio enviado como mensagem de voz com sucesso!');
    } catch (err) {
        console.error('Erro detalhado ao enviar áudio:', {
            message: err.message,
            stack: err.stack,
        });
        res.status(500).send('Erro ao enviar a mensagem.');
    }
});

// Endpoint para enviar mensagens de texto ou mídia
app.post('/send-message', async (req, res) => {
    const { to, message, mediaUrl, mediaType } = req.body;

    if (!to) return res.status(400).send('O campo "to" é obrigatório.');

    try {
        if (mediaUrl && mediaType) {
            // Validar se a URL é absoluta
            if (!/^https?:\/\/.+$/.test(mediaUrl)) {
                return res.status(400).send('A URL fornecida para a mídia não é válida.');
            }
            const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
            await client.sendMessage(to, media);
            return res.send('Mídia enviada com sucesso!');
        } else if (message) {
            await client.sendMessage(to, message); // Enviar mensagem de texto
            return res.send('Mensagem enviada com sucesso!');
        } else {
            return res.status(400).send('É necessário enviar "message" ou "mediaUrl".');
        }
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        res.status(500).send('Erro ao enviar a mensagem.');
    }
});

// Rota de teste do servidor
app.get('/', (req, res) => res.send('Servidor rodando e integrado ao WhatsApp!'));

// Iniciar o servidor
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
