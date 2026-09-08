const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ TELEGRAM =====
const TELEGRAM_TOKEN = '8349177937:AAHKmVLvSCK16t1HnYjPbzE0svFu73TnjvE'; // ВАШ ТОКЕН
const TELEGRAM_CHAT_ID = '7438864168'; // ВАШ TELEGRAM ID

// Создаём папку для временного хранения
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Настройка multer (сохраняем временно на диск)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `photo_${timestamp}.jpg`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Отдаём статику
app.use(express.static('public'));

// Функция отправки фото в Telegram
async function sendPhotoToTelegram(filePath, filename) {
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`;
        
        // Создаём FormData для отправки файла
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('photo', fs.createReadStream(filePath));
        formData.append('caption', `📸 Новое фото\n🕐 ${new Date().toLocaleString('ru-RU')}\n📁 ${filename}`);
        
        const response = await axios.post(url, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });
        
        console.log('✅ Фото отправлено в Telegram:', response.data.result.photo);
        return response.data;
    } catch (err) {
        console.error('❌ Ошибка отправки в Telegram:', err.response?.data || err.message);
        throw err;
    }
}

// Обработчик загрузки фото
app.post('/upload', upload.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Фото не получено' });
    }

    try {
        const filePath = req.file.path;
        const filename = req.file.filename;
        
        console.log(`📸 Получено фото: ${filename}`);
        
        // ===== ОТПРАВКА В TELEGRAM =====
        await sendPhotoToTelegram(filePath, filename);
        
        // Опционально: удаляем файл после отправки (чтобы не занимал место)
        fs.unlink(filePath, (err) => {
            if (err) console.error('Ошибка удаления файла:', err);
            else console.log('🗑️ Временный файл удалён');
        });
        
        res.json({ 
            success: true, 
            filename: filename,
            telegram: '✅ Отправлено в Telegram'
        });
        
    } catch (err) {
        console.error('Ошибка обработки:', err);
        res.status(500).json({ success: false, error: 'Ошибка отправки в Telegram' });
    }
});

// Корневой маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🤖 Telegram бот настроен для отправки фото`);
});