// pm2 process config for the HRC news refresh loop.
// The script has its own 10-minute setInterval; pm2 keeps the single long-lived
// process alive and restarts it if it crashes. cwd is pinned so the relative
// data/*.json writes land in the project, not wherever pm2 was launched.
module.exports = {
  apps: [
    {
      name: 'hrc-refresh',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'scripts/refresh-loop.ts',
      cwd: 'C:/Users/anjan/hrc-news-engine',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      time: true,
    },
  ],
};
