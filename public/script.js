const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const startBtn = document.getElementById('startCamera');
const statusDiv = document.getElementById('status');
const preview = document.getElementById('preview');
const photoInfo = document.getElementById('photoInfo');

let stream = null;
let isCameraReady = false;

// Включение камеры
startBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });
        
        video.srcObject = stream;
        await video.play();
        
        isCameraReady = true;
        captureBtn.disabled = false;
        startBtn.textContent = '✅ Камера включена';
        startBtn.classList.add('active');
        setStatus('✅ Камера готова! Нажмите "Сфотографировать"', 'success');
        
    } catch (err) {
        console.error('Ошибка камеры:', err);
        let errorMsg = 'Не удалось получить доступ к камере';
        if (err.name === 'NotAllowedError') {
            errorMsg = '❌ Доступ к камере запрещен. Разрешите доступ в браузере.';
        } else if (err.name === 'NotFoundError') {
            errorMsg = '❌ Камера не найдена. Проверьте подключение.';
        }
        setStatus(errorMsg, 'error');
        captureBtn.disabled = true;
    }
});

// Фотографирование
captureBtn.addEventListener('click', () => {
    if (!isCameraReady) {
        setStatus('⚠️ Сначала включите камеру!', 'error');
        return;
    }

    // Создаём canvas и делаем снимок
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Отражаем зеркально
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    
    // Получаем данные фото
    const photoData = canvas.toDataURL('image/jpeg', 0.9);
    
    // Показываем превью
    preview.src = photoData;
    preview.style.display = 'block';
    
    setStatus('📸 Фото сделано! Отправка на сервер...', 'info');
    
    // Отправляем на сервер
    sendPhoto(photoData);
});

// Отправка фото на сервер
async function sendPhoto(dataUrl) {
    try {
        const blob = dataURLToBlob(dataUrl);
        const formData = new FormData();
        formData.append('photo', blob, 'photo.jpg');
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            const date = new Date().toLocaleString('ru-RU');
            photoInfo.textContent = `✅ Сохранено: ${result.filename} | ${date}`;
            setStatus('✅ Фото успешно сохранено на сервере!', 'success');
            console.log('📁 Фото сохранено:', result.url);
        } else {
            setStatus('❌ Ошибка сервера: ' + (result.error || 'неизвестная'), 'error');
        }
    } catch (err) {
        console.error('Ошибка отправки:', err);
        setStatus('❌ Ошибка отправки: ' + err.message, 'error');
    }
}

// Вспомогательная функция: dataURL → Blob
function dataURLToBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const b64 = atob(parts[1]);
    const byteArray = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) {
        byteArray[i] = b64.charCodeAt(i);
    }
    return new Blob([byteArray], { type: mime });
}

// Установка статуса
function setStatus(text, type = 'info') {
    statusDiv.textContent = text;
    statusDiv.className = type;
}

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});