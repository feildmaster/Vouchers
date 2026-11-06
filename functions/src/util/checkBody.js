const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

module.exports = function checkBody(body, allowed) {
  if (!isPlainObject(body)) return 'Invalid request body';
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  return unknown.length ? `Unknown properties: ${unknown.join(', ')}` : undefined;
};
