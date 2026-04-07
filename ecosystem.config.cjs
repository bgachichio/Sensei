module.exports = {
  apps: [{
    name: 'sensei',
    script: './packages/server/src/index.js',
    node_args: '--max-old-space-size=384',
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production',
      SENSEI_PORT: 8082,
      SENSEI_DATA_DIR: process.env.HOME + '/sensei-data'
    },
    // Logging
    error_file: './logs/sensei-error.log',
    out_file: './logs/sensei-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // Restart policy
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 3000
  }]
};
