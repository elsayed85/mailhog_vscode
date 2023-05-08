import * as express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
const cors = require("cors");

export const startProxyServer = () => {
  const app = express();
  app.use(cors()); 
  const port = 1234;

  app.use(
    '/',
    createProxyMiddleware({
      target: 'http://localhost:8025', // Update this to your MailHog API URL
      changeOrigin: true,
    })
  );

  app.listen(port, () => {
    // console.log(`Proxy server listening at http://localhost:${port}`);
  });
};