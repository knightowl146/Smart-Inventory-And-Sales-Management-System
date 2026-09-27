const logger = require('../utils/logger');
const env = require('../config/env');

const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;

  // Upload failures arrive here as multer errors with no statusCode, which
  // would otherwise surface as an opaque 500 for something the person can fix
  // themselves - a photo that is simply too large.
  //
  // A rejected file type needs no case here: the upload filter sets
  // statusCode 415 on the error it raises.
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'That file is too large. Keep it under 8MB.';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Attach exactly one file, as the "invoice" field.';
  }

  if (!statusCode) {
    statusCode = 500;
  }

  res.locals.errorMessage = err.message;

  const response = {
    success: false,
    code: statusCode,
    message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  if (env.NODE_ENV === 'development') {
    logger.error(err);
  } else if (statusCode === 500) {
    // Only log 500 errors in production to avoid spam
    logger.error(err);
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
