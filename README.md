# Bracteate Builder (static)

Полностью клиентская версия калькулятора брактеата — без Python-сервера и PostgreSQL. Подходит для GitHub Pages и любого статического хостинга.

## Запуск локально

```powershell
cd web-static
py -m http.server 8080
```

Откройте http://127.0.0.1:8080/

> Нужен простой HTTP-сервер: ES-модули и `fetch("data/game-data.json")` не работают при открытии `index.html` напрямую через `file://`.

## Обновление данных

После изменения CSV в `data/tables/`:

```powershell
py web-static/scripts/build_data.py
```

Скрипт пересобирает `web-static/data/game-data.json` из таблиц проекта.

## Экспорт / импорт JSON

Формат **тот же**, что в версии `web/`:

```json
{
  "format": "bracteate_build",
  "version": 1,
  "name": "Мой брактеат",
  "saved_at": "2026-07-12T12:00:00.000Z",
  "build": {
    "disk": "ultimate",
    "character_level": 59,
    "eternal": [{ "type_id": "moon", "level": 3 }],
    "reincarnation": [{ "type_id": "birth", "level": 3 }],
    "chaos": { "class_id": "shengtang", "variant_id": "sharp", "level": 1 }
  }
}
```

- **JSON ↓ / Поделиться** — скачать файл сборки
- **JSON ↑** — загрузить файл (можно из другой версии приложения)
- **Сохранить / Загрузить** — до 30 сборок в `localStorage` браузера

## GitHub Pages

1. Залейте репозиторий на GitHub
2. Settings → Pages → Source: branch, folder **`/web-static`**
3. Сайт будет доступен по адресу `https://<user>.github.io/<repo>/`

## Структура

```
web-static/
  index.html          — UI
  css/style.css
  js/
    app.js            — интерфейс
    calculator.js     — расчёт бонусов (порт backend/calculator.py)
    builds.js         — export/import + localStorage
    config.js
  data/game-data.json — сгенерированные таблицы
  scripts/build_data.py
```
