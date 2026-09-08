const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Создаём папку для фото
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Настройка хранения файлов
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
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB лимит
});

// Отдаём статику
app.use(express.static('public'));

// Обработчик загрузки фото
app.post('/upload', upload.single('photo'), (req, res) => {
    if (req.file) {
        console.log(`📸 Получено фото: ${req.file.filename}`);
        res.json({ 
            success: true, 
            filename: req.file.filename,
            url: `/uploads/${req.file.filename}`
        });
    } else {
        res.status(400).json({ success: false, error: 'Фото не получено' });
    }
});

// Отдаём сохранённые фото
app.use('/uploads', express.static(uploadDir));

// Корневой маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📷 Откройте: http://localhost:${PORT}`);
});