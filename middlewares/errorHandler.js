const logger = require('../utils/logger');
const env = require('../config/env');

const errorHandler = (err, req, res, next) => {
  let { statusCode, message } = err;
  
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

  console.error("DEBUG ERROR: ", err);

  if (env.NODE_ENV === 'development') {
    logger.error(err);
  } else if (statusCode === 500) {
    // Only log 500 errors in production to avoid spam
    logger.error(err);
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
