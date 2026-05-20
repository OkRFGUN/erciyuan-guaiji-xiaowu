const path = require('path');
const ncm = require('NeteaseCloudMusicApi');

ncm.server.serveNcmApi({
  port: 3001,
  host: '127.0.0.1',
});
