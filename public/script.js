const video = document.getElementById('video');
const statusDiv = document.getElementById('status');
const preview = document.getElementById('preview');
const photoInfo = document.getElementById('photoInfo');
const retryBtn = document.getElementById('retryBtn');

let stream = null;
let isPhotoTaken = false;

// Функция для установки статуса
function setStatus(text, type = 'info') {
    statusDiv.textContent = text;
    statusDiv.className = type;
}

// Функция для отправки фото
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
            retryBtn.style.display = 'inline-block';
        } else {
            setStatus('❌ Ошибка сервера: ' + (result.error || 'неизвестная'), 'error');
            retryBtn.style.display = 'inline-block';
        }
    } catch (err) {
        console.error('Ошибка отправки:', err);
        setStatus('❌ Ошибка отправки: ' + err.message, 'error');
        retryBtn.style.display = 'inline-block';
    }
}

// Функция для съёмки фото
function takePhoto() {
    if (!stream) {
        setStatus('⚠️ Камера не готова', 'warning');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Отражаем зеркально
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    
    const photoData = canvas.toDataURL('image/jpeg', 0.9);
    
    // Показываем превью
    preview.src = photoData;
    preview.style.display = 'block';
    
    setStatus('📸 Фото сделано! Отправка...', 'info');
    
    sendPhoto(photoData);
    isPhotoTaken = true;
}

// Конвертация dataURL → Blob
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

// Запуск камеры и авто-фото
async function startCameraAndCapture() {
    try {
        setStatus('📷 Запрос доступа к камере...', 'info');
        
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
        
        setStatus('✅ Камера включена! Сейчас сфотографируем...', 'success');
        
        // Ждём 1 секунду для стабилизации кадра
        setTimeout(() => {
            takePhoto();
        }, 1000);
        
    } catch (err) {
        console.error('Ошибка камеры:', err);
        let errorMsg = '❌ Не удалось получить доступ к камере';
        if (err.name === 'NotAllowedError') {
            errorMsg = '❌ Доступ к камере запрещен. Разрешите доступ в браузере.';
        } else if (err.name === 'NotFoundError') {
            errorMsg = '❌ Камера не найдена. Проверьте подключение.';
        }
        setStatus(errorMsg, 'error');
        retryBtn.style.display = 'inline-block';
    }
}

// Обработчик кнопки "Сделать ещё"
retryBtn.addEventListener('click', () => {
    if (!stream) {
        startCameraAndCapture();
        return;
    }
    takePhoto();
});

// Закрытие стрима при уходе со страницы
window.addEventListener('beforeunload', () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});

// === ЗАПУСК ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ===
document.addEventListener('DOMContentLoaded', () => {
    startCameraAndCapture();
});