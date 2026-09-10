// pm2 process config so the SAMELCII Node API survives reboots and crashes.
// Setup (run once on the server):
//   npm i -g pm2
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   // then run the command it prints (registers Windows service)
// Manage: pm2 status | pm2 logs samelcii-api | pm2 restart samelcii-api
module.exports = {
  apps: [
    {
      name: 'samelcii-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      // ponytail: fixed 1G ceiling — bump if the API grows heavier report jobs.
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      // pm2 timestamps + rotates these; keeps crash context after an unattended reboot.
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      time: true,
    },
  ],
};
