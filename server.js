const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== TELEGRAM НАСТРОЙКИ =====
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8349177937:AAHKmVLvSCK16t1HnYjPbzE0svFu73TnjvE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '7438864168';

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

// ===== ОТПРАВКА В TELEGRAM =====
async function sendPhotoToTelegram(filePath, filename) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`;
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('photo', fs.createReadStream(filePath));
        formData.append('caption', `📸 Новое фото\n🕐 ${new Date().toLocaleString('ru-RU')}\n📁 ${filename}`);
        
        const response = await axios.post(url, formData, {
            headers: { ...formData.getHeaders() },
            timeout: 10000
        });
        
        console.log('✅ Фото отправлено в Telegram');
        return response.data;
    } catch (err) {
        console.error('❌ Ошибка отправки в Telegram:', err.response?.data || err.message);
        throw err;
    }
}

// ===== ОБРАБОТЧИК =====
app.post('/upload', upload.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Фото не получено' });
    }

    try {
        const filePath = req.file.path;
        const filename = req.file.filename;
        
        console.log(`📸 Получено фото: ${filename}`);
        await sendPhotoToTelegram(filePath, filename);
        
        // Удаляем после отправки
        fs.unlink(filePath, (err) => {
            if (err) console.error('Ошибка удаления файла:', err);
            else console.log('🗑️ Файл удалён');
        });
        
        res.json({ success: true, filename });
    } catch (err) {
        console.error('Ошибка обработки:', err);
        res.status(500).json({ success: false, error: 'Ошибка отправки в Telegram' });
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