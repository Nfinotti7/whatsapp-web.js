const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('whatsapp-web.js');

const app = express();
const client = new Client();

const path = require('path');
app.use('/files', express.static(path.join(__dirname, 'uploads'))); // Mapeie a pasta onde os arquivos estão


client.initialize();

app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
    const { number, message } = req.body;

    client.sendMessage(`${number}@c.us`, message).then(() => {
        res.status(200).send('Message sent');
    }).catch(err => {
        res.status(500).send('Error:', err);
    });
});

app.listen(3000, () => console.log('Webhook server running on port 3000'));



const axios = require('axios');

const WEBHOOK_URL = 'http://localhost:5678/webhook-test/receive-message';

client.on('message_create', async (message) => {
    try {
        await axios.post(WEBHOOK_URL, {
            from: message.from,
            body: message.body,
            timestamp: message.timestamp
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('Mensagem enviada ao Webhook com sucesso.');
    } catch (err) {
        console.error('Erro ao enviar mensagem ao Webhook:', err.message);
    }
});
