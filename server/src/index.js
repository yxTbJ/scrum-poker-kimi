import { createApp } from './app.js';

const port = Number(process.env.PORT) || 4000;

const { server } = createApp();
server.listen(port, () => {
  console.log(`Скрам-покер запущен: http://localhost:${port}`);
});
