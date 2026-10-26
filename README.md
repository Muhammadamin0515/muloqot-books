# Muloqot Books — Telegram Mini App

Литературная платформа (RU/UZ): каталог, читалка, библиотека, сообщество, студия автора (демо).

## Запуск
```
npm install
npm run dev      # локально, в браузере работает и без Telegram
npm run build    # статика в dist/ для хостинга по HTTPS
```

## Подключение к Telegram
1. Задеплойте `dist/` на любой HTTPS-хостинг (Vercel, Netlify, GitHub Pages).
2. В @BotFather: `/newapp` (или `/setmenubutton`) и укажите URL.
3. Опционально `VITE_APP_LINK=https://t.me/<bot>/<app>` в `.env` — ссылка для «Поделиться».

Интеграция в `src/telegram.js`: ready/expand, имя и язык из профиля, кнопка «Назад»,
цвета шапки под тему, haptics, safe-area, шаринг. Вне Telegram всё это no-op.

## Структура
`src/data.js` данные · `src/i18n.js` строки · `src/art.js` SVG-обложки/иконки · `src/app.js` экраны и логика · `src/styles.css`.

Данные пока демо и хранятся в localStorage; следующий шаг — бэкенд с проверкой `initData`.
