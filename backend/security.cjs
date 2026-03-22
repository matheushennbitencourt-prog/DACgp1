const crypto = require('crypto');
const dns = require('dns/promises');

const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
const DOMAIN_CACHE_TTL_MS = 10 * 60 * 1000;
const DNS_VALIDATION_TIMEOUT_MS = 150;
const domainValidationCache = new Map();
const PASSWORD_TOO_SHORT_MESSAGE = 'A senha deve ter pelo menos 8 caracteres.';
const PASSWORD_HAS_SPACES_MESSAGE = 'A senha nao pode conter espacos.';
const PASSWORD_MISSING_LOWERCASE_MESSAGE = 'A senha deve incluir pelo menos uma letra minuscula.';
const PASSWORD_MISSING_UPPERCASE_MESSAGE = 'A senha deve incluir pelo menos uma letra maiuscula.';
const PASSWORD_MISSING_NUMBER_MESSAGE = 'A senha deve incluir pelo menos um numero.';
const PASSWORD_MISSING_SPECIAL_MESSAGE = 'A senha deve incluir pelo menos um caractere especial.';
const SECURE_THEMES = new Set(['brand', 'dark', 'white']);
let lastEmailInput = null;
let lastEmailOutput = '';
let lastValidEmailInput = null;
let lastValidEmailOutput = false;
let lastPasswordInput = null;
let lastPasswordOutput = '';

function assertSecureRuntimeConfig(config) {
  if (!config?.isProduction) {
    return;
  }

  if (config.storageDriver !== 'postgres') {
    throw new Error('Em producao, defina STORAGE_DRIVER=postgres para evitar persistencia local sensivel.');
  }

  if (!config.databaseUrl) {
    throw new Error('Em producao, DATABASE_URL e obrigatoria.');
  }

  if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.length === 0) {
    throw new Error('Em producao, configure ALLOWED_ORIGINS com os domínios autorizados do frontend.');
  }
}

function isAllowedOrigin(origin, allowedOrigins = []) {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function createCorsOriginValidator(config) {
  const allowedOrigins = Array.isArray(config?.allowedOrigins) ? config.allowedOrigins : [];

  if (!config?.isProduction && allowedOrigins.length === 0) {
    return (_origin, callback) => callback(null, true);
  }

  return (origin, callback) => {
    if (isAllowedOrigin(origin, allowedOrigins)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origem nao autorizada por CORS.'));
  };
}

function applySecurityHeaders(req, res, next, { isProduction = false } = {}) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/profile')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  next();
}

function isDigitCode(code) {
  return code >= 48 && code <= 57;
}

function isLowercaseCode(code) {
  return code >= 97 && code <= 122;
}

function isUppercaseCode(code) {
  return code >= 65 && code <= 90;
}

function isAlphaCode(code) {
  return isLowercaseCode(code) || isUppercaseCode(code);
}

function isAlphaNumericCode(code) {
  return isAlphaCode(code) || isDigitCode(code);
}

function isWhitespaceCode(code) {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11;
}

function normalizeEmail(email) {
  const input = String(email || '');

  if (input === lastEmailInput) {
    return lastEmailOutput;
  }

  const normalized = input.trim().toLowerCase();
  lastEmailInput = input;
  lastEmailOutput = normalized;
  return normalized;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalHash] = String(storedHash || '').split(':');

  if (!salt || !originalHash) {
    return false;
  }

  const derivedKey = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');

  return crypto.timingSafeEqual(
    Buffer.from(originalHash, 'hex'),
    Buffer.from(derivedKey, 'hex'),
  );
}

function getPasswordSecurityMessage(password) {
  const value = String(password || '');

  if (value === lastPasswordInput) {
    return lastPasswordOutput;
  }

  let hasWhitespace = false;
  let hasLowercase = false;
  let hasUppercase = false;
  let hasNumber = false;
  let hasSpecial = false;

  if (value.length < 8) {
    lastPasswordInput = value;
    lastPasswordOutput = PASSWORD_TOO_SHORT_MESSAGE;
    return lastPasswordOutput;
  }

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);

    if (isWhitespaceCode(charCode)) {
      hasWhitespace = true;
      continue;
    }

    if (isLowercaseCode(charCode)) {
      hasLowercase = true;
      continue;
    }

    if (isUppercaseCode(charCode)) {
      hasUppercase = true;
      continue;
    }

    if (isDigitCode(charCode)) {
      hasNumber = true;
      continue;
    }

    hasSpecial = true;
  }

  if (hasWhitespace) {
    lastPasswordInput = value;
    lastPasswordOutput = PASSWORD_HAS_SPACES_MESSAGE;
    return lastPasswordOutput;
  }

  if (!hasLowercase) {
    lastPasswordInput = value;
    lastPasswordOutput = PASSWORD_MISSING_LOWERCASE_MESSAGE;
    return lastPasswordOutput;
  }

  if (!hasUppercase) {
    lastPasswordInput = value;
    lastPasswordOutput = PASSWORD_MISSING_UPPERCASE_MESSAGE;
    return lastPasswordOutput;
  }

  if (!hasNumber) {
    lastPasswordInput = value;
    lastPasswordOutput = PASSWORD_MISSING_NUMBER_MESSAGE;
    return lastPasswordOutput;
  }

  if (!hasSpecial) {
    lastPasswordInput = value;
    lastPasswordOutput = PASSWORD_MISSING_SPECIAL_MESSAGE;
    return lastPasswordOutput;
  }

  lastPasswordInput = value;
  lastPasswordOutput = '';
  return lastPasswordOutput;
}

function isValidEmail(email) {
  if (email === lastValidEmailInput) {
    return lastValidEmailOutput;
  }

  const normalizedEmail = normalizeEmail(email);
  const atIndex = normalizedEmail.indexOf('@');

  if (
    atIndex <= 0 ||
    atIndex !== normalizedEmail.lastIndexOf('@') ||
    atIndex === normalizedEmail.length - 1
  ) {
    lastValidEmailInput = email;
    lastValidEmailOutput = false;
    return false;
  }

  const localPart = normalizedEmail.slice(0, atIndex);
  const domainPart = normalizedEmail.slice(atIndex + 1);
  const lastDotIndex = domainPart.lastIndexOf('.');

  if (lastDotIndex <= 0 || lastDotIndex === domainPart.length - 1) {
    lastValidEmailInput = email;
    lastValidEmailOutput = false;
    return false;
  }

  for (let index = 0; index < localPart.length; index += 1) {
    const charCode = localPart.charCodeAt(index);

    if (
      !isAlphaNumericCode(charCode) &&
      charCode !== 46 &&
      charCode !== 95 &&
      charCode !== 37 &&
      charCode !== 43 &&
      charCode !== 45
    ) {
      lastValidEmailInput = email;
      lastValidEmailOutput = false;
      return false;
    }
  }

  for (let index = 0; index < domainPart.length; index += 1) {
    const charCode = domainPart.charCodeAt(index);

    if (!isAlphaNumericCode(charCode) && charCode !== 46 && charCode !== 45) {
      lastValidEmailInput = email;
      lastValidEmailOutput = false;
      return false;
    }
  }

  for (let index = lastDotIndex + 1; index < domainPart.length; index += 1) {
    if (!isAlphaCode(domainPart.charCodeAt(index))) {
      lastValidEmailInput = email;
      lastValidEmailOutput = false;
      return false;
    }
  }

  lastValidEmailInput = email;
  lastValidEmailOutput = domainPart.length - lastDotIndex - 1 >= 2;
  return lastValidEmailOutput;
}

function getCachedDomainValidation(domain) {
  const cachedEntry = domainValidationCache.get(domain);

  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    domainValidationCache.delete(domain);
    return null;
  }

  return cachedEntry.value;
}

function setCachedDomainValidation(domain, value) {
  domainValidationCache.set(domain, {
    value,
    expiresAt: Date.now() + DOMAIN_CACHE_TTL_MS,
  });
}

function createTimeoutPromise(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
}

async function resolveDomainFast(domain) {
  const resolvers = [
    dns.resolveMx(domain).then((records) => records.length > 0).catch(() => false),
    dns.resolve4(domain).then((records) => records.length > 0).catch(() => false),
    dns.resolve6(domain).then((records) => records.length > 0).catch(() => false),
  ];

  return Promise.any(
    resolvers.map((resolver) => resolver.then((isValid) => {
      if (isValid) {
        return true;
      }

      throw new Error('No records');
    })),
  )
    .catch(() => false);
}

async function hasResolvableEmailDomain(email) {
  const normalizedEmail = normalizeEmail(email);
  const domain = normalizedEmail.split('@')[1];

  if (!domain) {
    return false;
  }

  const cachedValue = getCachedDomainValidation(domain);
  if (cachedValue !== null) {
    return cachedValue;
  }

  const result = await Promise.race([
    resolveDomainFast(domain),
    createTimeoutPromise(DNS_VALIDATION_TIMEOUT_MS),
  ]);

  // Em caso de timeout da infraestrutura DNS, nao bloqueamos o fluxo.
  // O formato do e-mail continua validado localmente e dominios responsivos entram em cache.
  if (result === null) {
    return true;
  }

  setCachedDomainValidation(domain, result);
  return result;
}

module.exports = {
  DNS_VALIDATION_TIMEOUT_MS,
  SECURE_THEMES,
  applySecurityHeaders,
  assertSecureRuntimeConfig,
  createCorsOriginValidator,
  getPasswordSecurityMessage,
  hasResolvableEmailDomain,
  hashPassword,
  isAllowedOrigin,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
};
