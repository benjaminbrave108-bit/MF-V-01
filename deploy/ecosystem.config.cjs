// Example pm2 config, alternative to deploy/mfv01.service.
// Usage: pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "mfv01",
      script: "server.mjs",
      cwd: __dirname + "/..",
      env_file: ".env.local",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
    },
  ],
};
