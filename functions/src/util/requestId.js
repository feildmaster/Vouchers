const PATTERN = /^[\w-]{8,100}$/;

module.exports = (requestId) => typeof requestId === 'string' && PATTERN.test(requestId);
