# Скрам-покер

Веб-приложение для planning poker: React-клиент + Node.js/WebSocket-сервер. Комнаты с синхронизацией в реальном времени, роли администратор/участник, настраиваемый набор карт.

## Возможности

- Комнаты с кодом входа и ссылкой-приглашением
- Обязательный ввод имени для всех участников
- Роли: администратор (создатель комнаты) голосует, вскрывает карты, начинает новый раунд и настраивает набор; участник только голосует
- Набор карт: по умолчанию целые числа 1–30; администратор может убирать и добавлять карты (целые числа 1–100, без повторов); изменение набора сбрасывает голоса
- Среднее значение при вскрытии карт
- Диаграммы при вскрытии: вертикальные столбики и круговая с процентами
- Аватарки участников с инициалами — генерируются локально из id, без внешних сервисов
- Сессии: администратор запускает («Начать сессию») и завершает («Закончить сессию») голосование; карты доступны только во время сессии, набор карт блокируется на её время
- Каждый участник может сбросить свой выбор, вернув статус «думает»

## Запуск для разработки

```bash
npm install
npm run dev
```

Клиент: http://localhost:5173 (проксирует API и WebSocket на сервер :4000).

## Продакшн-запуск локально

```bash
npm install
npm run build
npm start        # http://localhost:4000
```

## Docker (локально)

```bash
docker compose up --build
# http://localhost:4000
```

## Fly.io (PaaS, деплой из Dockerfile)

В репозитории готовый `fly.toml` (регион Варшава, 512 МБ, авто-stop выключен — состояние в памяти). Приложение будет доступно по адресу `https://<имя-приложения>.fly.dev` с автоматическим HTTPS.

```bash
winget install --id Fly-io.flyctl        # или: iwr https://fly.io/install.ps1 -useb | iex
fly auth login                           # вход через браузер
git clone https://github.com/yxTbJ/scrum-poker-kimi.git
cd scrum-poker-kimi
fly launch    # подхватит существующий fly.toml; имя/регион можно оставить как есть
fly scale count 1                        # строго одна машина (состояние в памяти)
fly deploy
```

Проверка: `curl https://scrum-poker-kimi.fly.dev/api/health` → `{"ok":true}`. Обновления — `git pull && fly deploy`.

## Автодеплой из GitHub (GitHub Actions)

В репозитории лежит `.github/workflows/deploy.yml` — при пуше в `main` GitHub Actions сам деплоит приложение на Fly. Нужно один раз:

```bash
# 1. Выполнить там, где flyctl авторизован (токен — только для этого приложения)
fly tokens create deploy -a scrum-poker-kimi

# 2. GitHub → репозиторий → Settings → Secrets and variables → Actions → New repository secret:
#    имя FLY_API_TOKEN, значение — вывод команды выше
```

Каждый следующий пуш в `main` на GitHub запустит деплой (вкладка Actions). Помните: деплой пересоздаёт машину — комнаты сбрасываются, деплойте между сессиями.

## Деплой на VPS (интернет, автоматический HTTPS)

Понадобятся: VPS с Ubuntu 24.04 (минимальный тарифа хватит) и домен с A-записью на IP сервера.

```bash
# 1. На сервере: Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # перелогиниться

# 2. Залить код проекта в /opt/scrum-poker (git clone или scp, см. ниже)
# 3. В Caddyfile заменить poker.example.com на свой домен

# 4. Запуск
cd /opt/scrum-poker
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy сам получит сертификат Let's Encrypt, как только домен начнёт резолвиться в IP сервера (нужны открытые порты 80/443). Проверка: `curl https://ВАШ-ДОМЕН/api/health` → `{"ok":true}`.

Перенос кода на сервер без GitHub (с машины с проектом):

```bash
tar czf /tmp/scrum-poker.tar.gz --exclude=node_modules --exclude=.git .
scp /tmp/scrum-poker.tar.gz root@IP_СЕРВЕРА:/tmp/
ssh root@IP_СЕРВЕРА "mkdir -p /opt/scrum-poker && tar xzf /tmp/scrum-poker.tar.gz -C /opt/scrum-poker"
```

Обновление после правок кода: перезалить код и повторить шаг 4.

## Тесты

```bash
npm test
```

Включает unit-тесты валидации набора карт и интеграционный тест двух клиентов через WebSocket (сценарий: создание комнаты → вход по коду → настройка набора → голосование → отказ в правах участника → вскрытие → среднее → новый раунд).

## Структура

```
server/            Node.js: http API + WebSocket, состояние комнат в памяти
  src/rooms.js     доменная логика: комнаты, роли, валидация набора карт
  src/app.js       HTTP-маршруты, статика клиента, WS-протокол
  test/            node:test — unit + интеграция
client/            React + Vite
  src/App.jsx      экран входа, восстановление сессии по ?room=КОД
  src/RoomScreen.jsx  стол, участники, колода, панель администратора
  src/DeckSettings.jsx настройка набора карт (только администратор, вне сессии)
  src/VoteChart.jsx  вертикальные столбики распределения голосов
  src/PieChart.jsx   круговая диаграмма с процентами
```

## Протокол

- `POST /api/rooms` `{name}` → `{code, token, state}` — создание комнаты (создатель = администратор)
- `POST /api/rooms/:code/join` `{name}` → `{token, state}` — вход участника
- `WS /ws?token=…` — JSON-сообщения: клиент → `start_session`, `end_session`, `vote` `{value}`, `clear_vote`, `reveal`, `reset`, `update_deck` `{deck}`; сервер → `state` (после каждого изменения), `error`. `state` включает `sessionActive`: голосование возможно только во время активной сессии, `update_deck` — только вне её

Порт сервера задаётся переменной `PORT` (по умолчанию 4000).
