let app;
let initError = null;

try {
  app = require('../backend/index');
} catch (err) {
  initError = err;
  console.error('[Vercel Serverless Init Error]', err);
}

module.exports = (req, res) => {
  if (initError) {
    console.error('[Vercel Function Error]', initError);
    return res.status(500).json({
      error: 'Backend initialization failed on Vercel',
      message: initError.message,
      stack: process.env.NODE_ENV === 'development' ? initError.stack : undefined
    });
  }
  return app(req, res);
};
